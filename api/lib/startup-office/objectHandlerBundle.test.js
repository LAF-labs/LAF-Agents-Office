const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeObjectHandlerBundle,
} = require("./objectHandlerBundle");

test("object handler bundle wires object, asset, customer CSV, and import handlers", () => {
  const calls = [];
  const bundle = createStartupOfficeObjectHandlerBundle({
    ...deps(),
    createAssetUploadHandlers: factory(calls, "assetUpload"),
    createCustomerCsvHandlers: factory(calls, "customerCsv"),
    createImportHandlers: factory(calls, "import"),
    createObjectHandlers: factory(calls, "object"),
  });

  assert.equal(Object.isFrozen(bundle), true);
  assert.deepEqual(Object.keys(bundle).sort(), [
    "assetUploadHandlers",
    "customerCsvHandlers",
    "importHandlers",
    "objectHandlers",
  ]);
  assert.equal(
    calls.find(([name]) => name === "object")[1].startupOfficeObjectDefinition
      .name,
    "startupOfficeObjectDefinition",
  );
  assert.equal(
    calls.find(([name]) => name === "customerCsv")[1]
      .startupOfficeObjectPayload.name,
    "startupOfficeObjectPayload",
  );
  assert.equal(
    calls.find(([name]) => name === "assetUpload")[1].publicStartupOfficeAsset
      .name,
    "publicStartupOfficeAsset",
  );
  assert.equal(
    calls.find(([name]) => name === "import")[1].objectValue.name,
    "objectValue",
  );
});

function factory(calls, name) {
  return (factoryDeps) => {
    calls.push([name, factoryDeps]);
    return { name };
  };
}

function deps() {
  return {
    createHTTPError: marker("createHTTPError"),
    nowISO: marker("nowISO"),
    objectValue: marker("objectValue"),
    publicStartupOfficeAsset: marker("publicStartupOfficeAsset"),
    publicStartupOfficeCustomer: marker("publicStartupOfficeCustomer"),
    publicStartupOfficeSignal: marker("publicStartupOfficeSignal"),
    readBody: marker("readBody"),
    requirePermission: marker("requirePermission"),
    requireUser: marker("requireUser"),
    safeStartupOfficeRest: marker("safeStartupOfficeRest"),
    startupOfficeBetaOpsSnapshot: marker("startupOfficeBetaOpsSnapshot"),
    startupOfficeObjectDefinition: marker("startupOfficeObjectDefinition"),
    startupOfficeObjectPatch: marker("startupOfficeObjectPatch"),
    startupOfficeObjectPayload: marker("startupOfficeObjectPayload"),
    startupOfficeObjectRows: marker("startupOfficeObjectRows"),
    startupOfficeRepository: marker("startupOfficeRepository"),
    truncateText: marker("truncateText"),
    writeAuditEvent: marker("writeAuditEvent"),
    writeJSON: marker("writeJSON"),
  };
}

function marker(name) {
  const fn = () => name;
  Object.defineProperty(fn, "name", { value: name });
  return fn;
}
