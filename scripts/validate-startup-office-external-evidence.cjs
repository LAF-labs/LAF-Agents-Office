#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const templatePath = path.join(root, "shared", "startup-office-external-evidence-template.json");
const PLACEHOLDER_VALUES = new Set(["", "n/a", "na", "none", "null", "pending", "tbd", "todo", "unknown"]);

function loadJSON(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function loadTemplate() {
  return loadJSON(templatePath);
}

function normalizeRecords(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("evidence record must be an object");
  }
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.records)) return payload.records;
  return [payload];
}

function isBlankOrPlaceholder(value) {
  if (value === null || value === undefined) return true;
  const normalized = String(value).trim().toLowerCase();
  return PLACEHOLDER_VALUES.has(normalized) || /^<.+>$/.test(normalized);
}

function validateRecord(record, template) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error("evidence record must be an object");
  }
  const templateRecord = template.records.find((entry) => entry.goalId === record.goalId);
  if (!templateRecord) {
    throw new Error(`unknown goalId ${record.goalId || "<missing>"}`);
  }
  if (record.recordType !== templateRecord.recordType) {
    throw new Error(`${record.goalId} recordType must be ${templateRecord.recordType}`);
  }
  if (record.recordedIn !== template.recordCompletedCopiesIn) {
    throw new Error(`${record.goalId} recordedIn must be ${template.recordCompletedCopiesIn}`);
  }
  if (!record.fields || typeof record.fields !== "object" || Array.isArray(record.fields)) {
    throw new Error(`${record.goalId} fields must be an object`);
  }

  for (const field of templateRecord.requiredFields) {
    const value = record.fields[field.key];
    if (isBlankOrPlaceholder(value)) {
      throw new Error(`${record.goalId} missing required field ${field.key}`);
    }
  }
  validateFieldSemantics(record);
  return {
    fieldCount: templateRecord.requiredFields.length,
    goalId: record.goalId,
    recordType: record.recordType,
  };
}

function validateFieldSemantics(record) {
  const fields = record.fields;
  if (record.goalId === "G099") {
    if (!/^[a-f0-9]{7,40}$/i.test(String(fields.deploy_commit_sha))) {
      throw new Error("G099 deploy_commit_sha must look like a git SHA");
    }
    for (const key of ["production_app_url", "production_api_base_url"]) {
      if (!String(fields[key]).startsWith("https://")) {
        throw new Error(`G099 ${key} must be an HTTPS URL`);
      }
    }
  }
  if (record.goalId === "G100") {
    if (!["trial", "paid", "paused", "blocked"].includes(String(fields.payment_status))) {
      throw new Error("G100 payment_status must be trial, paid, paused, or blocked");
    }
    if (!["approved", "revised", "rejected"].includes(String(fields.founder_decision))) {
      throw new Error("G100 founder_decision must be approved, revised, or rejected");
    }
  }
}

function validateExternalEvidencePayload(payload, template = loadTemplate()) {
  const records = normalizeRecords(payload);
  if (records.length === 0) throw new Error("evidence payload must contain at least one record");
  const results = records.map((record) => validateRecord(record, template));
  const ids = new Set(results.map((result) => result.goalId));
  if (ids.size !== results.length) throw new Error("evidence payload contains duplicate goalId records");
  return results;
}

function parseArgs(argv) {
  const fileIndex = argv.indexOf("--file");
  if (fileIndex === -1 || !argv[fileIndex + 1]) {
    throw new Error("usage: npm run startup-office:external-evidence:validate -- --file /path/to/evidence.json");
  }
  return { file: path.resolve(argv[fileIndex + 1]) };
}

function main(argv = process.argv.slice(2)) {
  const { file } = parseArgs(argv);
  const results = validateExternalEvidencePayload(loadJSON(file));
  console.log(
    `startup-office external evidence validation passed: ` +
      results.map((result) => `${result.goalId} ${result.fieldCount} fields`).join(", "),
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`startup-office external evidence validation failed: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  loadTemplate,
  validateExternalEvidencePayload,
};
