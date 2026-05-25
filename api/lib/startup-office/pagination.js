const DEFAULT_STARTUP_OFFICE_PAGE_LIMIT = 100;
const MAX_STARTUP_OFFICE_PAGE_LIMIT = 100;

function startupOfficePageRequest(query = {}, options = {}) {
  const limit = startupOfficePageLimit(query.limit, options);
  const cursor = startupOfficeCursor(query.cursor || query.before, options);
  return {
    cursor,
    limit,
    request_limit: limit + 1,
  };
}

function startupOfficePageResult(rows, page, cursorField = "created_at") {
  const list = Array.isArray(rows) ? rows : [];
  const items = list.slice(0, page.limit);
  const hasMore = list.length > page.limit;
  const last = items[items.length - 1] || {};
  return {
    items,
    pagination: {
      cursor: page.cursor || null,
      has_more: hasMore,
      limit: page.limit,
      next_cursor: hasMore ? last[cursorField] || null : null,
    },
  };
}

function applyStartupOfficeCursor(query, cursor, field = "created_at") {
  if (cursor) query[field] = `lt.${cursor}`;
}

function startupOfficePageLimit(value, options = {}) {
  const defaultLimit = options.defaultLimit || DEFAULT_STARTUP_OFFICE_PAGE_LIMIT;
  const maxLimit = options.maxLimit || MAX_STARTUP_OFFICE_PAGE_LIMIT;
  const parsed = Number(value || defaultLimit);
  const limit = Number.isFinite(parsed) ? Math.trunc(parsed) : defaultLimit;
  return Math.min(Math.max(limit, 1), maxLimit);
}

function startupOfficeCursor(value, options = {}) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    const createHTTPError = options.createHTTPError;
    if (createHTTPError) throw createHTTPError(400, "cursor must be an ISO timestamp");
    const err = new Error("cursor must be an ISO timestamp");
    err.status = 400;
    throw err;
  }
  return raw;
}

module.exports = {
  applyStartupOfficeCursor,
  startupOfficeCursor,
  startupOfficePageLimit,
  startupOfficePageRequest,
  startupOfficePageResult,
};
