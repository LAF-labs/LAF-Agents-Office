function createStartupOfficeRepositoryDelegates(deps) {
  const { startupOfficeRepository } = deps;

  async function startupOfficeLoops(teamID, options = {}) {
    return startupOfficeRepository().loops(teamID, options);
  }

  async function startupOfficeRuns(teamID, options = {}) {
    return startupOfficeRepository().runs(teamID, options);
  }

  async function startupOfficeArtifacts(teamID, options = {}) {
    return startupOfficeRepository().artifacts(teamID, options);
  }

  async function startupOfficeApprovals(teamID, options = {}) {
    return startupOfficeRepository().approvals(teamID, options);
  }

  async function startupOfficeReceipts(teamID, options = {}) {
    return startupOfficeRepository().receipts(teamID, options);
  }

  async function ensureStartupOfficeLoop(membership, loopID) {
    return startupOfficeRepository().ensureLoop(membership, loopID);
  }

  async function findStartupOfficeApproval(teamID, approvalID) {
    return startupOfficeRepository().findApproval(teamID, approvalID);
  }

  async function createStartupOfficeReceipt(membership, body) {
    return startupOfficeRepository().createReceipt(membership, body);
  }

  async function safeStartupOfficeRest(table, options = {}) {
    return startupOfficeRepository().safeRest(table, options);
  }

  function isMissingStartupOfficeTableError(err, table) {
    return startupOfficeRepository().isMissingTableError(err, table);
  }

  return {
    createStartupOfficeReceipt,
    ensureStartupOfficeLoop,
    findStartupOfficeApproval,
    isMissingStartupOfficeTableError,
    safeStartupOfficeRest,
    startupOfficeApprovals,
    startupOfficeArtifacts,
    startupOfficeLoops,
    startupOfficeReceipts,
    startupOfficeRuns,
  };
}

module.exports = {
  createStartupOfficeRepositoryDelegates,
};
