const assert = require("node:assert/strict");
const test = require("node:test");

const {
  parseStartupOfficeCustomersCSV,
  startupOfficeCustomersCSV,
} = require("./customerCsv");

test("customer CSV exports common CRM fields with escaped content", () => {
  const csv = startupOfficeCustomersCSV([
    {
      loop_id: "loop-1",
      name: "Acme, Inc.",
      notes: "Line 1\nLine 2",
      profile: { buyer: "founder" },
      status: "qualified",
    },
  ]);

  assert.equal(
    csv,
    'name,status,loop_id,notes,profile_json\n"Acme, Inc.",qualified,loop-1,"Line 1\nLine 2","{""buyer"":""founder""}"\n',
  );
});

test("customer CSV parses exported rows back to customer payloads", () => {
  const customers = parseStartupOfficeCustomersCSV(
    'name,status,loop_id,notes,profile_json\n"Acme, Inc.",qualified,loop-1,"Notes","{""buyer"":""founder""}"\n',
  );

  assert.deepEqual(customers, [
    {
      loop_id: "loop-1",
      name: "Acme, Inc.",
      notes: "Notes",
      profile: { buyer: "founder" },
      status: "qualified",
    },
  ]);
});

test("customer CSV rejects malformed profile JSON", () => {
  assert.throws(
    () => parseStartupOfficeCustomersCSV("name,profile_json\nAcme,{bad}\n"),
    /Unexpected token|Expected property name/,
  );
});
