const STARTUP_OFFICE_LOOP_DEFINITIONS = Object.freeze([
  {
    cadence: "manual",
    department: "Strategy",
    name: "Idea Validation",
    objective:
      "Turn a rough startup idea into falsifiable market assumptions, ICP, and next evidence.",
    slug: "idea-validation",
  },
  {
    cadence: "manual",
    department: "Growth",
    name: "Offer Package",
    objective:
      "Draft the customer promise, pricing hypothesis, objections, and sales page outline.",
    slug: "offer-package",
  },
  {
    cadence: "manual",
    department: "Marketing",
    name: "Launch Campaign",
    objective:
      "Prepare launch copy, channels, experiments, and approval gates for a public campaign.",
    slug: "launch-campaign",
  },
  {
    cadence: "manual",
    department: "Sales",
    name: "Customer Discovery",
    objective:
      "Generate interview targets, questions, follow-up assets, and learning receipts.",
    slug: "customer-discovery",
  },
  {
    cadence: "weekly",
    department: "Operations",
    name: "Weekly Operator Review",
    objective:
      "Summarize company pulse, risks, decisions, approvals, and next operating priorities.",
    slug: "weekly-operator-review",
  },
]);

module.exports = {
  STARTUP_OFFICE_LOOP_DEFINITIONS,
};
