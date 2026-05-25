const {
  startupOfficeCurrentTermsPackage,
  startupOfficeTermsAcceptancePayload,
} = require("./betaTerms");

function createStartupOfficeTermsHandlers(deps) {
  const {
    createHTTPError,
    nowISO,
    objectValue,
    readBody,
    requirePermission,
    requireUser,
    startupOfficeBetaOpsSnapshot,
    truncateText,
    upsertStartupOfficeTermsAcceptance,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleStartupOfficeTerms(req, res) {
    const { membership } = await requireUser(req);
    if (req.method === "GET") {
      requirePermission(membership, "workspace:read");
      writeJSON(res, 200, {
        beta_ops: await startupOfficeBetaOpsSnapshot(membership.team_id),
        terms: startupOfficeCurrentTermsPackage(),
      });
      return;
    }
    if (req.method !== "POST") {
      throw createHTTPError(405, "method not allowed");
    }
    requirePermission(membership, "workspace:manage");
    const body = await readBody(req);
    const acceptance = await upsertStartupOfficeTermsAcceptance(
      membership,
      startupOfficeTermsAcceptancePayload({
        body,
        membership,
        nowISO,
        objectValue,
        truncateText,
      }),
    );
    await writeAuditEvent(membership, "startup_office.terms_accepted", "team", membership.team_id, {
      ai_use_version: acceptance.ai_use_version,
      deletion_version: acceptance.deletion_version,
      dpa_version: acceptance.dpa_version,
      privacy_version: acceptance.privacy_version,
      retention_version: acceptance.retention_version,
      terms_version: acceptance.terms_version,
    });
    writeJSON(res, 200, {
      acceptance,
      beta_ops: await startupOfficeBetaOpsSnapshot(membership.team_id),
      status: "ok",
    });
  }

  return {
    terms: handleStartupOfficeTerms,
  };
}

module.exports = {
  createStartupOfficeTermsHandlers,
};
