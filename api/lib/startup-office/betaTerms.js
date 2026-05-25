const STARTUP_OFFICE_TERMS_PACKAGE = Object.freeze({
  ai_use_version: "startup-office-ai-use-2026-05-26",
  deletion_version: "startup-office-deletion-2026-05-26",
  docs_path: "docs/legal/STARTUP-OFFICE-BETA-TERMS.md",
  dpa_version: "startup-office-dpa-2026-05-26",
  privacy_version: "startup-office-privacy-2026-05-26",
  retention_version: "startup-office-retention-2026-05-26",
  terms_version: "startup-office-beta-terms-2026-05-26",
});

const TERMS_VERSION_KEYS = Object.freeze([
  "terms_version",
  "privacy_version",
  "dpa_version",
  "ai_use_version",
  "retention_version",
  "deletion_version",
]);

function startupOfficeCurrentTermsPackage() {
  return { ...STARTUP_OFFICE_TERMS_PACKAGE, version_keys: [...TERMS_VERSION_KEYS] };
}

function startupOfficeTermsSnapshot(rows = []) {
  const current = startupOfficeCurrentTermsPackage();
  const acceptances = rows.map(publicStartupOfficeTermsAcceptance).filter(Boolean);
  const currentAcceptance =
    acceptances.find((acceptance) => termsAcceptanceMatches(acceptance, current)) || null;
  return {
    accepted: Boolean(currentAcceptance),
    current,
    latest_acceptance: currentAcceptance || acceptances[0] || null,
    missing_versions: currentAcceptance
      ? []
      : TERMS_VERSION_KEYS.filter((key) => {
          const latest = acceptances[0];
          return !latest || latest[key] !== current[key];
        }),
  };
}

function publicStartupOfficeTermsAcceptance(row) {
  if (!row || !row.id) return null;
  return {
    acceptance_note: row.acceptance_note || "",
    accepted_at: row.accepted_at || row.created_at || null,
    accepted_by: row.accepted_by || null,
    ai_use_version: row.ai_use_version || "",
    deletion_version: row.deletion_version || "",
    dpa_version: row.dpa_version || "",
    id: row.id,
    metadata: objectValue(row.metadata),
    privacy_version: row.privacy_version || "",
    retention_version: row.retention_version || "",
    terms_version: row.terms_version || "",
    updated_at: row.updated_at || null,
  };
}

function startupOfficeTermsAcceptancePayload({
  body = {},
  membership,
  nowISO,
  objectValue: toObject = objectValue,
  truncateText,
}) {
  const current = { ...STARTUP_OFFICE_TERMS_PACKAGE };
  return {
    ...current,
    acceptance_note: truncateText(body.acceptance_note || body.note || "", 1000),
    accepted_at: nowISO(),
    accepted_by: membership.user_id || null,
    metadata: {
      ...toObject(body.metadata),
      accepted_from: truncateText(body.accepted_from || "startup_office_product", 120),
    },
  };
}

function termsAcceptanceMatches(acceptance, current) {
  return TERMS_VERSION_KEYS.every((key) => acceptance[key] === current[key]);
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

module.exports = {
  STARTUP_OFFICE_TERMS_PACKAGE,
  TERMS_VERSION_KEYS,
  publicStartupOfficeTermsAcceptance,
  startupOfficeCurrentTermsPackage,
  startupOfficeTermsAcceptancePayload,
  startupOfficeTermsSnapshot,
  termsAcceptanceMatches,
};
