const CUSTOMER_CSV_FIELDS = ["name", "status", "loop_id", "notes", "profile_json"];

function startupOfficeCustomersCSV(customers = []) {
  const rows = [CUSTOMER_CSV_FIELDS];
  for (const customer of customers) {
    rows.push([
      customer.name || "",
      customer.status || "",
      customer.loop_id || "",
      customer.notes || "",
      JSON.stringify(customer.profile || {}),
    ]);
  }
  return rows.map((row) => row.map(csvField).join(",")).join("\n") + "\n";
}

function parseStartupOfficeCustomersCSV(csv) {
  const rows = parseCSV(String(csv || ""));
  if (rows.length < 2) return [];
  const header = rows[0].map((cell) => String(cell || "").trim().toLowerCase());
  return rows.slice(1).filter((row) => row.some((cell) => String(cell || "").trim())).map((row) => {
    const entry = Object.fromEntries(header.map((key, index) => [key, row[index] || ""]));
    return {
      loop_id: entry.loop_id || "",
      name: entry.name || "",
      notes: entry.notes || "",
      profile: parseProfileJSON(entry.profile_json),
      status: entry.status || "lead",
    };
  });
}

function parseCSV(text) {
  const rows = [];
  let cell = "";
  let row = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function parseProfileJSON(value) {
  const raw = String(value || "").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
}

function csvField(value) {
  const text = String(value ?? "");
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

module.exports = {
  CUSTOMER_CSV_FIELDS,
  parseStartupOfficeCustomersCSV,
  startupOfficeCustomersCSV,
};
