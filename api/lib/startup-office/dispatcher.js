const {
  STARTUP_OFFICE_ROUTE_CONTRACTS,
} = require("./routes");
const { routeAccessForMethod } = require("./authorization");

async function dispatchStartupOfficeRoute({ authorize, handlers, path, req, res }) {
  const route = matchStartupOfficeRoute(path, req.method);
  if (!route) return false;
  if (typeof authorize !== "function") {
    throw new Error(`startup office authorizer missing: ${route.id}`);
  }
  await authorize(route.access, req, route);
  const handler = handlers[route.id];
  if (typeof handler !== "function") {
    throw new Error(`startup office handler missing: ${route.id}`);
  }
  await handler(req, res, ...route.args);
  return true;
}

function matchStartupOfficeRoute(path, method) {
  const normalizedPath = String(path || "").trim();
  const normalizedMethod = String(method || "").toUpperCase();
  for (const contract of STARTUP_OFFICE_ROUTE_CONTRACTS) {
    if (!contract.methods.includes(normalizedMethod)) continue;
    const args = contractArgs(contract, normalizedPath);
    if (!args) continue;
    return {
      access: routeAccessForMethod(contract, normalizedMethod),
      args,
      contract,
      id: contract.id,
    };
  }
  return null;
}

function contractArgs(contract, path) {
  if (contract.paths?.includes(path)) return [];
  if (!contract.pattern) return null;
  const match = path.match(new RegExp(contract.pattern));
  if (!match) return null;
  return match.slice(1).map((value) =>
    value === undefined ? "" : decodeURIComponent(value),
  );
}

module.exports = {
  dispatchStartupOfficeRoute,
  matchStartupOfficeRoute,
};
