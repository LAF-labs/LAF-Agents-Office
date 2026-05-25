const STARTUP_OFFICE_EXPORT_SCHEMA_VERSION = "startup-office-export.v2";

const STARTUP_OFFICE_EXPORTED_TABLES = Object.freeze([
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
  "startup_office_receipts",
  "startup_office_runs",
  "startup_office_signals",
  "startup_office_support_access_events",
  "startup_office_terms_acceptances",
  "startup_office_usage_events",
  "team_invites",
  "teams",
  "wiki_article_index",
  "wiki_write_requests",
  "workspace_billing",
  "workspace_settings",
]);

const STARTUP_OFFICE_EXPORT_OMITTED_TABLES = Object.freeze([
  {
    name: "startup_office_outbox_events",
    reason: "internal delivery queue; receipts, notifications, and usage events are exported as the customer-visible evidence",
  },
  {
    name: "startup_office_worker_jobs",
    reason: "internal execution queue; runs, artifacts, approvals, receipts, and usage events are exported as the customer-visible outcome",
  },
  {
    name: "startup_office_deletion_tombstones",
    reason: "post-deletion legal proof retained outside workspace export",
  },
]);

function startupOfficeExportManifest() {
  return {
    exported_tables: [...STARTUP_OFFICE_EXPORTED_TABLES],
    omitted_tables: STARTUP_OFFICE_EXPORT_OMITTED_TABLES.map((table) => ({ ...table })),
    schema_version: STARTUP_OFFICE_EXPORT_SCHEMA_VERSION,
  };
}

module.exports = {
  STARTUP_OFFICE_EXPORTED_TABLES,
  STARTUP_OFFICE_EXPORT_OMITTED_TABLES,
  STARTUP_OFFICE_EXPORT_SCHEMA_VERSION,
  startupOfficeExportManifest,
};
