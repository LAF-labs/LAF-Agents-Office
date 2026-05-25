const assert = require("node:assert/strict");
const test = require("node:test");

const {
  startupOfficeCurrentTermsPackage,
  startupOfficeTermsAcceptancePayload,
  startupOfficeTermsSnapshot,
} = require("./betaTerms");

test("beta terms snapshot requires the current legal package versions", () => {
  const current = startupOfficeCurrentTermsPackage();
  assert.equal(current.docs_path, "docs/legal/STARTUP-OFFICE-BETA-TERMS.md");

  const missing = startupOfficeTermsSnapshot([]);
  assert.equal(missing.accepted, false);
  assert.ok(missing.missing_versions.includes("terms_version"));

  const accepted = startupOfficeTermsSnapshot([
    {
      id: "terms-1",
      accepted_at: "2026-05-26T00:00:00.000Z",
      accepted_by: "user-1",
      ...current,
    },
  ]);
  assert.equal(accepted.accepted, true);
  assert.deepEqual(accepted.missing_versions, []);
  assert.equal(accepted.latest_acceptance.id, "terms-1");
});

test("beta terms acceptance payload records the current version bundle", () => {
  const payload = startupOfficeTermsAcceptancePayload({
    body: {
      accepted_from: "founder_settings",
      acceptance_note: "CEO accepted for the workspace",
      metadata: { session_id: "session-1" },
    },
    membership: { team_id: "team-1", user_id: "user-1" },
    nowISO: () => "2026-05-26T00:00:00.000Z",
    truncateText: (value, max) => String(value || "").slice(0, max),
  });

  assert.equal(payload.accepted_by, "user-1");
  assert.equal(payload.accepted_at, "2026-05-26T00:00:00.000Z");
  assert.equal(payload.terms_version, "startup-office-beta-terms-2026-05-26");
  assert.equal(payload.metadata.accepted_from, "founder_settings");
  assert.equal(payload.metadata.session_id, "session-1");
});
