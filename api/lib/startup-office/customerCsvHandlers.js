const { parseStartupOfficeCustomersCSV, startupOfficeCustomersCSV } = require("./customerCsv");
const {
  assertStartupOfficeStorageLimit,
  startupOfficeStorageBytes,
} = require("./planLimits");

const CUSTOMER_CSV_IMPORT_LIMIT = 500;

function createStartupOfficeCustomerCsvHandlers(deps) {
  const {
    createHTTPError,
    nowISO,
    publicStartupOfficeCustomer,
    readBody,
    requirePermission,
    requireUser,
    safeStartupOfficeRest,
    startupOfficeBetaOpsSnapshot,
    startupOfficeObjectPayload,
    startupOfficeObjectRows,
    truncateText,
    writeAuditEvent,
    writeJSON,
  } = deps;

  async function customerCsv(req, res) {
    const { membership } = await requireUser(req);
    if (req.method === "GET") {
      requirePermission(membership, "workspace:read");
      const customers = await startupOfficeObjectRows(membership.team_id, "customers", { limit: 1000 });
      writeJSON(res, 200, {
        content_type: "text/csv",
        count: customers.length,
        csv: startupOfficeCustomersCSV(customers),
        filename: `startup-office-customers-${nowISO().slice(0, 10)}.csv`,
      });
      return;
    }
    if (req.method !== "POST") throw createHTTPError(405, "method not allowed");
    requirePermission(membership, "memory:write_draft");
    const body = await readBody(req);
    const rows = rowsFromBody(body);
    if (rows.length === 0) throw createHTTPError(400, "customers csv is required");
    if (rows.length > CUSTOMER_CSV_IMPORT_LIMIT) throw createHTTPError(413, "customer csv import exceeds 500 rows");
    const payloads = rows.map((row) => startupOfficeObjectPayload("customers", membership, {
      loop_id: row.loop_id,
      name: truncateText(row.name || "", 180),
      notes: row.notes || "",
      profile: row.profile || {},
      status: row.status || "lead",
    }));
    await assertStartupOfficeStorageLimit({
      additionalBytes: payloads.reduce((total, payload) => total + startupOfficeStorageBytes(payload), 0),
      createHTTPError,
      membership,
      startupOfficeBetaOpsSnapshot,
    });
    const rowsCreated = await safeStartupOfficeRest("startup_office_customers", {
      method: "POST",
      body: payloads,
    });
    await writeAuditEvent(membership, "startup_office.customers_csv_imported", "customers", "csv", {
      imported_count: payloads.length,
    });
    writeJSON(res, 200, {
      customers: (rowsCreated || payloads).map(publicStartupOfficeCustomer).filter(Boolean),
      imported_count: payloads.length,
      status: "imported",
    });
  }

  function rowsFromBody(body = {}) {
    if (Array.isArray(body.customers)) return body.customers;
    try {
      return parseStartupOfficeCustomersCSV(body.csv || "");
    } catch (err) {
      throw createHTTPError(400, `customer csv profile_json is invalid: ${err.message}`);
    }
  }

  return { customerCsv };
}

module.exports = {
  CUSTOMER_CSV_IMPORT_LIMIT,
  createStartupOfficeCustomerCsvHandlers,
};
