async function enforceStartupOfficeRunEntitlements({
  createHTTPError,
  startupOfficeBetaOpsSnapshot,
  startupOfficeBillingBlockReason,
  startupOfficeEntitlementBlock,
  teamID,
}) {
  const snapshot = await startupOfficeBetaOpsSnapshot(teamID);
  const { billing, usage } = snapshot;
  const entitlementBlock = startupOfficeEntitlementBlock
    ? startupOfficeEntitlementBlock(snapshot, "ai_runs")
    : null;
  if (entitlementBlock) throw createHTTPError(402, entitlementBlock.message);
  const blockReason = startupOfficeBillingBlockReason ? startupOfficeBillingBlockReason(billing) : "";
  if (blockReason) throw createHTTPError(402, `billing state blocks AI runs: ${blockReason}`);
  if (usage.runs >= billing.monthly_run_limit) {
    throw createHTTPError(402, "monthly Startup Office run limit reached");
  }
  if (usage.model_spend_cents >= billing.monthly_model_spend_cents) {
    throw createHTTPError(402, "monthly Startup Office model spend limit reached");
  }
}

module.exports = {
  enforceStartupOfficeRunEntitlements,
};
