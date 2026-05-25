const STARTUP_OFFICE_OBJECT_INVARIANTS = Object.freeze({
  assets: Object.freeze({
    default_status: "active",
    statuses: Object.freeze(["active", "archived"]),
  }),
  customers: Object.freeze({
    default_status: "lead",
    statuses: Object.freeze(["lead", "interviewing", "qualified", "customer", "lost", "archived"]),
  }),
  metrics: Object.freeze({
    numeric_value_required: false,
  }),
  signals: Object.freeze({
    default_signal_type: "market",
    default_status: "new",
    signal_types: Object.freeze(["market", "customer", "competitor", "internal"]),
    statuses: Object.freeze(["new", "triaged", "used", "archived"]),
  }),
});

function startupOfficeAssetStatus(value) {
  return normalizeObjectInvariantValue(value, STARTUP_OFFICE_OBJECT_INVARIANTS.assets.statuses, "active");
}

function startupOfficeCustomerStatus(value) {
  return normalizeObjectInvariantValue(value, STARTUP_OFFICE_OBJECT_INVARIANTS.customers.statuses, "lead");
}

function startupOfficeSignalStatus(value) {
  return normalizeObjectInvariantValue(value, STARTUP_OFFICE_OBJECT_INVARIANTS.signals.statuses, "new");
}

function startupOfficeSignalType(value) {
  return normalizeObjectInvariantValue(value, STARTUP_OFFICE_OBJECT_INVARIANTS.signals.signal_types, "market");
}

function normalizeObjectInvariantValue(value, allowed, fallback) {
  const raw = String(value || "").trim().toLowerCase();
  return allowed.includes(raw) ? raw : fallback;
}

module.exports = {
  STARTUP_OFFICE_OBJECT_INVARIANTS,
  startupOfficeAssetStatus,
  startupOfficeCustomerStatus,
  startupOfficeSignalStatus,
  startupOfficeSignalType,
};
