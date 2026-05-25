const { contextSearchTerms, rankByRelevance } = require("./contextBuilder");

const RETRIEVAL_FIELD_KEYS = Object.freeze({
  artifacts: ["kind", "title", "content", "metadata"],
  assets: ["name", "kind", "body", "metadata"],
  customers: ["name", "status", "profile", "notes"],
  memory: ["slug", "title", "summary", "body", "sources", "assumptions"],
  signals: ["source", "title", "body", "metadata"],
});

function startupOfficeRetrievalQualityReport({
  scenarios = startupOfficeRetrievalQualityScenarios(),
  topK = 3,
} = {}) {
  const evaluations = scenarios.map((scenario) => evaluateRetrievalScenario(scenario, topK));
  const categoryEvaluations = evaluations.flatMap((item) => item.categories);
  return {
    category_count: categoryEvaluations.length,
    macro_precision_at_k: average(categoryEvaluations.map((item) => item.precision_at_k)),
    macro_recall_at_k: average(categoryEvaluations.map((item) => item.recall_at_k)),
    passed: categoryEvaluations.every((item) => item.passed),
    scenario_count: evaluations.length,
    scenarios: evaluations,
    top_k: topK,
  };
}

function assertStartupOfficeRetrievalQuality(options = {}) {
  const report = startupOfficeRetrievalQualityReport(options);
  const minPrecision = options.minPrecision ?? 0.5;
  const minRecall = options.minRecall ?? 0.8;
  const failures = report.scenarios.flatMap((scenario) =>
    scenario.categories
      .filter(
        (category) =>
          category.precision_at_k < minPrecision || category.recall_at_k < minRecall,
      )
      .map(
        (category) =>
          `${scenario.slug}/${category.kind} precision=${category.precision_at_k} recall=${category.recall_at_k}`,
      ),
  );
  if (failures.length) {
    const err = new Error(`Startup Office retrieval quality failed: ${failures.join("; ")}`);
    err.report = report;
    throw err;
  }
  return report;
}

function evaluateRetrievalScenario(scenario, topK) {
  const searchTerms = contextSearchTerms({
    loop: scenario.loop,
    profile: scenario.profile,
    run: scenario.run,
  });
  const categories = Object.entries(scenario.expected || {}).map(([kind, expectedIDs]) => {
    const candidates = scenario.candidates?.[kind] || [];
    const ranked = rankByRelevance(candidates, searchTerms, RETRIEVAL_FIELD_KEYS[kind] || ["title", "body"]);
    const selected = ranked.slice(0, topK);
    const selectedIDs = new Set(selected.map((item) => item.id));
    const expected = new Set(expectedIDs);
    const hitIDs = [...expected].filter((id) => selectedIDs.has(id));
    return {
      expected_ids: [...expected],
      hit_ids: hitIDs,
      kind,
      passed: hitIDs.length === expected.size,
      precision_at_k: round(hitIDs.length / Math.max(selected.length, 1)),
      recall_at_k: round(hitIDs.length / Math.max(expected.size, 1)),
      selected_ids: selected.map((item) => item.id),
    };
  });
  return {
    business_loop_outcome: scenario.business_loop_outcome,
    categories,
    search_terms: searchTerms,
    slug: scenario.slug,
  };
}

function startupOfficeRetrievalQualityScenarios() {
  return [
    {
      business_loop_outcome: "identify the first paid beta buyer segment",
      candidates: {
        assets: [
          { id: "asset-noise", name: "Payroll admin checklist", body: "Bookkeeping" },
          { id: "asset-agency-interviews", name: "Agency operator interviews", body: "Customer discovery notes about AI operations pain" },
        ],
        memory: [
          { id: "memory-noise", slug: "benefits", title: "Benefits admin", body: "Health plan notes" },
          { id: "memory-agency-icp", slug: "agency-operator-icp", title: "Agency operator ICP", body: "Agency operators need AI operations help before hiring" },
        ],
        signals: [
          { id: "signal-noise", title: "Office lease", body: "Move date" },
          { id: "signal-budget-urgency", title: "AI operations budget urgency", body: "Agency founders need buyer pain validation" },
        ],
      },
      expected: {
        assets: ["asset-agency-interviews"],
        memory: ["memory-agency-icp"],
        signals: ["signal-budget-urgency"],
      },
      loop: { name: "Idea Validation", objective: "Find agency operator buyer pain" },
      profile: { icp: "agency operators", offer: "AI startup operations office" },
      run: { inputs: { segment: "agency operators" }, objective: "Prioritize agency operator buyer pain" },
      slug: "idea-validation",
    },
    {
      business_loop_outcome: "turn trust positioning into a sellable offer",
      candidates: {
        assets: [
          { id: "asset-trust-objections", name: "Founder trust objections", body: "Black-box AI fear, approval receipts, transparent control" },
          { id: "asset-noise", name: "Tax receipt", body: "Expense admin" },
        ],
        memory: [
          { id: "memory-offer", slug: "offer", title: "Founder-controlled launch office offer", body: "Approval receipts and transparent AI operators" },
          { id: "memory-noise", slug: "vacation", title: "Holiday schedule", body: "Team calendar" },
        ],
      },
      expected: {
        assets: ["asset-trust-objections"],
        memory: ["memory-offer"],
      },
      loop: { name: "Offer Package", objective: "Package founder-controlled AI trust positioning" },
      profile: { offer: "transparent founder-controlled AI Startup Office" },
      run: { inputs: { positioning: "approval receipts and transparent control" }, objective: "Create sellable offer package" },
      slug: "offer-package",
    },
    {
      business_loop_outcome: "draft approval-gated customer discovery",
      candidates: {
        customers: [
          { id: "customer-qualified-founder", name: "Qualified B2B founder", notes: "Needs customer discovery and beta validation" },
          { id: "customer-noise", name: "Vendor", notes: "Accounting contact" },
        ],
        memory: [
          { id: "memory-discovery-script", slug: "customer-discovery-log", title: "Discovery script", body: "Ask for paid beta commitment and objections" },
          { id: "memory-noise", slug: "snacks", title: "Office snacks", body: "Kitchen list" },
        ],
      },
      expected: {
        customers: ["customer-qualified-founder"],
        memory: ["memory-discovery-script"],
      },
      loop: { name: "Customer Discovery", objective: "Interview B2B founders for paid beta validation" },
      profile: { icp: "B2B founders validating beta demand" },
      run: { inputs: { goal: "paid beta commitment" }, objective: "Draft interview guide and follow-up" },
      slug: "customer-discovery",
    },
  ];
}

function average(values) {
  if (!values.length) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value) {
  return Number(value.toFixed(3));
}

module.exports = {
  assertStartupOfficeRetrievalQuality,
  startupOfficeRetrievalQualityReport,
  startupOfficeRetrievalQualityScenarios,
};
