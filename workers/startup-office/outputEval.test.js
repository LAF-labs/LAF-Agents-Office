const assert = require("node:assert/strict");
const test = require("node:test");

const { STARTUP_OFFICE_LOOP_TEMPLATES } = require("./loopTemplates");
const { createStartupOfficeModelClient } = require("./modelClient");
const { evaluateStartupOfficeOutput } = require("./qualityChecks");

test("fake loop outputs clear the beta quality rubric for every launch loop", async () => {
  const modelClient = createStartupOfficeModelClient({ provider: "fake" });
  for (const template of Object.values(STARTUP_OFFICE_LOOP_TEMPLATES)) {
    const result = await modelClient.generateStructured({
      input: template.userPrompt({
        context: loopContext(template),
        inputs: { market: "AI operations", offer: "AI Startup Office" },
        objective: "Create founder-controlled launch office work.",
      }),
      instructions: template.instructions,
      metadata: {
        loop_name: template.artifactTitle,
        loop_slug: template.slug,
      },
      schema: template.schema,
      schemaDescription: template.schemaDescription,
      schemaName: template.schemaName,
    });
    const quality = evaluateStartupOfficeOutput({
      output: result.data,
      template,
    });
    const artifact = template.toArtifact(result.data, loopContext(template));

    assert.equal(quality.passed, true, `${template.slug}: ${quality.issues.join("; ")}`);
    assert.equal(result.cost.total_tokens > 0, true);
    assert.match(artifact, /Founder Control/);
    assert.doesNotMatch(artifact, /already sent|already published|charged|launched ads/i);
    assertLoopSpecificOutput(template.slug, result.data, artifact);
  }
});

test("quality rubric rejects missing loop-specific fields", () => {
  const template = STARTUP_OFFICE_LOOP_TEMPLATES["offer-package"];
  const quality = evaluateStartupOfficeOutput({
    output: {
      assumptions: [],
      next_actions: ["Ask for approval."],
      risk_level: "medium",
      risks: ["Too broad."],
      sources: [],
      summary: "Thin offer.",
    },
    template,
  });

  assert.equal(quality.passed, false);
  assert.match(quality.issues.join("\n"), /customer_promise is required/);
  assert.match(quality.issues.join("\n"), /pricing_hypothesis is required/);
  assert.match(quality.issues.join("\n"), /objections is required/);
});

test("quality rubric requires attached citations for externally informed output", async () => {
  const template = STARTUP_OFFICE_LOOP_TEMPLATES["idea-validation"];
  const modelClient = createStartupOfficeModelClient({ provider: "fake" });
  const result = await modelClient.generateStructured({
    input: template.userPrompt({
      context: loopContext(template),
      inputs: { market: "AI operations" },
      objective: "Create sourced validation work.",
    }),
    instructions: template.instructions,
    metadata: {
      loop_name: template.artifactTitle,
      loop_slug: template.slug,
    },
    schema: template.schema,
    schemaDescription: template.schemaDescription,
    schemaName: template.schemaName,
  });
  const externallyInformedContext = {
    citation_sources: [
      { label: "Market report", type: "signal", url: "https://example.com/market-report" },
    ],
  };

  const missing = evaluateStartupOfficeOutput({
    context: externallyInformedContext,
    output: result.data,
    template,
  });
  assert.equal(missing.passed, false);
  assert.match(missing.issues.join("\n"), /externally informed outputs require source citations/);

  const mismatched = evaluateStartupOfficeOutput({
    context: externallyInformedContext,
    output: {
      ...result.data,
      sources: [{ label: "Other report", url: "https://example.com/other" }],
    },
    template,
  });
  assert.equal(mismatched.passed, false);
  assert.match(mismatched.issues.join("\n"), /output sources must cite attached source metadata/);

  const cited = evaluateStartupOfficeOutput({
    context: externallyInformedContext,
    output: {
      ...result.data,
      sources: [{ label: "Market report", url: "https://example.com/market-report" }],
    },
    template,
  });
  assert.equal(cited.passed, true, cited.issues.join("\n"));
});

test("quality rubric red-teams overclaiming and regulated advice", () => {
  const template = STARTUP_OFFICE_LOOP_TEMPLATES["launch-campaign"];
  const baseOutput = {
    assumptions: [
      {
        claim: "Founder-control messaging may improve trust.",
        evidence_needed: "Run interviews and measure replies.",
      },
    ],
    approval_gates: ["Founder approval before any external send."],
    campaign_goal: "Validate cautious founder-controlled launch messaging.",
    channel_plan: ["Founder-led email only after approval."],
    copy_variants: ["Founder-controlled AI office."],
    experiments: ["Ask five founders for feedback."],
    metrics_to_track: ["reply rate"],
    next_actions: ["Ask founder to review copy."],
    risk_level: "medium",
    risks: ["Claims may overstate capability."],
    sources: [],
    summary: "Draft a cautious launch campaign.",
  };

  const guaranteed = evaluateStartupOfficeOutput({
    output: {
      ...baseOutput,
      copy_variants: ["This offer guarantees customers and is risk-free."],
    },
    template,
  });
  assert.equal(guaranteed.passed, false);
  assert.match(guaranteed.issues.join("\n"), /must not guarantee/);

  const regulated = evaluateStartupOfficeOutput({
    output: {
      ...baseOutput,
      next_actions: ["Tell founders this is legal advice and the contract is enforceable."],
    },
    template,
  });
  assert.equal(regulated.passed, false);
  assert.match(regulated.issues.join("\n"), /requires expert review/);

  const reviewed = evaluateStartupOfficeOutput({
    output: {
      ...baseOutput,
      next_actions: ["Flag this as not legal advice and require lawyer review before use."],
    },
    template,
  });
  assert.equal(reviewed.passed, true, reviewed.issues.join("\n"));
});

function loopContext(template) {
  return {
    loop: { name: template.artifactTitle, slug: template.slug },
    metrics: [{ metric_key: "paid_beta_deposits", metric_value: 0 }],
    previous_runs: [{ id: "prev-run", summary: "Earlier validation found trust risk." }],
    profile: {
      icp: "Solo B2B founders",
      name: "LAF Labs",
      offer: "Founder-controlled AI Startup Office",
      stage: "closed-beta",
    },
    recent_receipts: [
      {
        event_type: "run.ai_draft_ready",
        summary: "Idea validation draft created.",
      },
    ],
    relevant_assets: [{ kind: "draft", title: "Seven-day launch office" }],
    relevant_customers: [{ name: "Founder lead", status: "lead" }],
    relevant_signals: [{ signal_type: "market", title: "Founders fear black-box AI" }],
    run: { id: "run-1" },
    wiki_memory: [{ slug: "company-profile", summary: "Founder-controlled launch office." }],
  };
}

function assertLoopSpecificOutput(slug, output, artifact) {
  if (slug === "idea-validation") {
    assert.equal(typeof output.icp_hypothesis, "string");
    assert.equal(output.next_evidence.length >= 2, true);
    assert.match(artifact, /ICP Hypothesis/);
    assert.match(artifact, /Next Evidence/);
    return;
  }
  if (slug === "offer-package") {
    assert.equal(typeof output.customer_promise, "string");
    assert.equal(output.objections.length >= 2, true);
    assert.equal(typeof output.pricing_hypothesis.price_anchor, "string");
    assert.equal(typeof output.sales_copy.headline, "string");
    assert.match(artifact, /Pricing Hypothesis/);
    assert.match(artifact, /Sales Copy/);
    return;
  }
  if (slug === "customer-discovery") {
    assert.equal(output.target_segments.length >= 1, true);
    assert.equal(output.interview_guide.length >= 2, true);
    assert.equal(output.outreach_drafts.length >= 1, true);
    assert.equal(output.follow_up_drafts.length >= 1, true);
    assert.match(artifact, /Interview Guide/);
    assert.match(artifact, /Outreach Drafts/);
    return;
  }
  if (slug === "launch-campaign") {
    assert.equal(output.channel_plan.length >= 2, true);
    assert.equal(output.copy_variants.length >= 2, true);
    assert.equal(output.experiments.length >= 1, true);
    assert.equal(output.metrics_to_track.length >= 1, true);
    assert.match(artifact, /Approval Gates/);
    assert.match(artifact, /Metrics To Track/);
    return;
  }
  if (slug === "weekly-operator-review") {
    assert.equal(typeof output.company_pulse.status, "string");
    assert.equal(output.decisions.length >= 1, true);
    assert.equal(output.next_loops.length >= 2, true);
    assert.equal(output.receipt_takeaways.length >= 1, true);
    assert.match(artifact, /Receipt Takeaways/);
    assert.match(artifact, /Next Loops/);
  }
}
