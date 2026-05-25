const STARTUP_OFFICE_DELETION_MANIFEST_VERSION =
  "startup-office-deletion-manifest-2026-05-26";

const STARTUP_OFFICE_PURGED_TABLES = Object.freeze([
  "audit_events",
  "channel_messages",
  "company_profiles",
  "memberships",
  "orchestration_intents",
  "skills",
  "startup_office_activation_events",
  "startup_office_approvals",
  "startup_office_artifacts",
  "startup_office_assets",
  "startup_office_billing_documents",
  "startup_office_customers",
  "startup_office_deletion_requests",
  "startup_office_loops",
  "startup_office_memory_pages",
  "startup_office_metrics",
  "startup_office_notifications",
  "startup_office_outbox_events",
  "startup_office_receipts",
  "startup_office_runs",
  "startup_office_signals",
  "startup_office_support_access_events",
  "startup_office_terms_acceptances",
  "startup_office_usage_events",
  "startup_office_worker_jobs",
  "team_invites",
  "teams",
  "wiki_article_index",
  "wiki_write_requests",
  "workspace_billing",
  "workspace_settings",
]);

const STARTUP_OFFICE_RETAINED_TABLES = Object.freeze([
  {
    name: "startup_office_deletion_tombstones",
    reason:
      "minimal deletion evidence retained outside the workspace cascade for legal, fraud, and incident-response proof",
  },
]);

function startupOfficeDeletionManifest() {
  return {
    purge_method: "purge_startup_office_workspace",
    purged_tables: [...STARTUP_OFFICE_PURGED_TABLES],
    retained_tables: STARTUP_OFFICE_RETAINED_TABLES.map((table) => ({ ...table })),
    version: STARTUP_OFFICE_DELETION_MANIFEST_VERSION,
  };
}

module.exports = {
  STARTUP_OFFICE_DELETION_MANIFEST_VERSION,
  STARTUP_OFFICE_PURGED_TABLES,
  STARTUP_OFFICE_RETAINED_TABLES,
  startupOfficeDeletionManifest,
};
