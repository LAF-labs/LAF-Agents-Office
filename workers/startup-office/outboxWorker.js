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
  nowISO = () => new Date().toISOString(),
  updateNotification,
} = {}) {
  return async function deliverOutboxEvent(event) {
    if (event.source_table === "startup_office_notifications") {
      if (typeof updateNotification !== "function") {
        throw new Error("notification delivery provider is not configured");
      }
      const deliveredAt = nowISO();
      await updateNotification(event.source_id, {
        sent_at: deliveredAt,
        status: "sent",
      });
      return { channel: "in_app_notification", delivered_at: deliveredAt };
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

function defaultRetryDelayMs(attempts) {
  const exponent = Math.max(0, Math.min(Number(attempts || 1) - 1, 5));
  return 30000 * 2 ** exponent;
}

function defaultTruncateText(value, max) {
  return String(value || "").slice(0, max);
}

module.exports = {
  createStartupOfficeOutboxDeliveryProvider,
  createStartupOfficeOutboxWorker,
  defaultRetryDelayMs,
};
