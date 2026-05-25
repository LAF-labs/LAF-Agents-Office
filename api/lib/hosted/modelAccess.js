function normalizeModelMode(raw) {
  const value = String(raw || "").trim();
  return ["laf_model", "record_only"].includes(value)
    ? value
    : "record_only";
}

function createHostedModelAccess(deps) {
  const {
    createHTTPError,
    hasPermission,
    managedModelEnabled,
    requireUser,
    rest,
    writeJSON,
  } = deps;

  async function modelAvailabilityForMembership(membership) {
    let billingRows = [];
    try {
      billingRows = await rest("workspace_billing", {
        query: { team_id: `eq.${membership.team_id}`, select: "*", limit: "1" },
      });
    } catch {
      billingRows = [];
    }
    const billing = billingRows?.[0] || null;
    const paid = billing ? Boolean(billing.laf_model_enabled) : managedModelEnabled();
    const lafAllowed = paid && hasPermission(membership, "model:use_laf");
    const allowedModes = ["record_only"];
    if (lafAllowed) allowedModes.unshift("laf_model");
    return {
      default_mode: lafAllowed ? "laf_model" : "record_only",
      allowed_modes: allowedModes,
      laf_model: {
        available: lafAllowed,
        reason: lafAllowed
          ? ""
          : paid
            ? "permission required: model:use_laf"
            : "workspace is not on a paid managed-model plan",
      },
      record_only: {
        available: true,
        reason: "records chat without agent execution",
      },
      reason: billing
        ? "workspace billing loaded from DB"
        : "workspace billing uses environment fallback",
    };
  }

  async function resolveAllowedModelMode(membership, rawMode) {
    const mode = normalizeModelMode(rawMode);
    if (mode === "record_only") return mode;
    const availability = await modelAvailabilityForMembership(membership);
    if (!availability.allowed_modes.includes(mode)) {
      throw createHTTPError(
        403,
        availability[mode]?.reason || `model mode unavailable: ${mode}`,
      );
    }
    return mode;
  }

  async function handleModelAvailability(req, res) {
    const { membership } = await requireUser(req);
    writeJSON(res, 200, await modelAvailabilityForMembership(membership));
  }

  return {
    availability: handleModelAvailability,
    modelAvailabilityForMembership,
    resolveAllowedModelMode,
  };
}

module.exports = {
  createHostedModelAccess,
  normalizeModelMode,
};
