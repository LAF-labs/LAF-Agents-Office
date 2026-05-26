const STARTUP_OFFICE_EXPORT_SCHEMA_VERSION = "startup-office-export.v2";
const STARTUP_OFFICE_EXPORT_ROW_LIMIT = 1000;
const STARTUP_OFFICE_EXPORT_CHUNK_LIMIT = 100;

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

const STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS = Object.freeze({
  approvals: Object.freeze({ cursor_field: "requested_at", source_table: "startup_office_approvals" }),
  artifacts: Object.freeze({ cursor_field: "created_at", source_table: "startup_office_artifacts" }),
  assets: Object.freeze({ cursor_field: "created_at", source_table: "startup_office_assets" }),
  audit_events: Object.freeze({ cursor_field: "created_at", source_table: "audit_events" }),
  channel_messages: Object.freeze({ cursor_field: "created_at", source_table: "channel_messages" }),
  customers: Object.freeze({ cursor_field: "created_at", source_table: "startup_office_customers" }),
  memory_pages: Object.freeze({ cursor_field: "updated_at", source_table: "startup_office_memory_pages" }),
  metrics: Object.freeze({ cursor_field: "created_at", source_table: "startup_office_metrics" }),
  notifications: Object.freeze({ cursor_field: "created_at", source_table: "startup_office_notifications" }),
  receipts: Object.freeze({ cursor_field: "created_at", source_table: "startup_office_receipts" }),
  runs: Object.freeze({ cursor_field: "created_at", source_table: "startup_office_runs" }),
  signals: Object.freeze({ cursor_field: "created_at", source_table: "startup_office_signals" }),
  usage_events: Object.freeze({ cursor_field: "created_at", source_table: "startup_office_usage_events" }),
});

function startupOfficeExportManifest() {
  return {
    chunked_collections: startupOfficeExportChunkCollections(),
    exported_tables: [...STARTUP_OFFICE_EXPORTED_TABLES],
    omitted_tables: STARTUP_OFFICE_EXPORT_OMITTED_TABLES.map((table) => ({ ...table })),
    row_limit: STARTUP_OFFICE_EXPORT_ROW_LIMIT,
    schema_version: STARTUP_OFFICE_EXPORT_SCHEMA_VERSION,
  };
}

function startupOfficeExportChunkManifest() {
  return {
    collections: startupOfficeExportChunkCollections(),
    endpoint: "/startup-office/export?collection={collection}&cursor={next_cursor}",
    max_limit: STARTUP_OFFICE_EXPORT_CHUNK_LIMIT,
  };
}

function startupOfficeExportChunkCollections() {
  return Object.entries(STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS).map(([collection, descriptor]) => ({
    collection,
    cursor_field: descriptor.cursor_field,
    max_limit: STARTUP_OFFICE_EXPORT_CHUNK_LIMIT,
    source_table: descriptor.source_table,
  }));
}

function startupOfficeExportLimitReport(exportBundle, rowLimit = STARTUP_OFFICE_EXPORT_ROW_LIMIT) {
  return {
    chunked_endpoint: "/startup-office/export?collection={collection}&cursor={next_cursor}",
    possibly_truncated_collections: Object.entries(exportBundle)
      .filter(([, value]) => Array.isArray(value) && value.length >= rowLimit)
      .map(([key, value]) => ({
        chunked: Boolean(STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS[key]),
        count: value.length,
        key,
        row_limit: rowLimit,
      })),
    row_limit: rowLimit,
  };
}

module.exports = {
  STARTUP_OFFICE_EXPORTED_TABLES,
  STARTUP_OFFICE_EXPORT_CHUNK_COLLECTIONS,
  STARTUP_OFFICE_EXPORT_CHUNK_LIMIT,
  STARTUP_OFFICE_EXPORT_OMITTED_TABLES,
  STARTUP_OFFICE_EXPORT_ROW_LIMIT,
  STARTUP_OFFICE_EXPORT_SCHEMA_VERSION,
  startupOfficeExportChunkManifest,
  startupOfficeExportLimitReport,
  startupOfficeExportManifest,
};
