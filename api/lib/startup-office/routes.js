const STARTUP_OFFICE_ROUTE_PATHS = Object.freeze({
  demoSeed: "startup-office/demo-seed",
});

const STARTUP_OFFICE_ROUTE_CONTRACTS = Object.freeze([
  {
    id: "companyProfile",
    methods: Object.freeze(["GET", "PATCH"]),
    paths: Object.freeze(["company/profile"]),
  },
  {
    id: "demoSeed",
    methods: Object.freeze(["POST"]),
    paths: Object.freeze([STARTUP_OFFICE_ROUTE_PATHS.demoSeed]),
  },
  {
    id: "growthSummary",
    methods: Object.freeze(["GET"]),
    paths: Object.freeze(["startup-office/growth-summary"]),
  },
  {
    id: "policy",
    methods: Object.freeze(["GET", "PATCH"]),
    paths: Object.freeze(["startup-office/policy"]),
  },
  {
    id: "billing",
    methods: Object.freeze(["GET", "PATCH"]),
    paths: Object.freeze(["startup-office/billing"]),
  },
  {
    id: "betaDashboard",
    methods: Object.freeze(["GET"]),
    paths: Object.freeze(["startup-office/admin/beta-dashboard"]),
  },
  {
    id: "loops",
    methods: Object.freeze(["GET", "POST"]),
    paths: Object.freeze(["startup-office/loops", "loops"]),
  },
  {
    id: "loopRun",
    methods: Object.freeze(["POST"]),
    pattern: "^(?:startup-office/)?loops/([^/]+)/run$",
    params: Object.freeze(["loopID"]),
  },
  {
    id: "run",
    methods: Object.freeze(["GET", "POST"]),
    pattern: "^(?:startup-office/)?runs/([^/]+)(?:/(retry|cancel))?$",
    params: Object.freeze(["runID", "action"]),
  },
  {
    id: "approvals",
    methods: Object.freeze(["GET"]),
    paths: Object.freeze(["startup-office/approvals", "approvals"]),
  },
  {
    id: "approvalAction",
    methods: Object.freeze(["POST"]),
    pattern: "^(?:startup-office/)?approvals/([^/]+)/(approve|reject|revise)$",
    params: Object.freeze(["approvalID", "action"]),
  },
  {
    id: "receipts",
    methods: Object.freeze(["GET"]),
    paths: Object.freeze(["startup-office/receipts", "receipts"]),
  },
  {
    id: "objectCollection",
    methods: Object.freeze(["GET", "POST"]),
    pattern: "^startup-office/(assets|customers|metrics|signals)$",
    params: Object.freeze(["kind"]),
  },
  {
    id: "objectItem",
    methods: Object.freeze(["PATCH", "DELETE"]),
    pattern: "^startup-office/(assets|customers|metrics|signals)/([^/]+)$",
    params: Object.freeze(["kind", "objectID"]),
  },
  {
    id: "artifactObjectAction",
    methods: Object.freeze(["POST"]),
    pattern: "^startup-office/artifacts/([^/]+)/(save-as-asset|record-signal)$",
    params: Object.freeze(["artifactID", "action"]),
  },
  {
    id: "export",
    methods: Object.freeze(["GET"]),
    paths: Object.freeze(["startup-office/export"]),
  },
]);

module.exports = {
  STARTUP_OFFICE_ROUTE_CONTRACTS,
  STARTUP_OFFICE_ROUTE_PATHS,
};
