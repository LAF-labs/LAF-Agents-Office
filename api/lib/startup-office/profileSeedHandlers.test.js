const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeProfileSeedHandlers,
} = require("./profileSeedHandlers");

test("profile seed handlers wire profile and demo-seed factories with shared dependencies", async () => {
  const calls = [];
  const services = {
    companyProfileRowPayload: (profile) => ({ row: profile.id }),
    startupOfficeCompanyProfilePatch: (body) => ({ patch: body.company }),
  };
  const bundle = createStartupOfficeProfileSeedHandlers({
    createDemoSeedHandlers: (deps) => {
      calls.push(["demo", deps]);
      return { seedStartupOfficeWorkspace: async () => "seeded" };
    },
    createHTTPError: marker("createHTTPError"),
    createProfileHandlers: (deps) => {
      calls.push(["profile", deps]);
      return { companyProfileSnapshot: async () => "snapshot" };
    },
    createStartupOfficeReceipt: marker("createStartupOfficeReceipt"),
    nowISO: marker("nowISO"),
    objectValue: marker("objectValue"),
    publicCompanyProfile: marker("publicCompanyProfile"),
    publicStartupOfficeApproval: marker("publicStartupOfficeApproval"),
    publicStartupOfficeArtifact: marker("publicStartupOfficeArtifact"),
    publicStartupOfficeLoop: marker("publicStartupOfficeLoop"),
    publicStartupOfficeReceipt: marker("publicStartupOfficeReceipt"),
    publicStartupOfficeRun: marker("publicStartupOfficeRun"),
    readBody: marker("readBody"),
    requireAdminRole: marker("requireAdminRole"),
    requirePermission: marker("requirePermission"),
    requireUser: marker("requireUser"),
    safeStartupOfficeRest: marker("safeStartupOfficeRest"),
    startupOfficeRepository: marker("startupOfficeRepository"),
    startupOfficeServices: () => services,
    truncateText: marker("truncateText"),
    truthy: marker("truthy"),
    upsertWorkspaceSettings: marker("upsertWorkspaceSettings"),
    workspaceSettings: marker("workspaceSettings"),
    workspaceSettingsPatch: marker("workspaceSettingsPatch"),
    writeAuditEvent: marker("writeAuditEvent"),
    writeJSON: marker("writeJSON"),
  });

  assert.equal(Object.isFrozen(bundle), true);
  assert.equal(await bundle.profileHandlers.companyProfileSnapshot(), "snapshot");
  assert.equal(await bundle.demoSeedHandlers.seedStartupOfficeWorkspace(), "seeded");
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0][1].companyProfileRowPayload({ id: "company-1" }), { row: "company-1" });
  assert.deepEqual(calls[0][1].startupOfficeCompanyProfilePatch({ company: "LAF" }), { patch: "LAF" });
  assert.equal(calls[1][1].createStartupOfficeReceipt.name, "createStartupOfficeReceipt");
  assert.equal(calls[1][1].publicStartupOfficeRun.name, "publicStartupOfficeRun");
});

function marker(name) {
  const fn = () => name;
  Object.defineProperty(fn, "name", { value: name });
  return fn;
}
