const crypto = require("node:crypto");

function truncateText(value, max) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function isHuman(slug) {
  return slug === "human" || slug === "you";
}

function slugify(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function shortID() {
  return crypto.randomBytes(5).toString("hex");
}

function randomID() {
  return crypto.randomUUID ? crypto.randomUUID() : shortID();
}

function nowISO() {
  return new Date().toISOString();
}

function truthy(value) {
  return value === true || value === "true" || value === "1" || value === "yes";
}

function isUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function arrayOrEmpty(value) {
  return Array.isArray(value) ? value : [];
}

function compactObject(value) {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  );
}

module.exports = {
  arrayOrEmpty,
  clamp,
  compactObject,
  isHuman,
  isUUID,
  nowISO,
  randomID,
  shortID,
  slugify,
  truncateText,
  truthy,
};
