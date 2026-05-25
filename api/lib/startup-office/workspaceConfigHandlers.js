const DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY = Object.freeze({
  founder_approval_required: {
    customer_promises: true,
    legal_sensitive_language: true,
    outbound_messages: true,
    pricing_changes: true,
    public_claims: true,
    spend: true,
  },
  require_citations_for_public_claims: true,
  revision_enabled: true,
  support_access: {
    logged: true,
    time_bound_hours: 24,
    visible_to_owner: true,
  },
});

function createStartupOfficeWorkspaceConfigHandlers(deps) {
  const {
    clamp,
    createHTTPError,
    nowISO,
    objectValue,
    readBody,
    requirePermission,
    requireUser,
    rest,
    safeStartupOfficeRest,
    seedStartupOfficeWorkspace,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleHostedConfig(req, res) {
    const { membership, team, user } = await requireUser(req);
    if (req.method === "GET") {
      const settings = await workspaceSettings(membership.team_id);
      writeJSON(res, 200, hostedConfigSnapshot({ settings, team, user }));
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");

    requirePermission(membership, "workspace:manage");
    const body = await readBody(req);
    const existing = await workspaceSettings(membership.team_id);
    const patch = workspaceSettingsPatch(existing, body);
    const settings = await upsertWorkspaceSettings(membership.team_id, patch);
    await writeAuditEvent(membership, "workspace_config.updated", "team", membership.team_id, {
      company_profile_fields: Object.keys(patch.company_profile || {}).sort(),
      preference_fields: Object.keys(patch.preferences || {}).sort(),
    });
    writeJSON(res, 200, {
      config: hostedConfigSnapshot({ settings, team, user }),
      status: "ok",
    });
  }

  async function handleHostedOnboardingState(req, res) {
    const { membership } = await requireUser(req);
    const settings = await workspaceSettings(membership.team_id);
    const fallbackOnboarded = settings
      ? false
      : await workspaceHasStartupOfficeState(membership.team_id);
    writeJSON(res, 200, {
      onboarded: Boolean(settings?.onboarding_completed_at) || fallbackOnboarded,
      onboarding_completed_at: settings?.onboarding_completed_at || null,
    });
  }

  async function handleHostedOnboardingComplete(req, res) {
    const { membership, team, user } = await requireUser(req);
    requirePermission(membership, "workspace:manage");
    const body = await readBody(req);
    const existing = await workspaceSettings(membership.team_id);
    const patch = workspaceSettingsPatch(existing, body);
    patch.onboarding_completed_at =
      existing?.onboarding_completed_at || nowISO();

    const settings = await upsertWorkspaceSettings(membership.team_id, patch);
    const seeded = existing?.onboarding_completed_at
      ? { loops: [], receipt: null }
      : await seedStartupOfficeWorkspace(membership, team, body);
    await writeAuditEvent(membership, "onboarding.completed", "team", membership.team_id, {
      loop_count: seeded.loops?.length || 0,
      receipt_id: seeded.receipt?.id || "",
    });
    writeJSON(res, 200, {
      config: hostedConfigSnapshot({ settings, team, user }),
      loops: seeded.loops || [],
      onboarded: true,
      receipt: seeded.receipt || null,
      status: "ok",
    });
  }

  async function workspaceSettings(teamID) {
    try {
      const rows = await rest("workspace_settings", {
        query: {
          limit: "1",
          select: "*",
          team_id: `eq.${teamID}`,
        },
      });
      return rows?.[0] || null;
    } catch (err) {
      if (isMissingWorkspaceSettingsError(err)) return null;
      throw err;
    }
  }

  async function upsertWorkspaceSettings(teamID, patch) {
    try {
      const [settings] = await rest("workspace_settings", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        query: { on_conflict: "team_id" },
        body: {
          ...patch,
          team_id: teamID,
          updated_at: nowISO(),
        },
      });
      return settings || { ...patch, team_id: teamID };
    } catch (err) {
      if (isMissingWorkspaceSettingsError(err)) {
        return { ...patch, team_id: teamID, updated_at: nowISO() };
      }
      throw err;
    }
  }

  function workspaceSettingsPatch(existing, body) {
    const currentProfile = objectValue(existing?.company_profile);
    const currentPreferences = objectValue(existing?.preferences);
    const companyProfile = {
      ...currentProfile,
      ...companyProfilePatch(body),
    };
    const preferences = {
      ...currentPreferences,
      ...workspacePreferencesPatch(body),
    };
    const patch = {
      company_profile: companyProfile,
      preferences,
    };
    if (body.llm_provider !== undefined) {
      patch.llm_provider = normalizeHostedLLMProvider(body.llm_provider);
    } else if (!existing?.llm_provider) {
      patch.llm_provider = "claude-code";
    }
    if (body.team_lead_slug !== undefined) {
      patch.team_lead_slug = truncateText(body.team_lead_slug, 80);
    } else if (!existing?.team_lead_slug) {
      patch.team_lead_slug = "ceo";
    }
    return patch;
  }

  function startupOfficeApprovalPolicy(settings) {
    const preferences = objectValue(settings?.preferences);
    const raw = objectValue(preferences.startup_office_approval_policy);
    const approvalRequired = objectValue(raw.founder_approval_required);
    const supportAccess = objectValue(raw.support_access);
    return {
      founder_approval_required: {
        ...DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.founder_approval_required,
        ...approvalRequired,
      },
      require_citations_for_public_claims:
        raw.require_citations_for_public_claims === undefined
          ? DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.require_citations_for_public_claims
          : Boolean(raw.require_citations_for_public_claims),
      revision_enabled:
        raw.revision_enabled === undefined
          ? DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.revision_enabled
          : Boolean(raw.revision_enabled),
      support_access: {
        ...DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.support_access,
        ...supportAccess,
        time_bound_hours: clamp(
          Number(supportAccess.time_bound_hours || DEFAULT_STARTUP_OFFICE_APPROVAL_POLICY.support_access.time_bound_hours),
          1,
          168,
        ),
      },
    };
  }

  function companyProfilePatch(body) {
    const profile = objectValue(body.company_profile);
    const out = { ...profile };
    const companyName = body.company_name ?? body.company;
    if (companyName !== undefined) out.name = truncateText(companyName, 160);
    const companyDescription = body.company_description ?? body.description;
    if (companyDescription !== undefined) {
      out.description = truncateText(companyDescription, 2000);
    }
    if (body.company_goals !== undefined) out.goals = truncateText(body.company_goals, 2000);
    if (body.company_size !== undefined) out.size = truncateText(body.company_size, 120);
    const priority = body.company_priority ?? body.priority;
    if (priority !== undefined) out.priority = truncateText(priority, 1000);
    return out;
  }

  function workspacePreferencesPatch(body) {
    const out = {};
    for (const key of ["blueprint"]) {
      if (body[key] !== undefined) out[key] = truncateText(body[key], 1000);
    }
    for (const key of [
      "insights_poll_minutes",
      "max_concurrent_agents",
      "task_follow_up_minutes",
      "task_recheck_minutes",
      "task_reminder_minutes",
    ]) {
      if (body[key] !== undefined && Number.isFinite(Number(body[key]))) {
        out[key] = Number(body[key]);
      }
    }
    for (const key of ["agent_names", "agents"]) {
      if (Array.isArray(body[key])) out[key] = body[key].map((item) => truncateText(item, 120));
    }
    const firstTask = body.task ?? body.first_task;
    if (firstTask !== undefined) out.first_task = truncateText(firstTask, 1000);
    return out;
  }

  function hostedConfigSnapshot({ settings, team, user }) {
    const company = objectValue(settings?.company_profile);
    const preferences = objectValue(settings?.preferences);
    return {
      blueprint: preferences.blueprint || "",
      company_description: company.description || "",
      company_goals: company.goals || "",
      company_name: company.name || team?.name || "",
      company_priority: company.priority || "",
      company_size: company.size || "",
      email: user?.email || "",
      insights_poll_minutes: Number(preferences.insights_poll_minutes || 60),
      llm_provider: normalizeHostedLLMProvider(settings?.llm_provider),
      max_concurrent_agents: Number(preferences.max_concurrent_agents || 3),
      task_follow_up_minutes: Number(preferences.task_follow_up_minutes || 1440),
      task_recheck_minutes: Number(preferences.task_recheck_minutes || 1440),
      task_reminder_minutes: Number(preferences.task_reminder_minutes || 60),
      team_lead_slug: settings?.team_lead_slug || "ceo",
      workspace_id: team?.id || "",
      workspace_slug: team?.slug || "",
    };
  }

  async function workspaceHasStartupOfficeState(teamID) {
    const rows = await safeStartupOfficeRest("startup_office_loops", {
      query: {
        limit: "1",
        select: "id",
        team_id: `eq.${teamID}`,
      },
    }).catch(() => []);
    return Boolean(rows?.length);
  }

  return {
    config: handleHostedConfig,
    hostedConfigSnapshot,
    onboardingComplete: handleHostedOnboardingComplete,
    onboardingState: handleHostedOnboardingState,
    startupOfficeApprovalPolicy,
    upsertWorkspaceSettings,
    workspaceSettings,
    workspaceSettingsPatch,
  };
}

function normalizeHostedLLMProvider(value) {
  const provider = String(value || "").trim().toLowerCase().replace(/_/g, "-");
  if (provider === "codex") return "codex";
  if (provider === "claude" || provider === "claude-code") return "claude-code";
  return "claude-code";
}

function isMissingWorkspaceSettingsError(err) {
  if (!err || err.status !== 404) return false;
  return String(err.message || "").includes("workspace_settings");
}

module.exports = {
  createStartupOfficeWorkspaceConfigHandlers,
};
