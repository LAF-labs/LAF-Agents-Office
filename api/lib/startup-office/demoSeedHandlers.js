const {
  DEMO_ARTIFACTS,
  DEMO_COMPANY_PROFILE,
  DEMO_LOOPS,
  demoSeedUUID,
} = require("./demoSeed");
const {
  STARTUP_OFFICE_LOOP_DEFINITIONS,
} = require("./loopDefinitions");

function createStartupOfficeDemoSeedHandlers(deps) {
  const {
    createHTTPError,
    createStartupOfficeReceipt,
    nowISO,
    publicCompanyProfile,
    publicStartupOfficeApproval,
    publicStartupOfficeArtifact,
    publicStartupOfficeLoop,
    publicStartupOfficeReceipt,
    publicStartupOfficeRun,
    readBody,
    requireAdminRole,
    requireUser,
    safeStartupOfficeRest,
    truncateText,
    truthy,
    workspaceSettings,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function handleStartupOfficeDemoSeed(req, res) {
    const { membership, team, user } = await requireUser(req);
    if (process.env.NODE_ENV === "production" && !truthy(process.env.LAF_OFFICE_ENABLE_DEMO_SEED)) {
      throw createHTTPError(404, "not found");
    }
    requireAdminRole(membership, "owner or admin role required for demo seed");
    const body = await readBody(req);
    const seeded = await seedStartupOfficeDemoWorkspace(membership, team, user, body);
    await writeAuditEvent(membership, "startup_office.demo_seeded", "team", membership.team_id, {
      approval_id: seeded.approval?.id || "",
      artifact_count: seeded.artifacts.length,
      loop_count: seeded.loops.length,
      receipt_count: seeded.receipts.length,
    });
    writeJSON(res, 200, {
      ...seeded,
      status: "ok",
    });
  }

  async function seedStartupOfficeDemoWorkspace(membership, team, user, body = {}) {
    const now = nowISO();
    const companyName = truncateText(
      body.company_name || body.company || DEMO_COMPANY_PROFILE.name,
      160,
    );
    const [profileRow] = await safeStartupOfficeRest("company_profiles", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "team_id" },
      body: {
        ...DEMO_COMPANY_PROFILE,
        metadata: {
          demo_seed: true,
          outcome: "paid_beta_validation_package",
          source: "startup_office_demo_seed",
        },
        name: companyName,
        team_id: membership.team_id,
        updated_at: now,
      },
    });

    const loops = [];
    for (const definition of DEMO_LOOPS) {
      const [loop] = await safeStartupOfficeRest("startup_office_loops", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        query: { on_conflict: "team_id,slug" },
        body: {
          ...definition,
          created_by: membership.user_id,
          policy: {
            founder_approval_required: true,
            source: "demo_seed",
          },
          status: "active",
          team_id: membership.team_id,
          updated_at: now,
        },
      });
      loops.push(publicStartupOfficeLoop(loop || {
        ...definition,
        id: definition.slug,
        status: "active",
      }));
    }

    const loopBySlug = new Map(loops.map((loop) => [loop.slug, loop]));
    const ideaLoop = loopBySlug.get("idea-validation");
    const offerLoop = loopBySlug.get("offer-package");
    const discoveryLoop = loopBySlug.get("customer-discovery");
    const ideaRunID = demoSeedUUID(membership.team_id, "idea-validation-run");
    const offerRunID = demoSeedUUID(membership.team_id, "offer-package-run");
    const discoveryRunID = demoSeedUUID(membership.team_id, "customer-discovery-run");
    const [ideaRun] = await upsertStartupOfficeDemoRun(membership, {
      id: ideaRunID,
      loop_id: ideaLoop?.id || null,
      metadata: { demo_seed: true, loop_slug: "idea-validation" },
      objective: ideaLoop?.objective || DEMO_LOOPS[0].objective,
      status: "waiting_approval",
      title: "Idea Validation",
    });
    const [offerRun] = await upsertStartupOfficeDemoRun(membership, {
      id: offerRunID,
      loop_id: offerLoop?.id || null,
      metadata: { demo_seed: true, loop_slug: "offer-package" },
      objective: offerLoop?.objective || DEMO_LOOPS[1].objective,
      status: "completed",
      summary: "Offer Package demo artifact is ready for founder review.",
      title: "Offer Package",
    });
    await upsertStartupOfficeDemoRun(membership, {
      id: discoveryRunID,
      loop_id: discoveryLoop?.id || null,
      metadata: { demo_seed: true, loop_slug: "customer-discovery" },
      objective: discoveryLoop?.objective || DEMO_LOOPS[2].objective,
      status: "completed",
      summary: "Customer Discovery demo receipt is ready.",
      title: "Customer Discovery",
    });

    const [ideaArtifact] = await upsertStartupOfficeDemoArtifact(membership, {
      content: DEMO_ARTIFACTS.ideaValidation,
      id: demoSeedUUID(membership.team_id, "idea-validation-artifact"),
      kind: "plan",
      metadata: { demo_seed: true, loop_slug: "idea-validation" },
      run_id: ideaRunID,
      title: "Idea Validation draft",
    });
    const [offerArtifact] = await upsertStartupOfficeDemoArtifact(membership, {
      content: DEMO_ARTIFACTS.offerPackage,
      id: demoSeedUUID(membership.team_id, "offer-package-artifact"),
      kind: "report",
      metadata: { demo_seed: true, loop_slug: "offer-package" },
      run_id: offerRunID,
      title: "Offer Package artifact",
    });
    const [approval] = await safeStartupOfficeRest("startup_office_approvals", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "id" },
      body: {
        action: "approve_loop_draft",
        artifact_id: ideaArtifact?.id || null,
        details: truncateText(DEMO_ARTIFACTS.ideaValidation, 4000),
        id: demoSeedUUID(membership.team_id, "idea-validation-approval"),
        metadata: { demo_seed: true, loop_slug: "idea-validation" },
        requested_by: membership.user_id,
        risk_level: "medium",
        run_id: ideaRunID,
        status: "pending",
        team_id: membership.team_id,
        title: "Approve Idea Validation draft",
        updated_at: now,
      },
    });
    const receipts = [];
    receipts.push(await upsertStartupOfficeDemoReceipt(membership, {
      actor_slug: "ceo",
      approval_id: approval?.id || null,
      event_type: "demo.idea_validation_queued",
      id: demoSeedUUID(membership.team_id, "idea-validation-receipt"),
      run_id: ideaRunID,
      summary:
        "Idea Validation demo draft is queued for founder approval with assumptions, risks, and next evidence.",
      trace: { demo_seed: true, loop_slug: "idea-validation" },
    }));
    receipts.push(await upsertStartupOfficeDemoReceipt(membership, {
      actor_slug: "growth",
      event_type: "demo.customer_discovery_ready",
      id: demoSeedUUID(membership.team_id, "customer-discovery-receipt"),
      run_id: discoveryRunID,
      summary:
        "Customer Discovery demo receipt shows the next founder-led interview motion.",
      trace: { demo_seed: true, loop_slug: "customer-discovery" },
    }));
    receipts.push(await upsertStartupOfficeDemoReceipt(membership, {
      actor_slug: "system",
      event_type: "demo.seeded",
      id: demoSeedUUID(membership.team_id, "workspace-demo-seeded"),
      run_id: null,
      summary:
        "Demo workspace seeded for a paid beta validation package with approval-gated artifacts.",
      trace: {
        company: companyName,
        demo_seed: true,
        loops: loops.map((loop) => loop.slug),
      },
    }));

    const settings = await workspaceSettings(membership.team_id);
    return {
      approval: publicStartupOfficeApproval(approval),
      artifacts: [
        publicStartupOfficeArtifact(ideaArtifact),
        publicStartupOfficeArtifact(offerArtifact),
      ].filter(Boolean),
      loops,
      profile: publicCompanyProfile({
        row: profileRow,
        settings,
        team,
        user,
      }),
      receipts: receipts.filter(Boolean),
      runs: [
        publicStartupOfficeRun(ideaRun),
        publicStartupOfficeRun(offerRun),
      ].filter(Boolean),
    };
  }

  async function upsertStartupOfficeDemoRun(membership, body) {
    return await safeStartupOfficeRest("startup_office_runs", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "id" },
      body: {
        created_at: nowISO(),
        created_by: membership.user_id,
        inputs: { demo_seed: true },
        started_at: nowISO(),
        summary: "",
        team_id: membership.team_id,
        updated_at: nowISO(),
        ...body,
      },
    });
  }

  async function upsertStartupOfficeDemoArtifact(membership, body) {
    return await safeStartupOfficeRest("startup_office_artifacts", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "id" },
      body: {
        created_by: membership.user_id,
        team_id: membership.team_id,
        ...body,
      },
    });
  }

  async function upsertStartupOfficeDemoReceipt(membership, body) {
    const [receipt] = await safeStartupOfficeRest("startup_office_receipts", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=representation",
      query: { on_conflict: "id" },
      body: {
        approval_id: null,
        created_by: membership.user_id,
        team_id: membership.team_id,
        trace: {},
        ...body,
      },
    });
    return publicStartupOfficeReceipt(receipt);
  }

  async function seedStartupOfficeWorkspace(membership, team, body) {
    const loops = [];
    for (const definition of STARTUP_OFFICE_LOOP_DEFINITIONS) {
      const [loop] = await safeStartupOfficeRest("startup_office_loops", {
        method: "POST",
        prefer: "resolution=merge-duplicates,return=representation",
        query: { on_conflict: "team_id,slug" },
        body: {
          cadence: definition.cadence,
          created_by: membership.user_id,
          department: definition.department,
          name: definition.name,
          objective: definition.objective,
          policy: { founder_approval_required: true, source: "onboarding_seed" },
          slug: definition.slug,
          status: "active",
          team_id: membership.team_id,
          updated_at: nowISO(),
        },
      });
      loops.push(publicStartupOfficeLoop(loop || { ...definition, id: definition.slug, status: "active" }));
    }
    const receipt = await createStartupOfficeReceipt(membership, {
      actor_slug: "system",
      event_type: "workspace.onboarded",
      run_id: null,
      summary: `${team?.name || "Workspace"} Startup Office was initialized with founder-controlled operating loops.`,
      trace: {
        company: truncateText(body.company || body.company_name || team?.name || "", 160),
        loops: loops.map((loop) => loop.slug),
      },
    });
    return { loops, receipt };
  }

  return {
    demoSeed: handleStartupOfficeDemoSeed,
    seedStartupOfficeWorkspace,
  };
}

module.exports = {
  createStartupOfficeDemoSeedHandlers,
};
