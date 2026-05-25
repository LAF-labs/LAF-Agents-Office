const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeOutboxDeliveryProvider,
  createStartupOfficeOutboxWorker,
  defaultRetryDelayMs,
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
