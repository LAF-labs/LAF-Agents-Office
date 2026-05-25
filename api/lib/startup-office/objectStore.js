function createStartupOfficeObjectStore(deps) {
  const {
    applyStartupOfficeCursor,
    applyStartupOfficeObjectListQuery,
    clamp,
    createHTTPError,
    nowISO,
    objectValue,
    publicStartupOfficeAsset,
    publicStartupOfficeCustomer,
    publicStartupOfficeMetric,
    publicStartupOfficeSignal,
    safeStartupOfficeRest,
    startupOfficeAssetStatus,
    startupOfficeCustomerStatus,
    startupOfficeSignalStatus,
    startupOfficeSignalType,
    truncateText,
  } = deps;

  async function startupOfficeObjectRows(teamID, kind, options = {}) {
    const definition = startupOfficeObjectDefinition(kind);
    const query = {
      select: "*",
      team_id: `eq.${teamID}`,
    };
    applyStartupOfficeObjectListQuery(query, kind, options);
    applyStartupOfficeCursor(query, options.cursor);
    if (options.limit) query.limit = String(clamp(Number(options.limit) || 100, 1, 1000));
    const rows = await safeStartupOfficeRest(definition.table, { query });
    return rows.map(definition.public).filter(Boolean);
  }

  function startupOfficeObjectDefinition(kind) {
    const definitions = {
      assets: {
        public: publicStartupOfficeAsset,
        responseKey: "assets",
        singularKey: "asset",
        table: "startup_office_assets",
      },
      customers: {
        public: publicStartupOfficeCustomer,
        responseKey: "customers",
        singularKey: "customer",
        table: "startup_office_customers",
      },
      metrics: {
        public: publicStartupOfficeMetric,
        responseKey: "metrics",
        singularKey: "metric",
        table: "startup_office_metrics",
      },
      signals: {
        public: publicStartupOfficeSignal,
        responseKey: "signals",
        singularKey: "signal",
        table: "startup_office_signals",
      },
    };
    const definition = definitions[kind];
    if (!definition) throw createHTTPError(404, "startup office object not found");
    return definition;
  }

  function startupOfficeObjectPayload(kind, membership, body) {
    const now = nowISO();
    if (kind === "assets") {
      return {
        body: truncateText(body.body || "", 30000),
        created_by: membership.user_id,
        kind: truncateText(body.kind || "document", 80),
        metadata: objectValue(body.metadata),
        name: truncateText(body.name || "Untitled asset", 180),
        run_id: body.run_id || null,
        status: startupOfficeAssetStatus(body.status),
        team_id: membership.team_id,
        updated_at: now,
      };
    }
    if (kind === "customers") {
      return {
        created_by: membership.user_id,
        loop_id: body.loop_id || body.discovery_loop_id || null,
        name: truncateText(body.name || "Untitled customer", 180),
        notes: truncateText(body.notes || "", 6000),
        profile: objectValue(body.profile),
        status: startupOfficeCustomerStatus(body.status),
        team_id: membership.team_id,
        updated_at: now,
      };
    }
    if (kind === "metrics") {
      return {
        created_by: membership.user_id,
        metadata: objectValue(body.metadata),
        metric_key: truncateText(body.metric_key || body.key || "metric", 120),
        metric_value: numericOrNull(body.metric_value ?? body.value),
        period_end: body.period_end || null,
        period_start: body.period_start || null,
        team_id: membership.team_id,
        unit: truncateText(body.unit || "", 40),
        updated_at: now,
      };
    }
    if (kind === "signals") {
      return {
        body: truncateText(body.body || "", 6000),
        created_by: membership.user_id,
        loop_id: body.loop_id || body.discovery_loop_id || null,
        metadata: objectValue(body.metadata),
        run_id: body.run_id || null,
        signal_type: startupOfficeSignalType(body.signal_type || body.type),
        source: truncateText(body.source || "manual", 120),
        status: startupOfficeSignalStatus(body.status),
        team_id: membership.team_id,
        title: truncateText(body.title || "Untitled signal", 180),
        updated_at: now,
      };
    }
    throw createHTTPError(400, "unsupported startup office object");
  }

  function startupOfficeObjectPatch(kind, body) {
    const patch = { updated_at: nowISO() };
    if (kind === "assets") {
      for (const key of ["name", "kind", "body"]) {
        if (body[key] !== undefined) patch[key] = truncateText(body[key], key === "body" ? 30000 : 180);
      }
      if (body.metadata !== undefined) patch.metadata = objectValue(body.metadata);
      if (body.run_id !== undefined) patch.run_id = body.run_id || null;
      if (body.status !== undefined || body.archive) {
        patch.status = body.archive ? "archived" : startupOfficeAssetStatus(body.status);
      }
      return patch;
    }
    if (kind === "customers") {
      if (body.loop_id !== undefined || body.discovery_loop_id !== undefined) {
        patch.loop_id = body.loop_id || body.discovery_loop_id || null;
      }
      if (body.name !== undefined) patch.name = truncateText(body.name, 180);
      if (body.notes !== undefined) patch.notes = truncateText(body.notes, 6000);
      if (body.profile !== undefined) patch.profile = objectValue(body.profile);
      if (body.status !== undefined || body.archive) {
        patch.status = body.archive ? "archived" : startupOfficeCustomerStatus(body.status);
      }
      return patch;
    }
    if (kind === "metrics") {
      if (body.metric_key !== undefined || body.key !== undefined) {
        patch.metric_key = truncateText(body.metric_key || body.key, 120);
      }
      if (body.metric_value !== undefined || body.value !== undefined) {
        patch.metric_value = numericOrNull(body.metric_value ?? body.value);
      }
      for (const key of ["unit", "period_start", "period_end"]) {
        if (body[key] !== undefined) patch[key] = body[key];
      }
      if (body.metadata !== undefined) patch.metadata = objectValue(body.metadata);
      return patch;
    }
    if (kind === "signals") {
      if (body.loop_id !== undefined || body.discovery_loop_id !== undefined) {
        patch.loop_id = body.loop_id || body.discovery_loop_id || null;
      }
      if (body.run_id !== undefined) patch.run_id = body.run_id || null;
      if (body.signal_type !== undefined || body.type !== undefined) {
        patch.signal_type = startupOfficeSignalType(body.signal_type || body.type);
      }
      if (body.title !== undefined) patch.title = truncateText(body.title, 180);
      if (body.body !== undefined) patch.body = truncateText(body.body, 6000);
      if (body.source !== undefined) patch.source = truncateText(body.source, 120);
      if (body.metadata !== undefined) patch.metadata = objectValue(body.metadata);
      if (body.status !== undefined || body.archive) {
        patch.status = body.archive ? "archived" : startupOfficeSignalStatus(body.status);
      }
      return patch;
    }
    throw createHTTPError(400, "unsupported startup office object");
  }

  return {
    numericOrNull,
    startupOfficeObjectDefinition,
    startupOfficeObjectPatch,
    startupOfficeObjectPayload,
    startupOfficeObjectRows,
  };
}

function numericOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

module.exports = {
  createStartupOfficeObjectStore,
  numericOrNull,
};
