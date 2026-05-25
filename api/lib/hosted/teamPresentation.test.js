const assert = require("node:assert/strict");
const test = require("node:test");

const { publicTeam } = require("./teamPresentation");

test("publicTeam returns undefined for missing rows", () => {
  assert.equal(publicTeam(null), undefined);
  assert.equal(publicTeam(undefined), undefined);
});

test("publicTeam serializes hosted team fields", () => {
  assert.deepEqual(
    publicTeam({
      created_at: "2026-05-25T00:00:00.000Z",
      created_by: "user-1",
      id: "team-1",
      ignored: "internal",
      name: "Acme",
      slug: "acme",
      updated_at: "2026-05-26T00:00:00.000Z",
    }),
    {
      created_at: "2026-05-25T00:00:00.000Z",
      created_by: "user-1",
      id: "team-1",
      name: "Acme",
      slug: "acme",
      updated_at: "2026-05-26T00:00:00.000Z",
    },
  );
});
