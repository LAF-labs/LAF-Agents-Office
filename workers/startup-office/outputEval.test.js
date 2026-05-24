const assert = require("node:assert/strict");
const test = require("node:test");

const { createStartupOfficeModelClient } = require("./modelClient");
const { ideaValidationTemplate } = require("./loopTemplates/ideaValidation");
const { evaluateStartupOfficeOutput } = require("./qualityChecks");

test("fake Idea Validation output clears the beta quality rubric", async () => {
  const modelClient = createStartupOfficeModelClient({ provider: "fake" });
  const result = await modelClient.generateStructured({
    input: ideaValidationTemplate.userPrompt({
      context: {
        loop: { name: "Idea Validation", slug: "idea-validation" },
        profile: {
          icp: "Solo B2B founders",
          name: "LAF Labs",
          offer: "Founder-controlled AI Startup Office",
        },
        recent_receipts: [],
        run: { id: "run-1" },
        wiki_memory: [],
      },
      inputs: { market: "AI operations" },
      objective: "Find the first paid beta buyer segment.",
    }),
    instructions: ideaValidationTemplate.instructions,
    metadata: { loop_name: "Idea Validation", loop_slug: "idea-validation" },
    schema: ideaValidationTemplate.schema,
    schemaDescription: ideaValidationTemplate.schemaDescription,
    schemaName: ideaValidationTemplate.schemaName,
  });
  const quality = evaluateStartupOfficeOutput({
    output: result.data,
    template: ideaValidationTemplate,
  });

  assert.equal(quality.passed, true);
  assert.equal(result.cost.total_tokens > 0, true);
  assert.equal(Array.isArray(result.data.next_actions), true);
  assert.equal(result.data.assumptions.length >= 2, true);
});
