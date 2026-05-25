const STARTUP_OFFICE_OBJECT_QUERY_CONTRACTS = Object.freeze({
  assets: Object.freeze({
    filters: Object.freeze({ kind: "kind", run_id: "run_id", status: "status" }),
    sorts: Object.freeze(["created_at.desc", "updated_at.desc", "name.asc", "name.desc"]),
  }),
  customers: Object.freeze({
    filters: Object.freeze({ discovery_loop_id: "loop_id", loop_id: "loop_id", status: "status" }),
    sorts: Object.freeze(["created_at.desc", "updated_at.desc", "name.asc", "name.desc", "status.asc"]),
  }),
  metrics: Object.freeze({
    filters: Object.freeze({ key: "metric_key", metric_key: "metric_key", unit: "unit" }),
    sorts: Object.freeze(["created_at.desc", "updated_at.desc", "metric_key.asc", "metric_key.desc"]),
  }),
  signals: Object.freeze({
    filters: Object.freeze({
      discovery_loop_id: "loop_id",
      loop_id: "loop_id",
      run_id: "run_id",
      signal_type: "signal_type",
      status: "status",
      type: "signal_type",
    }),
    sorts: Object.freeze(["created_at.desc", "updated_at.desc", "signal_type.asc", "title.asc", "title.desc"]),
  }),
});

function startupOfficeObjectListOptions(kind, query = {}, { createHTTPError, page } = {}) {
  const contract = objectQueryContract(kind);
  const options = {
    cursor: page?.cursor || "",
    limit: page?.request_limit,
  };
  for (const [queryKey, optionKey] of Object.entries(contract.filters)) {
    const value = firstQueryValue(query?.[queryKey]);
    if (value && options[optionKey] === undefined) options[optionKey] = value;
  }
  const order = startupOfficeObjectSortOrder(kind, query?.sort || query?.order, { createHTTPError });
  if (order) options.order = order;
  return options;
}

function applyStartupOfficeObjectListQuery(restQuery, kind, options = {}) {
  const contract = objectQueryContract(kind);
  restQuery.order = startupOfficeObjectSortOrder(kind, options.order || "created_at.desc");
  for (const column of new Set(Object.values(contract.filters))) {
    const value = firstQueryValue(options[column]);
    if (value) restQuery[column] = `eq.${value}`;
  }
}

function startupOfficeObjectSortOrder(kind, value, { createHTTPError } = {}) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  const order = raw.replace(/[^a-z0-9_.]+/g, "_");
  const allowed = objectQueryContract(kind).sorts;
  if (allowed.includes(order)) return order;
  const message = `sort must be one of: ${allowed.join(", ")}`;
  if (createHTTPError) throw createHTTPError(400, message);
  const err = new Error(message);
  err.status = 400;
  throw err;
}

function objectQueryContract(kind) {
  const contract = STARTUP_OFFICE_OBJECT_QUERY_CONTRACTS[kind];
  if (!contract) {
    const err = new Error("startup office object query contract not found");
    err.status = 404;
    throw err;
  }
  return contract;
}

function firstQueryValue(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  return String(raw || "").trim();
}

module.exports = {
  STARTUP_OFFICE_OBJECT_QUERY_CONTRACTS,
  applyStartupOfficeObjectListQuery,
  startupOfficeObjectListOptions,
  startupOfficeObjectSortOrder,
};
