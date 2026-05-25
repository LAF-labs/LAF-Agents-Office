function permissionAccess(permission) {
  return Object.freeze({ permission, type: "permission" });
}

function adminAccess(reason) {
  return Object.freeze({ reason, type: "admin" });
}

function routeAccess(entries) {
  return Object.freeze(Object.fromEntries(entries));
}

const STARTUP_OFFICE_ACCESS = Object.freeze({
  adminBetaOps: adminAccess("owner or admin beta operations"),
  adminBilling: adminAccess("owner or admin billing operations"),
  adminDemoSeed: adminAccess("owner or admin demo seed"),
  adminWorkerRecovery: adminAccess("owner or admin worker job recovery"),
  approveMemory: permissionAccess("memory:promote"),
  draftMemory: permissionAccess("memory:write_draft"),
  manageWorkspace: permissionAccess("workspace:manage"),
  readWorkspace: permissionAccess("workspace:read"),
});

const STARTUP_OFFICE_ROUTE_ACCESS = Object.freeze({
  approvalAction: routeAccess([["POST", STARTUP_OFFICE_ACCESS.approveMemory]]),
  approvals: routeAccess([["GET", STARTUP_OFFICE_ACCESS.readWorkspace]]),
  artifactObjectAction: routeAccess([["POST", STARTUP_OFFICE_ACCESS.draftMemory]]),
  assetUploadIntent: routeAccess([["POST", STARTUP_OFFICE_ACCESS.draftMemory]]),
  betaDashboard: routeAccess([["GET", STARTUP_OFFICE_ACCESS.adminBetaOps]]),
  billing: routeAccess([
    ["GET", STARTUP_OFFICE_ACCESS.readWorkspace],
    ["PATCH", STARTUP_OFFICE_ACCESS.adminBilling],
  ]),
  terms: routeAccess([
    ["GET", STARTUP_OFFICE_ACCESS.readWorkspace],
    ["POST", STARTUP_OFFICE_ACCESS.manageWorkspace],
  ]),
  companyProfile: routeAccess([
    ["GET", STARTUP_OFFICE_ACCESS.readWorkspace],
    ["PATCH", STARTUP_OFFICE_ACCESS.manageWorkspace],
  ]),
  deletionRequest: routeAccess([
    ["GET", STARTUP_OFFICE_ACCESS.adminBetaOps],
    ["POST", STARTUP_OFFICE_ACCESS.adminBetaOps],
  ]),
  deletionPurge: routeAccess([["POST", STARTUP_OFFICE_ACCESS.adminBetaOps]]),
  demoSeed: routeAccess([["POST", STARTUP_OFFICE_ACCESS.adminDemoSeed]]),
  export: routeAccess([["GET", STARTUP_OFFICE_ACCESS.readWorkspace]]),
  growthSummary: routeAccess([["GET", STARTUP_OFFICE_ACCESS.readWorkspace]]),
  supportTimeline: routeAccess([["GET", STARTUP_OFFICE_ACCESS.adminBetaOps]]),
  loopRun: routeAccess([["POST", STARTUP_OFFICE_ACCESS.draftMemory]]),
  loops: routeAccess([
    ["GET", STARTUP_OFFICE_ACCESS.readWorkspace],
    ["POST", STARTUP_OFFICE_ACCESS.manageWorkspace],
  ]),
  customerCsv: routeAccess([
    ["GET", STARTUP_OFFICE_ACCESS.readWorkspace],
    ["POST", STARTUP_OFFICE_ACCESS.draftMemory],
  ]),
  memoryImport: routeAccess([["POST", STARTUP_OFFICE_ACCESS.approveMemory]]),
  objectCollection: routeAccess([
    ["GET", STARTUP_OFFICE_ACCESS.readWorkspace],
    ["POST", STARTUP_OFFICE_ACCESS.draftMemory],
  ]),
  objectItem: routeAccess([
    ["DELETE", STARTUP_OFFICE_ACCESS.draftMemory],
    ["PATCH", STARTUP_OFFICE_ACCESS.draftMemory],
  ]),
  policy: routeAccess([
    ["GET", STARTUP_OFFICE_ACCESS.readWorkspace],
    ["PATCH", STARTUP_OFFICE_ACCESS.manageWorkspace],
  ]),
  receipts: routeAccess([["GET", STARTUP_OFFICE_ACCESS.readWorkspace]]),
  run: routeAccess([
    ["GET", STARTUP_OFFICE_ACCESS.readWorkspace],
    ["POST", STARTUP_OFFICE_ACCESS.draftMemory],
  ]),
  supportAccess: routeAccess([
    ["GET", STARTUP_OFFICE_ACCESS.adminBetaOps],
    ["POST", STARTUP_OFFICE_ACCESS.adminBetaOps],
  ]),
  supportAccessAction: routeAccess([["POST", STARTUP_OFFICE_ACCESS.adminBetaOps]]),
  workerJobAction: routeAccess([["POST", STARTUP_OFFICE_ACCESS.adminWorkerRecovery]]),
});

function routeAccessForMethod(contract, method) {
  return STARTUP_OFFICE_ROUTE_ACCESS[contract.id]?.[String(method || "").toUpperCase()] || null;
}

async function authorizeStartupOfficeAccess({
  access,
  req,
  requireAdminRole,
  requirePermission,
  requireUser,
}) {
  if (!access) throw new Error("startup office access contract is missing");
  const { membership } = await requireUser(req);
  if (access.type === "permission") {
    requirePermission(membership, access.permission);
    return { membership };
  }
  if (access.type === "admin") {
    requireAdminRole(membership, access.reason);
    return { membership };
  }
  throw new Error(`unsupported startup office access type: ${access.type}`);
}

module.exports = {
  STARTUP_OFFICE_ACCESS,
  STARTUP_OFFICE_ROUTE_ACCESS,
  authorizeStartupOfficeAccess,
  routeAccessForMethod,
};
