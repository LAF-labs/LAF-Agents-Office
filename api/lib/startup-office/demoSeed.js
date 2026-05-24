const crypto = require("node:crypto");

const DEMO_COMPANY_PROFILE = Object.freeze({
  description:
    "A solo founder is validating a paid beta for a founder-controlled AI Startup Office.",
  goals:
    "Prove that two founders will pay for a safer, transparent Startup Office before building broad automation.",
  icp: "Solo founders and tiny teams validating B2B software or service offers.",
  name: "AI Startup Office Demo",
  offer:
    "A controlled AI Startup Office that turns an idea into validation artifacts, customer discovery scripts, approval records, and receipts.",
  positioning:
    "A safer, more transparent alternative to fully autonomous company agents.",
  priority: "Validate paid beta demand and book the first customer interviews.",
  stage: "paid_beta_validation",
});

const DEMO_LOOPS = Object.freeze([
  {
    cadence: "manual",
    department: "Strategy",
    name: "Idea Validation",
    objective:
      "Turn the idea into falsifiable assumptions, ICP, interview questions, and the next evidence to collect.",
    slug: "idea-validation",
  },
  {
    cadence: "manual",
    department: "Growth",
    name: "Offer Package",
    objective:
      "Draft the paid beta promise, pricing hypothesis, objections, landing-page sections, and approval-ready claims.",
    slug: "offer-package",
  },
  {
    cadence: "manual",
    department: "Sales",
    name: "Customer Discovery",
    objective:
      "Create target segments, interview prompts, outreach drafts, and learning receipts for founder-led discovery.",
    slug: "customer-discovery",
  },
]);

const DEMO_ARTIFACTS = Object.freeze({
  ideaValidation:
    [
      "# Idea Validation Draft",
      "",
      "## ICP",
      "Solo founders validating B2B software or service offers before hiring a team.",
      "",
      "## Assumptions",
      "- Founders want a business operations AI that keeps approval control visible.",
      "- The first paid promise should be validation, not full company autopilot.",
      "- Buyers will trust receipts and source labels more than black-box autonomy.",
      "",
      "## Founder Control",
      "Public claims, outbound messages, spend, and customer promises remain approval-gated.",
      "",
      "## Next Evidence",
      "Interview five founders and ask what they would pay to finish a beta validation package in one week.",
    ].join("\n"),
  offerPackage:
    [
      "# Offer Package",
      "",
      "## Promise",
      "Validate and launch a paid beta with a controlled AI Startup Office.",
      "",
      "## Package",
      "- Company profile and positioning",
      "- Idea validation artifact",
      "- Offer and pricing hypothesis",
      "- Customer discovery script",
      "- Approval receipts and company memory updates",
      "",
      "## Approval Note",
      "This is a draft. The founder must approve public copy before publishing.",
    ].join("\n"),
});

function demoSeedUUID(teamID, label) {
  const bytes = crypto
    .createHash("sha256")
    .update(`${teamID}:${label}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

module.exports = {
  DEMO_ARTIFACTS,
  DEMO_COMPANY_PROFILE,
  DEMO_LOOPS,
  demoSeedUUID,
};
