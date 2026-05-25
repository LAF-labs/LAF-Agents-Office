const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createResendEmailProvider,
  createStartupOfficeOutboxDeliveryProvider,
  createStartupOfficeOutboxWorker,
  defaultRetryDelayMs,
  notificationEmail,
} = require("./outboxWorker");

const now = "2026-05-25T10:00:00.000Z";

test("outbox worker idles when no due event is claimed", async () => {
  const worker = createStartupOfficeOutboxWorker({
    async claimOutboxEvent() {
      return null;
    },
    async deliverOutboxEvent() {
      throw new Error("should not deliver");
    },
    nowISO: () => now,
    async updateOutboxEvent() {
      throw new Error("should not update");
    },
  });

  assert.deepEqual(await worker.processOne(), { event: null, status: "idle" });
});

test("outbox worker delivers notification events through the provider", async () => {
  const updates = [];
  const notificationUpdates = [];
  const provider = createStartupOfficeOutboxDeliveryProvider({
    nowISO: () => now,
    async updateNotification(id, patch) {
      notificationUpdates.push({ id, patch });
    },
  });
  const worker = createStartupOfficeOutboxWorker({
    async claimOutboxEvent() {
      return {
        attempts: 1,
        id: "outbox-1",
        max_attempts: 5,
        source_id: "notification-1",
        source_table: "startup_office_notifications",
      };
    },
    deliverOutboxEvent: provider,
    nowISO: () => now,
    async updateOutboxEvent(id, patch) {
      updates.push({ id, patch });
    },
  });

  const result = await worker.processOne();

  assert.equal(result.status, "delivered");
  assert.deepEqual(notificationUpdates, [
    {
      id: "notification-1",
      patch: {
        sent_at: now,
        status: "sent",
      },
    },
  ]);
  assert.deepEqual(updates, [
    {
      id: "outbox-1",
      patch: {
        last_error: "",
        locked_at: null,
        processed_at: now,
        status: "delivered",
        updated_at: now,
      },
    },
  ]);
});

test("outbox worker sends configured email notifications and records provider metadata", async () => {
  const sentEmails = [];
  const notificationUpdates = [];
  const provider = createStartupOfficeOutboxDeliveryProvider({
    appURL: "https://office.example.com",
    emailProvider: {
      async sendEmail(email) {
        sentEmails.push(email);
        return { message_id: "email-1", provider: "fake-email" };
      },
    },
    async lookupRecipient(userID) {
      assert.equal(userID, "user-1");
      return { email: "founder@example.com", name: "Founder" };
    },
    nowISO: () => now,
    async updateNotification(id, patch) {
      notificationUpdates.push({ id, patch });
    },
  });
  const worker = createStartupOfficeOutboxWorker({
    async claimOutboxEvent() {
      return {
        attempts: 1,
        event_type: "notification.approval_waiting",
        id: "outbox-1",
        max_attempts: 5,
        payload: {
          payload: { run_id: "run-1", status: "waiting_approval" },
          recipient_user_id: "user-1",
        },
        source_id: "notification-1",
        source_table: "startup_office_notifications",
      };
    },
    deliverOutboxEvent: provider,
    nowISO: () => now,
    async updateOutboxEvent() {},
  });

  const result = await worker.processOne();

  assert.equal(result.status, "delivered");
  assert.equal(result.delivery.channel, "email");
  assert.equal(sentEmails[0].to, "founder@example.com");
  assert.equal(sentEmails[0].subject, "Startup Office approval is waiting");
  assert.match(sentEmails[0].text, /run-1/);
  assert.match(sentEmails[0].text, /https:\/\/office\.example\.com\/startup-office\/runs\/run-1/);
  assert.deepEqual(notificationUpdates, [
    {
      id: "notification-1",
      patch: {
        payload: {
          email_delivery: {
            delivered_at: now,
            message_id: "email-1",
            provider: "fake-email",
          },
          run_id: "run-1",
          status: "waiting_approval",
        },
        sent_at: now,
        status: "sent",
      },
    },
  ]);
});

test("notification email requires a recipient email and escapes html", () => {
  assert.throws(
    () => notificationEmail({ event_type: "notification.run_failed" }, {}),
    /recipient email is missing/,
  );
  const email = notificationEmail(
    {
      event_type: "notification.run_failed",
      payload: {
        payload: { run_id: "run<script>" },
      },
    },
    { email: "founder@example.com", name: "<Founder>" },
  );
  assert.equal(email.subject, "Startup Office run failed");
  assert.match(email.html, /&lt;Founder&gt;/);
  assert.match(email.html, /run&lt;script&gt;/);
});

test("resend email provider posts the expected payload and returns message id", async () => {
  const calls = [];
  const provider = createResendEmailProvider({
    apiKey: "resend-key",
    fetchImpl: async (url, options) => {
      calls.push({ options, url });
      return {
        ok: true,
        async text() {
          return JSON.stringify({ id: "resend-message-1" });
        },
      };
    },
    from: "LAF <founder@example.com>",
    replyTo: "support@example.com",
  });

  const result = await provider.sendEmail({
    html: "<p>Hello</p>",
    subject: "Hello",
    text: "Hello",
    to: "founder@example.com",
  });

  assert.deepEqual(result, { message_id: "resend-message-1", provider: "resend" });
  assert.equal(calls[0].url, "https://api.resend.com/emails");
  assert.equal(calls[0].options.headers.Authorization, "Bearer resend-key");
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    from: "LAF <founder@example.com>",
    html: "<p>Hello</p>",
    reply_to: "support@example.com",
    subject: "Hello",
    text: "Hello",
    to: "founder@example.com",
  });
});

test("resend email provider surfaces provider errors", async () => {
  const provider = createResendEmailProvider({
    apiKey: "resend-key",
    fetchImpl: async () => ({
      ok: false,
      statusText: "Bad Request",
      async text() {
        return JSON.stringify({ message: "domain is not verified" });
      },
    }),
    from: "LAF <founder@example.com>",
  });

  await assert.rejects(
    () => provider.sendEmail({ html: "", subject: "", text: "", to: "a@example.com" }),
    /domain is not verified/,
  );
});

test("outbox worker retries failed deliveries with backoff", async () => {
  const updates = [];
  const worker = createStartupOfficeOutboxWorker({
    async claimOutboxEvent() {
      return {
        attempts: 2,
        id: "outbox-2",
        max_attempts: 5,
        source_table: "startup_office_notifications",
      };
    },
    async deliverOutboxEvent() {
      throw new Error("provider unavailable");
    },
    nowISO: () => now,
    async updateOutboxEvent(id, patch) {
      updates.push({ id, patch });
    },
  });

  const result = await worker.processOne();

  assert.equal(result.status, "failed");
  assert.equal(updates[0].id, "outbox-2");
  assert.equal(updates[0].patch.status, "failed");
  assert.equal(updates[0].patch.last_error, "provider unavailable");
  assert.equal(updates[0].patch.locked_at, null);
  assert.equal(updates[0].patch.processed_at, null);
  assert.equal(
    updates[0].patch.available_at,
    new Date(Date.parse(now) + defaultRetryDelayMs(2)).toISOString(),
  );
});

test("outbox worker dead-letters exhausted deliveries", async () => {
  const updates = [];
  const worker = createStartupOfficeOutboxWorker({
    async claimOutboxEvent() {
      return {
        attempts: 5,
        id: "outbox-3",
        max_attempts: 5,
        source_table: "startup_office_notifications",
      };
    },
    async deliverOutboxEvent() {
      throw new Error("mailbox rejected");
    },
    nowISO: () => now,
    async updateOutboxEvent(id, patch) {
      updates.push({ id, patch });
    },
  });

  const result = await worker.processOne();

  assert.equal(result.status, "dead_letter");
  assert.deepEqual(updates, [
    {
      id: "outbox-3",
      patch: {
        last_error: "mailbox rejected",
        locked_at: null,
        processed_at: now,
        status: "dead_letter",
        updated_at: now,
      },
    },
  ]);
});

test("outbox worker processes bounded batches", async () => {
  const events = [
    { attempts: 1, id: "outbox-1", max_attempts: 5, source_table: "startup_office_receipts" },
    { attempts: 1, id: "outbox-2", max_attempts: 5, source_table: "startup_office_usage_events" },
    null,
  ];
  const updates = [];
  const provider = createStartupOfficeOutboxDeliveryProvider({
    nowISO: () => now,
  });
  const worker = createStartupOfficeOutboxWorker({
    async claimOutboxEvent() {
      return events.shift();
    },
    deliverOutboxEvent: provider,
    nowISO: () => now,
    async updateOutboxEvent(id, patch) {
      updates.push({ id, patch });
    },
  });

  const result = await worker.processBatch({ limit: 10 });

  assert.equal(result.processed, 2);
  assert.equal(result.delivered, 2);
  assert.equal(result.failed, 0);
  assert.equal(updates.length, 2);
});
