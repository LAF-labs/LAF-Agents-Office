const currentSchema = require("../../../supabase/schema/current.json");

function createServiceRoleAccessGuards({ createHTTPError, schema = currentSchema }) {
  const allowedTables = new Set((schema.activeTables || []).map((table) => table.name));
  const allowedRPCs = new Set(schema.internalFunctions || []);

  function assertIdentifier(value, label) {
    const name = String(value || "").trim();
    if (!/^[a-z][a-z0-9_]*$/.test(name)) {
      throw createHTTPError(500, `invalid service-role ${label}`);
    }
    return name;
  }

  function assertAllowedRestTable(table) {
    const name = assertIdentifier(table, "table");
    if (!allowedTables.has(name)) {
      throw createHTTPError(500, `service-role table is not registered: ${name}`);
    }
    return name;
  }

  function assertAllowedRPC(name) {
    const rpcName = assertIdentifier(name, "rpc");
    if (!allowedRPCs.has(rpcName)) {
      throw createHTTPError(500, `service-role rpc is not registered: ${rpcName}`);
    }
    return rpcName;
  }

  return { assertAllowedRPC, assertAllowedRestTable };
}

module.exports = { createServiceRoleAccessGuards };
