const assert = require("node:assert/strict");
const test = require("node:test");

const { STARTUP_OFFICE_LOOP_TEMPLATES } = require("./loopTemplates");
const {
  LOOP_PROMPT_VERSION_MANIFEST,
  STARTUP_OFFICE_PROMPT_VERSION_MANIFEST_VERSION,
  startupOfficePromptVersion,
} = require("./promptVersions");

test("every startup office loop template has a prompt version manifest", () => {
  const templateSlugs = Object.keys(STARTUP_OFFICE_LOOP_TEMPLATES).sort();
  const manifestSlugs = Object.keys(LOOP_PROMPT_VERSION_MANIFEST).sort();

  assert.deepEqual(manifestSlugs, templateSlugs);
  for (const slug of templateSlugs) {
    const promptVersion = startupOfficePromptVersion({
      template: STARTUP_OFFICE_LOOP_TEMPLATES[slug],
    });
    assert.equal(promptVersion.loop_slug, slug);
    assert.equal(promptVersion.manifest_version, STARTUP_OFFICE_PROMPT_VERSION_MANIFEST_VERSION);
    assert.match(promptVersion.version, new RegExp(`^${slug}\\.prompt\\.v\\d+$`));
    assert.match(promptVersion.instructions_hash, /^[a-f0-9]{64}$/);
    assert.match(promptVersion.schema_hash, /^[a-f0-9]{64}$/);
    assert.equal(promptVersion.schema_name.length > 0, true);
    assert.equal(promptVersion.reviewed_for.includes("structured_json"), true);
  }
});

test("prompt version hash changes when reviewed prompt instructions change", () => {
  const template = {
    ...STARTUP_OFFICE_LOOP_TEMPLATES["idea-validation"],
    instructions: "Changed instructions for a review test.",
  };

  const original = startupOfficePromptVersion({
    template: STARTUP_OFFICE_LOOP_TEMPLATES["idea-validation"],
  });
  const changed = startupOfficePromptVersion({ template });

  assert.notEqual(changed.instructions_hash, original.instructions_hash);
  assert.equal(changed.schema_hash, original.schema_hash);
});
