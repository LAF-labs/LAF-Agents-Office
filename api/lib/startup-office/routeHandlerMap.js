function createStartupOfficeRouteHandlerMap(deps) {
  const {
    assetUploadHandlers,
    customerCsvHandlers,
    demoSeedHandlers,
    lifecycleHandlers,
    objectHandlers,
    operationsHandlers,
    profileHandlers,
    queryHandlers,
    termsHandlers,
    workflowHandlers,
  } = deps;

  return Object.freeze({
    approvalAction: workflowHandlers.approvalAction,
    approvals: queryHandlers.approvals,
    artifactObjectAction: objectHandlers.artifactObjectAction,
    assetUploadIntent: assetUploadHandlers.assetUploadIntent,
    betaDashboard: operationsHandlers.betaDashboard,
    billing: operationsHandlers.billing,
    companyProfile: (req, res) => profileHandlers().companyProfile(req, res),
    customerCsv: customerCsvHandlers.customerCsv,
    deletionPurge: lifecycleHandlers.deletionPurge,
    deletionRequest: lifecycleHandlers.deletionRequest,
    demoSeed: (req, res) => demoSeedHandlers().demoSeed(req, res),
    export: queryHandlers.export,
    growthSummary: queryHandlers.growthSummary,
    loopRun: workflowHandlers.loopRun,
    loops: queryHandlers.loops,
    memoryImport: deps.importHandlers.memoryImport,
    objectCollection: objectHandlers.objectCollection,
    objectItem: objectHandlers.objectItem,
    policy: operationsHandlers.policy,
    receipts: queryHandlers.receipts,
    run: workflowHandlers.run,
    supportAccess: lifecycleHandlers.supportAccess,
    supportAccessAction: lifecycleHandlers.supportAccess,
    supportTimeline: operationsHandlers.supportTimeline,
    terms: termsHandlers.terms,
    workerJobAction: operationsHandlers.workerJobAction,
    workspaceImport: deps.importHandlers.workspaceImport,
  });
}

module.exports = {
  createStartupOfficeRouteHandlerMap,
};
