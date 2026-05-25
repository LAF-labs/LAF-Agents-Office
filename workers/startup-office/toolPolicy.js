const {
  STARTUP_OFFICE_APPROVAL_ACTIONS,
  startupOfficeApprovalPolicy,
} = require("../../api/lib/startup-office/approvalPolicy");

const STARTUP_OFFICE_TOOL_POLICY_VERSION = "startup-office-loop-tool-policy.v1";

const READ_CONTEXT_TOOLS = Object.freeze([
  "company_profile",
  "wiki_memory",
  "uploaded_assets",
  "customer_records",
  "signals",
  "receipts",
  "previous_artifacts",
]);

const WRITE_TRACE_TOOLS = Object.freeze([
  "artifact_writer",
  "approval_request",
  "receipt_writer",
]);

const BLOCKED_EXECUTION_TOOLS = Object.freeze([
  "ad_spend",
  "contract_signature",
  "customer_email_sender",
  "payment_capture",
  "public_publisher",
  "sms_sender",
  "workspace_data_export_without_owner",
]);

const LOOP_TOOL_POLICY_MANIFEST = deepFreeze({
  "customer-discovery": {
    allowed_tools: [
      ...READ_CONTEXT_TOOLS,
      "browser_research",
      "customer_list_builder",
      "interview_guide_drafter",
      "outreach_draft_writer",
      ...WRITE_TRACE_TOOLS,
    ],
    external_actions: ["customer_promise", "external_send", "public_claim"],
    purpose:
      "Draft customer discovery targets, interview guides, and outbound copy for founder approval.",
  },
  "idea-validation": {
    allowed_tools: [
      ...READ_CONTEXT_TOOLS,
      "assumption_mapper",
      "browser_research",
      "evidence_planner",
      "market_research_summarizer",
      ...WRITE_TRACE_TOOLS,
    ],
    external_actions: ["customer_promise", "public_claim"],
    purpose:
      "Turn company context and supplied evidence into a falsifiable startup validation plan.",
  },
  "launch-campaign": {
    allowed_tools: [
      ...READ_CONTEXT_TOOLS,
      "browser_research",
      "campaign_planner",
      "copy_drafter",
      "experiment_designer",
      ...WRITE_TRACE_TOOLS,
    ],
    external_actions: ["external_send", "payment", "public_claim", "publish"],
    purpose:
      "Draft launch channels, copy, experiments, and metrics without publishing or spending.",
  },
  "offer-package": {
    allowed_tools: [
      ...READ_CONTEXT_TOOLS,
      "browser_research",
      "objection_drafter",
      "offer_designer",
      "pricing_hypothesis_builder",
      ...WRITE_TRACE_TOOLS,
    ],
    external_actions: ["customer_promise", "payment", "pricing_change", "public_claim", "publish"],
    purpose:
      "Draft a paid-beta offer, pricing hypothesis, and sales copy for founder review.",
  },
  "weekly-operator-review": {
    allowed_tools: [
      ...READ_CONTEXT_TOOLS,
      "metrics_reviewer",
      "priority_planner",
      "risk_reviewer",
      ...WRITE_TRACE_TOOLS,
    ],
    external_actions: ["legal_sensitive", "payment", "public_claim"],
    purpose:
      "Review workspace operating state and suggest next loops without reaching outside company context.",
  },
});

const FALLBACK_LOOP_TOOL_POLICY = deepFreeze({
  allowed_tools: [
    ...READ_CONTEXT_TOOLS,
    "assumption_mapper",
    ...WRITE_TRACE_TOOLS,
  ],
  external_actions: STARTUP_OFFICE_APPROVAL_ACTIONS.map((action) => action.type),
  purpose: "Run a conservative Startup Office draft with founder approval controls.",
});

function startupOfficeLoopToolPolicy({ approvalPolicy = null, loop = {} } = {}) {
  const loopSlug = String(loop?.slug || "").trim();
  const manifest = LOOP_TOOL_POLICY_MANIFEST[loopSlug] || FALLBACK_LOOP_TOOL_POLICY;
  const policy = startupOfficeApprovalPolicy(approvalPolicy);
  const declaredExternalActions = new Set(manifest.external_actions || []);
  const externalActions = Object.fromEntries(
    STARTUP_OFFICE_APPROVAL_ACTIONS.map((action) => [
      action.type,
      {
        declared_by_loop: declaredExternalActions.has(action.type),
        execution: "never_auto_execute",
        mode: policy.action_modes[action.type] || "approval_required",
      },
    ]),
  );

  return deepFreeze({
    allowed_tools: normalizeList(manifest.allowed_tools),
    disallowed_tools: normalizeList(BLOCKED_EXECUTION_TOOLS),
    external_actions: externalActions,
    guarantees: [
      "The worker may draft artifacts, approvals, and receipts only.",
      "The worker may not send messages, publish pages, capture payments, sign contracts, or spend money.",
      "Any customer-facing, public, commercial, legal-sensitive, or irreversible action remains founder-controlled.",
    ],
    loop_slug: loopSlug,
    purpose: manifest.purpose,
    version: STARTUP_OFFICE_TOOL_POLICY_VERSION,
  });
}

function startupOfficeToolPolicyAllows(policy, toolName) {
  const tool = normalizeToolName(toolName);
  if (!tool) return false;
  const allowed = new Set(normalizeList(policy?.allowed_tools));
  const blocked = new Set(normalizeList(policy?.disallowed_tools));
  return allowed.has(tool) && !blocked.has(tool);
}

function normalizeList(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(normalizeToolName).filter(Boolean))];
}

function normalizeToolName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const item of Object.values(value)) deepFreeze(item);
  return value;
}

module.exports = {
  BLOCKED_EXECUTION_TOOLS,
  LOOP_TOOL_POLICY_MANIFEST,
  STARTUP_OFFICE_TOOL_POLICY_VERSION,
  startupOfficeLoopToolPolicy,
  startupOfficeToolPolicyAllows,
};
