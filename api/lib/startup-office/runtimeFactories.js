function createStartupOfficeRuntimeFactories(deps = {}) {
  const createModelClient = deps.createModelClient;
  const createRepository = deps.createRepository;
  const createServices = deps.createServices;
  let modelClientInstance = null;
  let repositoryInstance = null;
  let servicesInstance = null;

  function startupOfficeRepository() {
    if (!repositoryInstance) {
      repositoryInstance = createRepository(resolveDeps(deps.repositoryDeps));
    }
    return repositoryInstance;
  }

  function startupOfficeServices() {
    if (!servicesInstance) {
      servicesInstance = createServices(resolveDeps(deps.servicesDeps));
    }
    return servicesInstance;
  }

  function startupOfficeModelClient() {
    if (!modelClientInstance) {
      modelClientInstance = createModelClient(resolveDeps(deps.modelClientDeps));
    }
    return modelClientInstance;
  }

  return {
    startupOfficeModelClient,
    startupOfficeRepository,
    startupOfficeServices,
  };
}

function resolveDeps(value) {
  return typeof value === "function" ? value() : value;
}

module.exports = {
  createStartupOfficeRuntimeFactories,
};
