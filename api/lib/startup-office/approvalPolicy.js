const STARTUP_OFFICE_APPROVAL_ACTIONS = Object.freeze([
  Object.freeze({
    label: "Customer promise",
    legacy_key: "customer_promises",
    type: "customer_promise",
  }),
  Object.freeze({
    label: "Outbound messages",
    legacy_key: "outbound_messages",
    type: "external_send",
  }),
  Object.freeze({
    label: "Legal-sensitive language",
    legacy_key: "legal_sensitive_language",
    type: "legal_sensitive",
  }),
  Object.freeze({
    label: "Payment or spend",
    legacy_key: "spend",
    type: "payment",
  }),
  Object.freeze({
    label: "Pricing changes",
    legacy_key: "pricing_changes",
    type: "pricing_change",
  }),
  Object.freeze({
    label: "Public claims",
    legacy_key: "public_claims",
    type: "public_claim",
  }),
  Object.freeze({
    label: "Publishing",
    legacy_key: "publishing",
    type: "publish",
  }),
]);

const DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY = Object.freeze({
  require_citations_for_public_claims: true,
  revision_enabled: true,
  support_access: Object.freeze({
    logged: true,
    time_bound_hours: 24,
    visible_to_owner: true,
  }),
});

function startupOfficeApprovalPolicy(settingsOrPolicy = null) {
  const raw = rawApprovalPolicy(settingsOrPolicy);
  const explicitModes = objectValue(raw.action_modes || raw.approval_modes);
  const approvalRequired = objectValue(raw.founder_approval_required);
  const draftOnly = objectValue(raw.auto_draft_only || raw.draft_only);
  const actionModes = {};
  const founderApprovalRequired = {};
  const autoDraftOnly = {};

  for (const action of STARTUP_OFFICE_APPROVAL_ACTIONS) {
    const mode = approvalModeForAction({
      action,
      approvalRequired,
      draftOnly,
      explicitModes,
    });
    const required = mode === "approval_required";
    actionModes[action.type] = mode;
    founderApprovalRequired[action.type] = required;
    founderApprovalRequired[action.legacy_key] = required;
    autoDraftOnly[action.type] = !required;
    autoDraftOnly[action.legacy_key] = !required;
  }

  const supportAccess = objectValue(raw.support_access);
  return {
    action_modes: actionModes,
    actions: STARTUP_OFFICE_APPROVAL_ACTIONS.map((action) => ({
      label: action.label,
      mode: actionModes[action.type],
      type: action.type,
    })),
    auto_draft_only: autoDraftOnly,
    founder_approval_required: founderApprovalRequired,
    require_citations_for_public_claims:
      raw.require_citations_for_public_claims === undefined
        ? DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.require_citations_for_public_claims
        : booleanValue(raw.require_citations_for_public_claims, true),
    revision_enabled:
      raw.revision_enabled === undefined
        ? DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.revision_enabled
        : booleanValue(raw.revision_enabled, true),
    support_access: {
      ...DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.support_access,
      ...supportAccess,
      logged: supportAccess.logged === undefined ? true : booleanValue(supportAccess.logged, true),
      time_bound_hours: clamp(
        Number(supportAccess.time_bound_hours || DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.support_access.time_bound_hours),
        1,
        168,
      ),
      visible_to_owner:
        supportAccess.visible_to_owner === undefined
          ? true
          : booleanValue(supportAccess.visible_to_owner, true),
    },
  };
}

function startupOfficeApprovalDecision(policyInput, gates = []) {
  const policy = startupOfficeApprovalPolicy(policyInput);
  const approvalGates = (Array.isArray(gates) ? gates : []).map((gate) => {
    const type = normalizeApprovalActionType(gate?.type);
    const mode = policy.action_modes[type] || "approval_required";
    return {
      ...gate,
      mode,
      required: mode === "approval_required",
    };
  });
  return {
    approval_gates: approvalGates,
    approval_mode:
      approvalGates.length > 0 && approvalGates.every((gate) => gate.mode === "draft_only")
        ? "draft_only"
        : "approval_required",
    approval_policy: {
      action_modes: policy.action_modes,
      require_citations_for_public_claims: policy.require_citations_for_public_claims,
      revision_enabled: policy.revision_enabled,
    },
    approval_required:
      approvalGates.length === 0 || approvalGates.some((gate) => gate.required !== false),
  };
}

function mergeStartupOfficeApprovalPolicyPatch(currentPolicy, incomingPolicy) {
  const current = objectValue(currentPolicy);
  const incoming = objectValue(incomingPolicy);
  return {
    ...current,
    ...incoming,
    action_modes: {
      ...objectValue(current.action_modes || current.approval_modes),
      ...objectValue(incoming.action_modes || incoming.approval_modes),
    },
    auto_draft_only: {
      ...objectValue(current.auto_draft_only || current.draft_only),
      ...objectValue(incoming.auto_draft_only || incoming.draft_only),
    },
    founder_approval_required: {
      ...objectValue(current.founder_approval_required),
      ...objectValue(incoming.founder_approval_required),
    },
    support_access: {
      ...objectValue(current.support_access),
      ...objectValue(incoming.support_access),
    },
  };
}

function approvalModeForAction({ action, approvalRequired, draftOnly, explicitModes }) {
  const explicitMode = normalizeApprovalMode(
    valueForAction(explicitModes, action),
  );
  if (explicitMode) return explicitMode;
  const draftOnlyValue = optionalBoolean(valueForAction(draftOnly, action));
  if (draftOnlyValue === true) return "draft_only";
  const requiredValue = optionalBoolean(valueForAction(approvalRequired, action));
  if (requiredValue === false) return "draft_only";
  return "approval_required";
}

function valueForAction(record, action) {
  if (!record || typeof record !== "object") return undefined;
  if (Object.prototype.hasOwnProperty.call(record, action.type)) return record[action.type];
  if (Object.prototype.hasOwnProperty.call(record, action.legacy_key)) {
    return record[action.legacy_key];
  }
  return undefined;
}

function rawApprovalPolicy(settingsOrPolicy) {
  const value = objectValue(settingsOrPolicy);
  const preferences = objectValue(value.preferences);
  if (preferences.startup_office_approval_policy !== undefined) {
    return objectValue(preferences.startup_office_approval_policy);
  }
  if (value.startup_office_approval_policy !== undefined) {
    return objectValue(value.startup_office_approval_policy);
  }
  return value;
}

function normalizeApprovalActionType(type) {
  const raw = String(type || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const action = STARTUP_OFFICE_APPROVAL_ACTIONS.find(
    (item) => item.type === raw || item.legacy_key === raw,
  );
  return action?.type || raw;
}

function normalizeApprovalMode(value) {
  const raw = String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
  if (["approval", "approval_required", "required", "require_approval"].includes(raw)) {
    return "approval_required";
  }
  if (["auto_draft", "auto_draft_only", "draft", "draft_only"].includes(raw)) {
    return "draft_only";
  }
  return "";
}

function optionalBoolean(value) {
  if (value === undefined || value === null) return undefined;
  return booleanValue(value, undefined);
}

function booleanValue(value, fallback) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value || "").trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(raw)) return true;
  if (["0", "false", "no", "n", "off"].includes(raw)) return false;
  return fallback;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

module.exports = {
  DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY,
  STARTUP_OFFICE_APPROVAL_ACTIONS,
  mergeStartupOfficeApprovalPolicyPatch,
  startupOfficeApprovalDecision,
  startupOfficeApprovalPolicy,
};
