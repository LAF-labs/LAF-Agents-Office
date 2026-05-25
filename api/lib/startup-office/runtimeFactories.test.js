const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createStartupOfficeRuntimeFactories,
} = require("./runtimeFactories");

test("runtime factories lazily create and cache repository, services, and model client", () => {
  const calls = {
    modelClients: [],
    repositories: [],
    services: [],
  };
  const runtime = createStartupOfficeRuntimeFactories({
    createModelClient(deps) {
      calls.modelClients.push(deps);
      return { kind: "model" };
    },
    createRepository(deps) {
      calls.repositories.push(deps);
      return { kind: "repository" };
    },
    createServices(deps) {
      calls.services.push(deps);
      return { kind: "services" };
    },
    modelClientDeps: () => ({ env: { provider: "fake" } }),
    repositoryDeps: () => ({ rest: async () => [] }),
    servicesDeps: () => ({ objectValue: (value) => value }),
  });

  assert.deepEqual(calls, {
    modelClients: [],
    repositories: [],
    services: [],
  });
  assert.equal(runtime.startupOfficeRepository(), runtime.startupOfficeRepository());
  assert.equal(runtime.startupOfficeServices(), runtime.startupOfficeServices());
  assert.equal(runtime.startupOfficeModelClient(), runtime.startupOfficeModelClient());
  assert.equal(calls.repositories.length, 1);
  assert.equal(typeof calls.repositories[0].rest, "function");
  assert.equal(calls.services.length, 1);
  assert.equal(typeof calls.services[0].objectValue, "function");
  assert.deepEqual(calls.modelClients, [{ env: { provider: "fake" } }]);
});
