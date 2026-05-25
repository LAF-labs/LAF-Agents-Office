function createStartupOfficeValidation({ createHTTPError, objectValue, truncateText }) {
  function requireObject(value, label) {
    if (value === undefined) return {};
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw createHTTPError(400, `${label} must be an object`);
    }
    return value;
  }

  function optionalObject(value, label) {
    if (value === undefined) return {};
    return requireObject(value, label);
  }

  function loopCreateBody(body = {}) {
    const value = requireObject(body, "request body");
    const name = truncateText(value.name || "", 160);
    if (!name) throw createHTTPError(400, "name is required");
    return {
      cadence: value.cadence,
      department: truncateText(value.department || "Operations", 80),
      name,
      objective: truncateText(value.objective || "", 2000),
      policy: optionalObject(value.policy, "policy"),
      slugSeed: value.slug || name,
      status: value.status,
    };
  }

  function loopRunBody(body = {}) {
    const value = requireObject(body, "request body");
    if (value.defer !== undefined && typeof value.defer !== "boolean") {
      throw createHTTPError(400, "defer must be a boolean");
    }
    const inputsProvided = value.inputs !== undefined;
    return {
      defer: value.defer === true,
      inputs: inputsProvided ? optionalObject(value.inputs, "inputs") : objectValue(value.inputs),
      inputsProvided,
      objective: truncateText(value.objective || "", 2000),
      title: truncateText(value.title || "", 180),
    };
  }

  return { loopCreateBody, loopRunBody };
}

module.exports = { createStartupOfficeValidation };
