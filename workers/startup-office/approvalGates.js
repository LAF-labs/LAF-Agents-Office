const APPROVAL_GATE_DEFINITIONS = Object.freeze({
  customer_promise: Object.freeze({
    category: "external_impact",
    label: "Customer promise",
    reason: "Customer-facing promises must be reviewed before external use.",
    type: "customer_promise",
  }),
  external_send: Object.freeze({
    category: "external_impact",
    label: "External send",
    reason: "Outbound messages and customer contact must be approved before sending.",
    type: "external_send",
  }),
  legal_sensitive: Object.freeze({
    category: "external_impact",
    label: "Legal-sensitive action",
    reason: "Legal, compliance, refund, contract, privacy, or regulated claims need review.",
    type: "legal_sensitive",
  }),
  payment: Object.freeze({
    category: "external_impact",
    label: "Payment or spend",
    reason: "Payment requests, charges, deposits, budgets, and paid spend require approval.",
    type: "payment",
  }),
  pricing_change: Object.freeze({
    category: "external_impact",
    label: "Pricing change",
    reason: "Pricing and commercial terms must be approved before external use.",
    type: "pricing_change",
  }),
  public_claim: Object.freeze({
    category: "external_impact",
    label: "Public claim",
    reason: "Public claims need founder review and source discipline before publication.",
    type: "public_claim",
  }),
  publish: Object.freeze({
    category: "external_impact",
    label: "Publish",
    reason: "Public pages, posts, launches, and campaign publication require approval.",
    type: "publish",
  }),
});

const REQUIRED_EXTERNAL_APPROVAL_GATE_TYPES = Object.freeze([
  "external_send",
  "publish",
  "payment",
  "legal_sensitive",
]);

const GATE_ALIASES = Object.freeze({
  ad_spend: "payment",
  budget_change: "payment",
  customer_facing: "customer_promise",
  customer_promise: "customer_promise",
  external_send: "external_send",
  legal: "legal_sensitive",
  legal_sensitive: "legal_sensitive",
  outbound_message: "external_send",
  outbound_messages: "external_send",
  paid_spend: "payment",
  payment: "payment",
  pricing: "pricing_change",
  pricing_change: "pricing_change",
  public_claim: "public_claim",
  publish: "publish",
  publish_public: "publish",
  send_external: "external_send",
  spend_money: "payment",
});

function approvalGatesFor({ output = null, template = null } = {}) {
  const gates = new Map();
  for (const gate of templateGates(template)) {
    addGate(gates, gate, "Loop template declares this action as approval-gated.");
  }
  const text = searchableText(output);
  for (const gate of inferApprovalGateTypes(text)) {
    addGate(gates, gate, "Draft content implies this action may affect customers or the public.");
  }
  return [...gates.values()];
}

function approvalRiskLevel(current, gates = []) {
  const riskLevel = normalizeRiskLevel(current) || "medium";
  return gates.some((gate) => approvalGateDefinition(gate?.type)?.category === "external_impact")
    ? "high"
    : riskLevel;
}

function approvalGateDefinition(type) {
  return APPROVAL_GATE_DEFINITIONS[normalizeGateType(type)] || null;
}

function normalizeApprovalGate(input, fallbackReason = "") {
  const type = normalizeGateType(typeof input === "string" ? input : input?.type);
  const definition = APPROVAL_GATE_DEFINITIONS[type];
  if (!definition) return null;
  return {
    category: definition.category,
    label: typeof input === "object" && input?.label ? String(input.label) : definition.label,
    reason:
      typeof input === "object" && input?.reason
        ? String(input.reason)
        : fallbackReason || definition.reason,
    required: true,
    type: definition.type,
  };
}

function normalizeGateType(type) {
  const raw = String(type || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return GATE_ALIASES[raw] || raw;
}

function templateGates(template) {
  return Array.isArray(template?.approvalGates) ? template.approvalGates : [];
}

function addGate(gates, gateInput, reason) {
  const gate = normalizeApprovalGate(gateInput, reason);
  if (!gate || gates.has(gate.type)) return;
  gates.set(gate.type, gate);
}

function inferApprovalGateTypes(text) {
  const matches = new Set();
  const raw = String(text || "").toLowerCase();
  if (/\b(email|outreach|send|dm|message|follow[-\s]?up|contact|reply|customer-facing)\b/.test(raw)) {
    matches.add("external_send");
  }
  if (/\b(publish|public page|landing page|linkedin post|public post|launch|website|homepage)\b/.test(raw)) {
    matches.add("publish");
  }
  if (/\b(payment|paid spend|ad spend|charge|invoice|deposit|budget|buy ads|stripe|checkout)\b/.test(raw)) {
    matches.add("payment");
  }
  if (/\b(legal|contract|terms|refund|guarantee|compliance|regulated|regulatory|tax|privacy|liability)\b/.test(raw)) {
    matches.add("legal_sensitive");
  }
  if (/\b(pricing|price|commercial terms|package price)\b/.test(raw)) {
    matches.add("pricing_change");
  }
  if (/\b(customer promise|promise|customer-facing claim|sales claim)\b/.test(raw)) {
    matches.add("customer_promise");
  }
  if (/\b(public claim|claim|source|citation|externally informed)\b/.test(raw)) {
    matches.add("public_claim");
  }
  return [...matches];
}

function searchableText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(searchableText).join("\n");
  if (typeof value === "object") {
    return Object.values(value).map(searchableText).join("\n");
  }
  return "";
}

function normalizeRiskLevel(value) {
  const raw = String(value || "").trim().toLowerCase();
  return ["low", "medium", "high"].includes(raw) ? raw : "";
}

module.exports = {
  APPROVAL_GATE_DEFINITIONS,
  REQUIRED_EXTERNAL_APPROVAL_GATE_TYPES,
  approvalGateDefinition,
  approvalGatesFor,
  approvalRiskLevel,
  inferApprovalGateTypes,
  normalizeApprovalGate,
  normalizeGateType,
};
