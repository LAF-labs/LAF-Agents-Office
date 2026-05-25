const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createHostedInviteEmailDelivery,
} = require("./inviteEmailDelivery");

function createHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function delivery(options = {}) {
  const calls = { factories: [], sends: [] };
  return {
    calls,
    inviteEmailDelivery: createHostedInviteEmailDelivery({
      createHTTPError,
      createResendEmailProvider(config) {
        calls.factories.push(config);
        return {
          sendEmail(email) {
            calls.sends.push(email);
            return { message_id: "msg-1", provider: "resend" };
          },
        };
      },
      env: {},
      ...options,
    }),
  };
}

test("in-app and none invite email providers do not send external email", async () => {
  for (const provider of ["", "in_app", "none"]) {
    const { calls, inviteEmailDelivery } = delivery({
      env: { LAF_OUTBOX_EMAIL_PROVIDER: provider },
    });

    assert.equal(inviteEmailDelivery.inviteEmailProviderFromEnv(), null);
    assert.equal(await inviteEmailDelivery.sendInviteEmail({ to: "member@example.com" }), null);
    assert.deepEqual(calls.factories, []);
    assert.deepEqual(calls.sends, []);
  }
});

test("resend provider receives hosted email configuration and sends invites", async () => {
  const { calls, inviteEmailDelivery } = delivery({
    env: {
      LAF_EMAIL_FROM: "Office <founder@example.com>",
      LAF_EMAIL_REPLY_TO: "support@example.com",
      LAF_OUTBOX_EMAIL_PROVIDER: " Resend ",
      RESEND_API_KEY: "resend-key",
    },
  });

  const result = await inviteEmailDelivery.sendInviteEmail({
    subject: "Invite",
    to: "member@example.com",
  });

  assert.deepEqual(calls.factories, [
    {
      apiKey: "resend-key",
      from: "Office <founder@example.com>",
      replyTo: "support@example.com",
    },
  ]);
  assert.deepEqual(calls.sends, [{ subject: "Invite", to: "member@example.com" }]);
  assert.deepEqual(result, { message_id: "msg-1", provider: "resend" });
});

test("unsupported invite email providers fail with a deploy-time configuration error", () => {
  const { inviteEmailDelivery } = delivery({
    env: { LAF_OUTBOX_EMAIL_PROVIDER: "smtp" },
  });

  assert.throws(
    () => inviteEmailDelivery.inviteEmailProviderFromEnv(),
    (err) =>
      err.status === 503 &&
      err.message === "unsupported LAF_OUTBOX_EMAIL_PROVIDER: smtp",
  );
});
