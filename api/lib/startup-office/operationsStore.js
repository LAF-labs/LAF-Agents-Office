const {
  activationEventsForTeam,
  startupOfficeActivationSnapshot,
} = require("./activationAnalytics");
const {
  publicStartupOfficeTermsAcceptance,
  startupOfficeTermsSnapshot,
} = require("./betaTerms");
const {
  startupOfficeBillingProviderValue,
  startupOfficeBillingStateValue,
  startupOfficePaymentStatusValue,
} = require("./billingState");
const {
  publicStartupOfficeBillingDocument,
  startupOfficeCommercialSnapshot,
  startupOfficeEntitlementSnapshot,
} = require("./commercialBilling");

const STARTUP_OFFICE_STORAGE_SOURCES = Object.freeze([
  ["startup_office_activation_events", "milestone,source_table,source_id,metadata"],
  ["company_profiles", "description,goals,priority,icp,offer,positioning,metadata"],
  ["startup_office_artifacts", "title,content,metadata"],
  ["startup_office_assets", "name,body,metadata"],
  ["startup_office_billing_documents", "document_type,status,reference_url,external_reference,notes,metadata"],
  ["startup_office_customers", "name,profile,notes"],
  ["startup_office_loops", "name,objective,policy"],
  ["startup_office_memory_pages", "slug,title,body,summary,provenance,sources,assumptions"],
  ["startup_office_metrics", "metric_key,unit,metadata"],
  ["startup_office_receipts", "summary,trace"],
  ["startup_office_runs", "title,objective,inputs,metadata,summary"],
  ["startup_office_signals", "source,title,body,metadata"],
  ["startup_office_terms_acceptances", "terms_version,privacy_version,dpa_version,ai_use_version,retention_version,deletion_version,metadata"],
]);

function createStartupOfficeOperationsStore(deps) {
  const {
    clamp,
    nowISO,
    safeStartupOfficeRest,
    shortID,
  } = deps;

  async function startupOfficeBetaOpsSnapshot(teamID, options = {}) {
    const [billing, usage, billingDocuments, activationEvents, termsAcceptances] = await Promise.all([
      startupOfficeBilling(teamID),
      startupOfficeUsage(teamID, options),
      startupOfficeBillingDocuments(teamID, { limit: options.billing_documents_limit }),
      activationEventsForTeam(teamID, safeStartupOfficeRest, {
        limit: options.activation_event_limit,
      }),
      startupOfficeTermsAcceptances(teamID, { limit: options.terms_acceptances_limit }),
    ]);
    const terms = startupOfficeTermsSnapshot(termsAcceptances);
    const commercial = startupOfficeCommercialSnapshot({
      billing,
      documents: billingDocuments,
      termsAccepted: terms.accepted,
    });
    const entitlements = startupOfficeEntitlementSnapshot({
      billing,
      commercial,
      usage,
    });
    return {
      activation: startupOfficeActivationSnapshot(activationEvents),
      activation_events: activationEvents,
      billing,
      billing_documents: billingDocuments,
      commercial,
      entitlements,
      limits: {
        monthly_model_spend_cents: billing.monthly_model_spend_cents,
        monthly_run_limit: billing.monthly_run_limit,
        seat_limit: billing.seat_limit,
        storage_mb_limit: billing.storage_mb_limit,
      },
      terms,
      usage: {
        ...usage,
        model_spend_percent: percent(usage.model_spend_cents, billing.monthly_model_spend_cents),
        run_percent: percent(usage.runs, billing.monthly_run_limit),
        seat_percent: percent(usage.seats + usage.pending_invites, billing.seat_limit),
        storage_percent: percent(usage.storage_mb, billing.storage_mb_limit),
      },
    };
  }

  async function startupOfficeBillingDocuments(teamID, options = {}) {
    const rows = await safeStartupOfficeRest("startup_office_billing_documents", {
      query: {
        limit: String(clamp(Number(options.limit) || 20, 1, 100)),
        order: "created_at.desc",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    });
    return rows.map(publicStartupOfficeBillingDocument);
  }

  async function startupOfficeTermsAcceptances(teamID, options = {}) {
    const rows = await safeStartupOfficeRest("startup_office_terms_acceptances", {
      query: {
        limit: String(clamp(Number(options.limit) || 10, 1, 100)),
        order: "accepted_at.desc",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    });
    return rows.map(publicStartupOfficeTermsAcceptance).filter(Boolean);
  }

  async function startupOfficeBilling(teamID) {
    const rows = await safeStartupOfficeRest("workspace_billing", {
      query: {
        limit: "1",
        select: "*",
        team_id: `eq.${teamID}`,
      },
    });
    const billing = rows?.[0] || {};
    return {
      beta_agreement_url: billing.beta_agreement_url || "",
      billing_provider: startupOfficeBillingProviderValue(billing.billing_provider || "manual"),
      billing_state: startupOfficeBillingStateValue(billing.billing_state || "trial"),
      blocked_reason: billing.blocked_reason || "",
      laf_model_enabled: billing.laf_model_enabled !== false,
      last_paid_at: billing.last_paid_at || null,
      monthly_model_spend_cents: Number(billing.monthly_model_spend_cents || 20000),
      monthly_run_limit: Number(billing.monthly_run_limit || 50),
      payment_status: startupOfficePaymentStatusValue(billing.payment_status || billing.billing_state),
      plan: billing.plan || "trial",
      seat_limit: Number(billing.seat_limit || 5),
      storage_mb_limit: Number(billing.storage_mb_limit || 1024),
      support_notes: billing.support_notes || "",
      team_id: teamID,
      updated_at: billing.updated_at || null,
    };
  }

  async function upsertStartupOfficeBilling(teamID, patch) {
    const [billing] = await safeStartupOfficeRest("workspace_billing", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "team_id" },
      body: {
        ...patch,
        team_id: teamID,
        updated_at: nowISO(),
      },
    });
    return {
      ...(billing || patch),
      team_id: teamID,
    };
  }

  async function upsertStartupOfficeBillingDocument(membership, patch) {
    if (!patch) return null;
    const [document] = await safeStartupOfficeRest("startup_office_billing_documents", {
      method: "POST",
      body: {
        ...patch,
        created_by: patch.created_by || membership.user_id || null,
        team_id: membership.team_id,
      },
    });
    return publicStartupOfficeBillingDocument(document || patch);
  }

  async function upsertStartupOfficeTermsAcceptance(membership, patch) {
    const [acceptance] = await safeStartupOfficeRest("startup_office_terms_acceptances", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "team_id,terms_version" },
      body: {
        ...patch,
        team_id: membership.team_id,
        updated_at: nowISO(),
      },
    });
    return publicStartupOfficeTermsAcceptance(acceptance || { id: shortID(), ...patch });
  }

  async function startupOfficeUsage(teamID, options = {}) {
    const [events, memberships, invites, storageBytes] = await Promise.all([
      safeStartupOfficeRest("startup_office_usage_events", {
        query: {
          limit: String(clamp(Number(options.usage_event_limit) || 1000, 1, 1000)),
          order: "created_at.desc",
          select: "event_type,cost_cents,tool_calls,total_tokens",
          team_id: `eq.${teamID}`,
        },
      }),
      safeStartupOfficeRest("memberships", {
        query: {
          limit: String(clamp(Number(options.membership_limit) || 1000, 1, 1000)),
          select: "id",
          status: "eq.active",
          team_id: `eq.${teamID}`,
        },
      }),
      safeStartupOfficeRest("team_invites", {
        query: {
          limit: String(clamp(Number(options.invite_limit) || 1000, 1, 1000)),
          select: "id",
          status: "eq.pending",
          team_id: `eq.${teamID}`,
        },
      }),
      startupOfficeStorageUsage(teamID, { row_limit: options.storage_row_limit }),
    ]);
    return events.reduce(
      (out, event) => {
        out.model_spend_cents += Number(event.cost_cents || 0);
        out.runs += event.event_type === "model_run" ? 1 : 0;
        out.tool_calls += Number(event.tool_calls || 0);
        out.total_tokens += Number(event.total_tokens || 0);
        return out;
      },
      {
        model_spend_cents: 0,
        pending_invites: invites.length,
        runs: 0,
        seats: memberships.length,
        storage_bytes: storageBytes,
        storage_mb: storageBytes / 1024 / 1024,
        tool_calls: 0,
        total_tokens: 0,
      },
    );
  }

  async function startupOfficeStorageUsage(teamID, options = {}) {
    const rowLimit = String(clamp(Number(options.row_limit) || 1000, 1, 1000));
    const rowsBySource = await Promise.all(
      STARTUP_OFFICE_STORAGE_SOURCES.map(([table, select]) =>
        safeStartupOfficeRest(table, {
          query: {
            limit: rowLimit,
            select,
            team_id: `eq.${teamID}`,
          },
        }),
      ),
    );
    return rowsBySource.flat().reduce((sum, row) => {
      return sum + Buffer.byteLength(JSON.stringify(row || {}), "utf8");
    }, 0);
  }

  async function startupOfficeStuckJobs(teamID) {
    return safeStartupOfficeRest("startup_office_worker_jobs", {
      query: {
        limit: "20",
        select: "*",
        status: "in.(queued,running,failed,dead_letter)",
        team_id: `eq.${teamID}`,
      },
    });
  }

  return {
    startupOfficeBetaOpsSnapshot,
    startupOfficeBilling,
    startupOfficeBillingDocuments,
    startupOfficeStuckJobs,
    startupOfficeStorageUsage,
    startupOfficeTermsAcceptances,
    startupOfficeUsage,
    upsertStartupOfficeBilling,
    upsertStartupOfficeBillingDocument,
    upsertStartupOfficeTermsAcceptance,
  };
}

function percent(value, limit) {
  const denominator = Number(limit || 0);
  if (!denominator) return 0;
  return Math.round((Number(value || 0) / denominator) * 100);
}

module.exports = {
  STARTUP_OFFICE_STORAGE_SOURCES,
  createStartupOfficeOperationsStore,
  percent,
};
