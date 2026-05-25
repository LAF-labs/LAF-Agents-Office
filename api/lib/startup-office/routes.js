function clientContract(functionName, method, responseType, pathIncludes) {
  return Object.freeze({
    functionName,
    method,
    pathIncludes: Object.freeze(pathIncludes),
    responseType,
  });
}

const STARTUP_OFFICE_ROUTE_PATHS = Object.freeze({
  demoSeed: "startup-office/demo-seed",
});

const STARTUP_OFFICE_ROUTE_CONTRACTS = Object.freeze([
  {
    id: "companyProfile",
    methods: Object.freeze(["GET", "PATCH"]),
    paths: Object.freeze(["company/profile"]),
    client: Object.freeze([
      clientContract("updateStartupOfficeCompanyProfile", "PATCH", "StartupOfficeCompanyProfileResponse", [
        "/company/profile",
      ]),
    ]),
  },
  {
    id: "demoSeed",
    methods: Object.freeze(["POST"]),
    paths: Object.freeze([STARTUP_OFFICE_ROUTE_PATHS.demoSeed]),
  },
  {
    id: "growthSummary",
    methods: Object.freeze(["GET"]),
    paths: Object.freeze(["startup-office/growth-summary"]),
    client: Object.freeze([
      clientContract("getStartupOfficeGrowthSummary", "GET", "StartupOfficeGrowthSummary", [
        "/startup-office/growth-summary",
      ]),
    ]),
  },
  {
    id: "policy",
    methods: Object.freeze(["GET", "PATCH"]),
    paths: Object.freeze(["startup-office/policy"]),
    client: Object.freeze([
      clientContract("getStartupOfficeApprovalPolicy", "GET", "StartupOfficePolicyResponse", [
        "/startup-office/policy",
      ]),
      clientContract("updateStartupOfficeApprovalPolicy", "PATCH", "StartupOfficePolicyResponse", [
        "/startup-office/policy",
      ]),
    ]),
  },
  { id: "billing", methods: Object.freeze(["GET", "PATCH"]), paths: Object.freeze(["startup-office/billing"]) },
  { id: "supportAccess", methods: Object.freeze(["GET", "POST"]), paths: Object.freeze(["startup-office/support-access"]) },
  {
    id: "supportAccessAction",
    methods: Object.freeze(["POST"]),
    pattern: "^startup-office/support-access/([^/]+)/(revoke|log-access)$",
    params: Object.freeze(["eventID", "action"]),
  },
  { id: "deletionRequest", methods: Object.freeze(["GET", "POST"]), paths: Object.freeze(["startup-office/deletion-request"]) },
  { id: "betaDashboard", methods: Object.freeze(["GET"]), paths: Object.freeze(["startup-office/admin/beta-dashboard"]) },
  {
    id: "workerJobAction",
    methods: Object.freeze(["POST"]),
    pattern: "^startup-office/admin/worker-jobs/([^/]+)/(retry|cancel)$",
    params: Object.freeze(["jobID", "action"]),
    client: Object.freeze([
      clientContract("retryStartupOfficeWorkerJob", "POST", "StartupOfficeWorkerJobActionResponse", [
        "/startup-office/admin/worker-jobs/${encodeURIComponent(jobID)}/retry",
      ]),
      clientContract("cancelStartupOfficeWorkerJob", "POST", "StartupOfficeWorkerJobActionResponse", [
        "/startup-office/admin/worker-jobs/${encodeURIComponent(jobID)}/cancel",
      ]),
    ]),
  },
  { id: "loops", methods: Object.freeze(["GET", "POST"]), paths: Object.freeze(["startup-office/loops", "loops"]) },
  {
    id: "loopRun",
    methods: Object.freeze(["POST"]),
    pattern: "^(?:startup-office/)?loops/([^/]+)/run$",
    params: Object.freeze(["loopID"]),
    client: Object.freeze([
      clientContract("runStartupOfficeLoop", "POST", "StartupOfficeLoopRunResponse", [
        "/startup-office/loops/${encodeURIComponent(loopID)}/run",
      ]),
    ]),
  },
  {
    id: "run",
    methods: Object.freeze(["GET", "POST"]),
    pattern: "^(?:startup-office/)?runs/([^/]+)(?:/(retry|cancel))?$",
    params: Object.freeze(["runID", "action"]),
    client: Object.freeze([
      clientContract("getStartupOfficeRun", "GET", "StartupOfficeRunDetailResponse", [
        "/startup-office/runs/${encodeURIComponent(runID)}",
      ]),
      clientContract("retryStartupOfficeRun", "POST", "StartupOfficeRunMutationResponse", [
        "/startup-office/runs/${encodeURIComponent(runID)}/retry",
      ]),
      clientContract("cancelStartupOfficeRun", "POST", "StartupOfficeRunCancelResponse", [
        "/startup-office/runs/${encodeURIComponent(runID)}/cancel",
      ]),
    ]),
  },
  { id: "approvals", methods: Object.freeze(["GET"]), paths: Object.freeze(["startup-office/approvals", "approvals"]) },
  {
    id: "approvalAction",
    methods: Object.freeze(["POST"]),
    pattern: "^(?:startup-office/)?approvals/([^/]+)/(approve|reject|revise)$",
    params: Object.freeze(["approvalID", "action"]),
    client: Object.freeze([
      clientContract("approveStartupOfficeApproval", "POST", "StartupOfficeApprovalActionResponse", [
        "/startup-office/approvals/${encodeURIComponent(approvalID)}/approve",
      ]),
      clientContract("rejectStartupOfficeApproval", "POST", "StartupOfficeApprovalActionResponse", [
        "/startup-office/approvals/${encodeURIComponent(approvalID)}/reject",
      ]),
      clientContract("reviseStartupOfficeApproval", "POST", "StartupOfficeApprovalActionResponse", [
        "/startup-office/approvals/${encodeURIComponent(approvalID)}/revise",
      ]),
    ]),
  },
  {
    id: "receipts",
    methods: Object.freeze(["GET"]),
    paths: Object.freeze(["startup-office/receipts", "receipts"]),
    client: Object.freeze([
      clientContract("getStartupOfficeReceipts", "GET", "StartupOfficeReceiptsResponse", [
        "/startup-office/receipts",
      ]),
    ]),
  },
  { id: "objectCollection", methods: Object.freeze(["GET", "POST"]), pattern: "^startup-office/(assets|customers|metrics|signals)$", params: Object.freeze(["kind"]) },
  { id: "assetUploadIntent", methods: Object.freeze(["POST"]), paths: Object.freeze(["startup-office/assets/upload-intent"]) },
  {
    id: "objectItem",
    methods: Object.freeze(["PATCH", "DELETE"]),
    pattern: "^startup-office/(assets|customers|metrics|signals)/([^/]+)$",
    params: Object.freeze(["kind", "objectID"]),
  },
  {
    id: "artifactObjectAction",
    methods: Object.freeze(["POST"]),
    pattern: "^startup-office/artifacts/([^/]+)/(save-as-asset|record-signal)$",
    params: Object.freeze(["artifactID", "action"]),
  },
  { id: "export", methods: Object.freeze(["GET"]), paths: Object.freeze(["startup-office/export"]) },
]);

module.exports = {
  STARTUP_OFFICE_ROUTE_CONTRACTS,
  STARTUP_OFFICE_ROUTE_PATHS,
};
