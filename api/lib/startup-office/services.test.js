const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeServices,
} = require("./services");

function services() {
  return createStartupOfficeServices({
    objectValue(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    },
    truncateText(value, max) {
      return String(value || "").slice(0, max);
    },
  });
}

test("company profile patch normalizes onboarding fields and richer office fields", () => {
  const patch = services().startupOfficeCompanyProfilePatch({
    company_description: "Founder-controlled AI office",
    company_goals: "Close ten paid beta founders",
    company_name: "LAF Office",
    company_profile: {
      icp: "Solo founders",
      metadata: { source: "onboarding" },
      offer: "50-person AI startup office",
    },
    company_size: "2",
    positioning: "More transparent Polsia",
    stage: "closed_beta",
  });

  assert.deepEqual(patch, {
    description: "Founder-controlled AI office",
    goals: "Close ten paid beta founders",
    icp: "Solo founders",
    metadata: { source: "onboarding" },
    name: "LAF Office",
    offer: "50-person AI startup office",
    positioning: "More transparent Polsia",
    size: "2",
    stage: "closed_beta",
  });
});

test("company profile row payload includes only persisted profile columns", () => {
  const row = services().companyProfileRowPayload({
    description: "desc",
    ignored: "not persisted",
    metadata: { source: "test" },
    name: "LAF",
    stage: "beta",
  });

  assert.deepEqual(row, {
    description: "desc",
    metadata: { source: "test" },
    name: "LAF",
    stage: "beta",
  });
});
