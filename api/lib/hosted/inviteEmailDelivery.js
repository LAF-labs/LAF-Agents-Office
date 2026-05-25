const {
  createResendEmailProvider: defaultCreateResendEmailProvider,
} = require("../../../workers/startup-office/outboxWorker");

function createHostedInviteEmailDelivery(options = {}) {
  const createHTTPError = options.createHTTPError || defaultHTTPError;
  const createResendEmailProvider =
    options.createResendEmailProvider || defaultCreateResendEmailProvider;
  const env = options.env || process.env;

  async function sendInviteEmail(email) {
    const provider = inviteEmailProviderFromEnv();
    if (!provider) return null;
    return provider.sendEmail(email);
  }

  function inviteEmailProviderFromEnv() {
    const provider = String(env.LAF_OUTBOX_EMAIL_PROVIDER || "in_app")
      .trim()
      .toLowerCase();
    if (!provider || provider === "in_app" || provider === "none") return null;
    if (provider === "resend") {
      return createResendEmailProvider({
        apiKey: env.RESEND_API_KEY || "",
        from: env.LAF_EMAIL_FROM || "",
        replyTo: env.LAF_EMAIL_REPLY_TO || "",
      });
    }
    throw createHTTPError(503, `unsupported LAF_OUTBOX_EMAIL_PROVIDER: ${provider}`);
  }

  return {
    inviteEmailProviderFromEnv,
    sendInviteEmail,
  };
}

function defaultHTTPError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

module.exports = {
  createHostedInviteEmailDelivery,
};
