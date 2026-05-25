function redactSensitiveText(value) {
  return String(value || "")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/laf_[a-z]+_[A-Fa-f0-9]{20,}/g, "laf_[REDACTED]")
    .replace(/lafr_[A-Za-z0-9_-]{20,}/g, "lafr_[REDACTED]")
    .replace(/lafb_[A-Za-z0-9_-]{20,}/g, "lafb_[REDACTED]")
    .replace(/gh[pousr]_[A-Za-z0-9_]{20,}/g, "gh_[REDACTED]")
    .replace(/sk-(proj-)?[A-Za-z0-9_-]{20,}/g, "sk-[REDACTED]");
}

function redactSensitiveValue(value) {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(redactSensitiveValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [
        key,
        /token|secret|password|api[_-]?key/i.test(key)
          ? "[REDACTED]"
          : redactSensitiveValue(entry),
      ]),
    );
  }
  return value;
}

module.exports = {
  redactSensitiveText,
  redactSensitiveValue,
};
