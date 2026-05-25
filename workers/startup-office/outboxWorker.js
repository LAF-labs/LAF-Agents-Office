function createStartupOfficeOutboxWorker({
  claimOutboxEvent,
  deliverOutboxEvent,
  nowISO = () => new Date().toISOString(),
  retryDelayMs = defaultRetryDelayMs,
  truncateText = defaultTruncateText,
  updateOutboxEvent,
}) {
  if (typeof claimOutboxEvent !== "function") {
    throw new TypeError("claimOutboxEvent is required");
  }
  if (typeof deliverOutboxEvent !== "function") {
    throw new TypeError("deliverOutboxEvent is required");
  }
  if (typeof updateOutboxEvent !== "function") {
    throw new TypeError("updateOutboxEvent is required");
  }

  async function processOne() {
    const event = await claimOutboxEvent();
    if (!event?.id) {
      return { event: null, status: "idle" };
    }

    try {
      const delivery = await deliverOutboxEvent(event);
      const deliveredAt = nowISO();
      await updateOutboxEvent(event.id, {
        last_error: "",
        locked_at: null,
        processed_at: deliveredAt,
        status: "delivered",
        updated_at: deliveredAt,
      });
      return { delivery, event, status: "delivered" };
    } catch (err) {
      const failedAt = nowISO();
      const attempts = Number(event.attempts || 0);
      const maxAttempts = Number(event.max_attempts || 1);
      const exhausted = attempts >= maxAttempts;
      const status = exhausted ? "dead_letter" : "failed";
      const patch = {
        last_error: truncateText(err?.message || "outbox delivery failed", 2000),
        locked_at: null,
        processed_at: exhausted ? failedAt : null,
        status,
        updated_at: failedAt,
      };
      if (!exhausted) {
        patch.available_at = new Date(
          Date.parse(failedAt) + retryDelayMs(attempts),
        ).toISOString();
      }
      await updateOutboxEvent(event.id, patch);
      return { error: patch.last_error, event, status };
    }
  }

  async function processBatch({ limit = 10 } = {}) {
    const max = Math.max(1, Math.min(Number(limit) || 10, 100));
    const results = [];
    for (let index = 0; index < max; index += 1) {
      const result = await processOne();
      if (result.status === "idle") break;
      results.push(result);
    }
    return {
      delivered: results.filter((item) => item.status === "delivered").length,
      dead_letter: results.filter((item) => item.status === "dead_letter").length,
      failed: results.filter((item) => item.status === "failed").length,
      processed: results.length,
      results,
    };
  }

  return { processBatch, processOne };
}

function createStartupOfficeOutboxDeliveryProvider({
  appURL = "",
  emailProvider = null,
  lookupRecipient = null,
  nowISO = () => new Date().toISOString(),
  updateNotification,
} = {}) {
  return async function deliverOutboxEvent(event) {
    if (event.source_table === "startup_office_notifications") {
      if (typeof updateNotification !== "function") {
        throw new Error("notification delivery provider is not configured");
      }
      const deliveredAt = nowISO();
      let emailDelivery = null;
      if (emailProvider) {
        if (typeof lookupRecipient !== "function") {
          throw new Error("notification recipient lookup is not configured");
        }
        const recipientID = objectValue(event.payload).recipient_user_id;
        const recipient = await lookupRecipient(recipientID);
        const email = notificationEmail(event, recipient, { appURL });
        emailDelivery = await emailProvider.sendEmail(email);
      }
      const notificationPayload = objectValue(objectValue(event.payload).payload);
      const patch = {
        sent_at: deliveredAt,
        status: "sent",
      };
      if (emailDelivery) {
        patch.payload = {
          ...notificationPayload,
          email_delivery: {
            delivered_at: deliveredAt,
            message_id: emailDelivery.message_id || "",
            provider: emailDelivery.provider || "email",
          },
        };
      }
      await updateNotification(event.source_id, {
        ...patch,
      });
      return {
        channel: emailDelivery ? "email" : "in_app_notification",
        delivered_at: deliveredAt,
        message_id: emailDelivery?.message_id || "",
        provider: emailDelivery?.provider || "in_app",
      };
    }

    if (
      event.source_table === "startup_office_receipts" ||
      event.source_table === "startup_office_usage_events"
    ) {
      return { channel: "internal_ledger", delivered_at: nowISO() };
    }

    throw new Error(`unsupported outbox source table: ${event.source_table || "unknown"}`);
  };
}

function createResendEmailProvider({
  apiKey,
  fetchImpl = fetch,
  from,
  replyTo = "",
} = {}) {
  if (!apiKey) throw new Error("RESEND_API_KEY is required");
  if (!from) throw new Error("LAF_EMAIL_FROM is required");
  if (typeof fetchImpl !== "function") throw new Error("fetch implementation is required");

  return {
    async sendEmail(email) {
      const response = await fetchImpl("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          html: email.html,
          reply_to: replyTo || undefined,
          subject: email.subject,
          text: email.text,
          to: email.to,
        }),
      });
      const text = await response.text();
      let payload = {};
      try {
        payload = text ? JSON.parse(text) : {};
      } catch {
        payload = {};
      }
      if (!response.ok) {
        throw new Error(
          payload?.message || payload?.error || text || response.statusText || "email provider failed",
        );
      }
      return {
        message_id: payload.id || "",
        provider: "resend",
      };
    },
  };
}

function notificationEmail(event, recipient, { appURL = "" } = {}) {
  const email = String(recipient?.email || "").trim();
  if (!email) throw new Error("notification recipient email is missing");
  const eventType = String(event.event_type || "").replace(/^notification\./, "");
  const payload = objectValue(objectValue(event.payload).payload);
  const runID = payload.run_id || "";
  const title = notificationTitle(eventType);
  const action = notificationAction(eventType);
  const url = String(appURL || "").replace(/\/+$/, "");
  const link = url ? `${url}/startup-office${runID ? `/runs/${encodeURIComponent(runID)}` : ""}` : "";
  const name = recipient?.name || recipient?.user_metadata?.name || email;
  const lines = [
    `Hi ${name},`,
    "",
    action,
    runID ? `Run ID: ${runID}` : "",
    link ? `Open Startup Office: ${link}` : "",
    "",
    "LAF Startup Office",
  ].filter(Boolean);
  return {
    html: lines.map((line) => `<p>${escapeHTML(line)}</p>`).join(""),
    subject: title,
    text: lines.join("\n"),
    to: email,
  };
}

function notificationTitle(eventType) {
  if (eventType === "approval_waiting") return "Startup Office approval is waiting";
  if (eventType === "run_failed") return "Startup Office run failed";
  return "Startup Office notification";
}

function notificationAction(eventType) {
  if (eventType === "approval_waiting") {
    return "A Startup Office draft is ready for founder review.";
  }
  if (eventType === "run_failed") {
    return "A Startup Office run failed and needs operator attention.";
  }
  return "There is a new Startup Office notification.";
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function escapeHTML(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function defaultRetryDelayMs(attempts) {
  const exponent = Math.max(0, Math.min(Number(attempts || 1) - 1, 5));
  return 30000 * 2 ** exponent;
}

function defaultTruncateText(value, max) {
  return String(value || "").slice(0, max);
}

module.exports = {
  createResendEmailProvider,
  createStartupOfficeOutboxDeliveryProvider,
  createStartupOfficeOutboxWorker,
  defaultRetryDelayMs,
  notificationEmail,
};
