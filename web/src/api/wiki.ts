/**
 * Wiki API client — thin wrapper over the shared fetch helper in `client.ts`.
 * Uses the live broker by default. Legacy demo fixtures remain for non-project
 * preview paths, but canonical project memory paths never fall back to mock
 * content because agents and humans rely on them as durable state.
 */

import { get, getHumans, type HumanIdentity, post } from "./client";
import { subscribeBrokerEvent } from "./events";

export type { HumanIdentity };

export interface WikiArticle {
  path: string;
  title: string;
  content: string;
  last_edited_by: string;
  last_edited_ts: string;
  /**
   * Short SHA of the most recent commit touching this article. Sent back
   * as `expected_sha` when the editor saves so the broker can detect
   * concurrent writes that landed after the editor opened. Empty for
   * brand-new articles that have no commit history yet.
   */
  commit_sha?: string;
  revisions: number;
  contributors: string[];
  backlinks: { path: string; title: string; author_slug: string }[];
  word_count: number;
  categories: string[];
}

/**
 * Result envelope for a successful human wiki write.
 */
export interface WriteHumanOk {
  path: string;
  commit_sha: string;
  bytes_written: number;
}

/**
 * 409 Conflict payload: returned when another write landed between the
 * editor opening and the save. Carries the current article bytes so the
 * editor can prompt reload without a second fetch.
 */
export interface WriteHumanConflict {
  conflict: true;
  error: string;
  current_sha: string;
  current_content: string;
}

export type WriteHumanResult = WriteHumanOk | WriteHumanConflict;

/**
 * Submit a human-authored wiki write. The caller must pass the SHA of
 * the article version they opened (or '' for a new article); the broker
 * rejects the write with 409 when HEAD has moved past that SHA.
 *
 * Agents never hit this endpoint — it is HTTP-only, not exposed via MCP.
 */
export async function writeHumanArticle(params: {
  path: string;
  content: string;
  commitMessage: string;
  expectedSha: string;
}): Promise<WriteHumanResult> {
  try {
    const res = await post<WriteHumanOk>("/wiki/write-human", {
      path: params.path,
      content: params.content,
      commit_message: params.commitMessage,
      expected_sha: params.expectedSha,
    });
    return res;
  } catch (err: unknown) {
    // The shared post() helper surfaces non-2xx as Error(text). For 409
    // the body is a JSON envelope — try to parse it out.
    const message = err instanceof Error ? err.message : String(err);
    const parsed = tryParseConflict(message);
    if (parsed) return parsed;
    throw err;
  }
}

function tryParseConflict(text: string): WriteHumanConflict | null {
  try {
    const data = JSON.parse(text) as Partial<WriteHumanConflict> & {
      error?: string;
      current_sha?: string;
      current_content?: string;
    };
    if (
      typeof data.current_sha === "string" &&
      typeof data.current_content === "string"
    ) {
      return {
        conflict: true,
        error: data.error ?? "conflict",
        current_sha: data.current_sha,
        current_content: data.current_content,
      };
    }
  } catch {
    // not a JSON body; fall through
  }
  return null;
}

export interface WikiCatalogEntry {
  path: string;
  title: string;
  author_slug: string;
  last_edited_ts: string;
  group: string;
}

/**
 * Dynamic section discovered from actual wiki content + the blueprint's
 * declared wiki_schema. Maps 1:1 to Go's `team.DiscoveredSection`.
 *
 * A section is "from_schema" when the active blueprint declared it in
 * wiki_schema.dirs. Otherwise it emerged organically from articles the
 * team wrote. Both shapes ship in the same list so the sidebar can
 * distinguish them visually.
 */
export interface DiscoveredSection {
  slug: string;
  title: string;
  article_paths: string[];
  article_count: number;
  first_seen_ts: string;
  last_update_ts: string;
  from_schema: boolean;
}

export interface WikiSectionsUpdatedEvent {
  sections: DiscoveredSection[];
  timestamp: string;
}

export interface WikiHistoryCommit {
  sha: string;
  author_slug: string;
  msg: string;
  date: string;
}

export interface WikiEditLogEntry {
  who: string;
  action: "edited" | "created" | "updated" | "wrote";
  article_path: string;
  article_title: string;
  timestamp: string;
  commit_sha: string;
}

/**
 * Candidate wiki paths for a given hash slug. Wikilinks in briefs use
 * a bare slug (e.g. `[[nazz]]`), which routes to URL `#/wiki/nazz`. The
 * broker's `/wiki/article` endpoint requires a full `team/{group}/{slug}.md`
 * path, so the client resolves bare slugs by trying each standard group
 * directory in order before giving up.
 *
 * Full paths (`team/…`) and any input already containing a slash are
 * passed through unchanged (with a `.md` suffix added if missing). Bare
 * slugs fan out across the standard groups in priority order. The 404s
 * on misses are cheap and there's no coherence risk — the first match
 * wins.
 */
function candidatePaths(pathOrSlug: string): string[] {
  const trimmed = pathOrSlug.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed) return [];
  const withExt = trimmed.endsWith(".md") ? trimmed : `${trimmed}.md`;
  if (trimmed.startsWith("team/")) return [withExt];
  if (trimmed.includes("/")) return [`team/${withExt}`];
  const slug = withExt;
  return [
    `team/people/${slug}`,
    `team/companies/${slug}`,
    `team/playbooks/${slug}`,
    `team/decisions/${slug}`,
    `team/projects/${slug}`,
    `team/${slug}`,
  ];
}

function isExplicitProjectArticlePath(pathOrSlug: string): boolean {
  const trimmed = pathOrSlug.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return (
    trimmed.startsWith("projects/") || trimmed.startsWith("team/projects/")
  );
}

export async function fetchArticle(path: string): Promise<WikiArticle> {
  const tried: string[] = [];
  const explicitProjectArticle = isExplicitProjectArticlePath(path);
  let lastError: unknown = null;
  for (const candidate of candidatePaths(path)) {
    tried.push(candidate);
    try {
      return await get<WikiArticle>(
        `/wiki/article?path=${encodeURIComponent(candidate)}`,
      );
    } catch (err) {
      lastError = err;
      if (explicitProjectArticle) throw err;
      // Try next candidate. Real 404s and bare-slug misses look identical
      // from the client — fall through and mock at the end.
    }
  }
  if (explicitProjectArticle && lastError) throw lastError;
  return mockArticle(tried[tried.length - 1] ?? path);
}

/**
 * GET /wiki/sections — the v1.3 dynamic-section IA. Returns blueprint-
 * declared sections (in blueprint order) followed by discovered
 * sections (alphabetical). Empty array on backend error so the sidebar
 * can fall back to the catalog-derived group set without blanking.
 */
export async function fetchSections(): Promise<DiscoveredSection[]> {
  try {
    const res = await get<{ sections: DiscoveredSection[] }>("/wiki/sections");
    return Array.isArray(res?.sections) ? res.sections : [];
  } catch {
    return [];
  }
}

/**
 * Subscribe to the shared broker `/events` SSE stream filtered to
 * `wiki:sections_updated` events. Returns an unsubscribe function.
 *
 * Named event pattern matches subscribeEditLog + subscribeEntityEvents.
 * Do NOT switch to onmessage — the broker only emits named events and
 * the default handler never fires for named payloads.
 */
export function subscribeSectionsUpdated(
  handler: (event: WikiSectionsUpdatedEvent) => void,
): () => void {
  let closed = false;
  const onEvent = (ev: MessageEvent) => {
    if (closed) return;
    try {
      const data = JSON.parse(ev.data) as WikiSectionsUpdatedEvent;
      if (data && Array.isArray(data.sections)) {
        handler(data);
      }
    } catch {
      // ignore malformed events
    }
  };
  const unsubscribe = subscribeBrokerEvent(
    "wiki:sections_updated",
    onEvent as EventListener,
  );

  return () => {
    closed = true;
    unsubscribe();
  };
}

/**
 * GET /humans — returns identities observed or probed server-side. The
 * byline component uses this to turn a commit author slug into the
 * human's real display name. Returns [] on any error so the UI falls
 * back to the slug-derived label without blanking.
 */
export async function fetchHumans(): Promise<HumanIdentity[]> {
  try {
    const res = await getHumans();
    return Array.isArray(res?.humans) ? res.humans : [];
  } catch {
    return [];
  }
}

export async function fetchCatalog(): Promise<WikiCatalogEntry[]> {
  try {
    const res = await get<{ articles: WikiCatalogEntry[] }>("/wiki/catalog");
    return Array.isArray(res?.articles) ? res.articles : [];
  } catch {
    return MOCK_CATALOG;
  }
}

/**
 * One hit from `/wiki/search` — mirrors Go's `team.WikiSearchHit`.
 * The broker returns literal substring hits (no regex), capped at 100.
 */
export interface WikiSearchHit {
  path: string;
  line: number;
  snippet: string;
}

/**
 * GET /wiki/search?pattern=... — literal substring search across team/**.md.
 * Returns [] on any error so the SearchModal can render empty state without
 * blowing up.
 */
export async function searchWiki(pattern: string): Promise<WikiSearchHit[]> {
  const trimmed = pattern.trim();
  if (!trimmed) return [];
  try {
    const res = await get<{ hits: WikiSearchHit[] }>(
      `/wiki/search?pattern=${encodeURIComponent(trimmed)}`,
    );
    return Array.isArray(res?.hits) ? res.hits : [];
  } catch {
    return [];
  }
}

export interface WikiAuditEntry {
  sha: string;
  author_slug: string;
  timestamp: string;
  message: string;
  paths: string[];
}

export async function fetchAuditLog(
  params: { limit?: number; since?: string } = {},
): Promise<{ entries: WikiAuditEntry[]; total: number }> {
  const qs = new URLSearchParams();
  if (typeof params.limit === "number") qs.set("limit", String(params.limit));
  if (params.since) qs.set("since", params.since);
  const url = qs.toString() ? `/wiki/audit?${qs.toString()}` : "/wiki/audit";
  try {
    return await get<{ entries: WikiAuditEntry[]; total: number }>(url);
  } catch {
    return { entries: [], total: 0 };
  }
}

// ── Lint API ──────────────────────────────────────────────────────────────────

/**
 * One finding from the daily lint run.
 * Mirrors internal/team.LintFinding exactly.
 */
export interface LintFinding {
  severity: "critical" | "warning" | "info";
  type:
    | "contradictions"
    | "orphans"
    | "stale"
    | "missing_crossrefs"
    | "dedup_review";
  entity_slug?: string;
  fact_ids?: string[];
  summary: string;
  /**
   * Only present on contradictions findings. Three entries:
   * ["Fact A (id: …): …", "Fact B (id: …): …", "Both"]
   */
  resolve_actions?: string[];
}

export interface LintReport {
  date: string;
  findings: LintFinding[];
}

/**
 * POST /wiki/lint/run — triggers all 5 lint checks and returns the report.
 */
export async function runLint(): Promise<LintReport> {
  return await post<LintReport>("/wiki/lint/run", null);
}

/**
 * POST /wiki/lint/resolve — resolves a contradiction finding.
 *
 * The caller echoes the full LintFinding it received from /wiki/lint/run so
 * the broker can resolve without re-running or persisting structured findings.
 */
export async function resolveContradiction(args: {
  report_date: string;
  finding_idx: number;
  finding: LintFinding;
  winner: "A" | "B" | "Both";
}): Promise<{ commit_sha: string; message: string }> {
  return await post<{ commit_sha: string; message: string }>(
    "/wiki/lint/resolve",
    args,
  );
}

export async function fetchHistory(
  path: string,
): Promise<{ commits: WikiHistoryCommit[] }> {
  try {
    return await get<{ commits: WikiHistoryCommit[] }>(
      `/wiki/history/${encodeURI(path)}`,
    );
  } catch (err) {
    if (isExplicitProjectArticlePath(path)) throw err;
    return {
      commits: mockArticle(path).contributors.map((slug, i) => ({
        sha: `mock${i}`,
        author_slug: slug,
        msg: `Edit ${i + 1} by ${slug}`,
        date: new Date(Date.now() - i * 86400000).toISOString(),
      })),
    };
  }
}

/**
 * Subscribe to the shared broker `/events` SSE stream filtered to
 * `wiki:write` events. Returns an unsubscribe function that tears down
 * the underlying EventSource.
 *
 * Previously this subscribed to `/wiki/stream` — a path that never
 * existed on the broker. Every call 404'd silently and live edit-log
 * updates were dead in production. Matches the `api/entity.ts` pattern:
 * broker emits named SSE events (`event: wiki:write\ndata: ...`) so we
 * use `addEventListener('wiki:write', ...)` not `onmessage`.
 */
export function subscribeEditLog(
  handler: (entry: WikiEditLogEntry) => void,
): () => void {
  let closed = false;
  const onWrite = (ev: MessageEvent) => {
    if (closed) return;
    try {
      const data = JSON.parse(ev.data) as Record<string, unknown>;
      // Broker ships `{path, commit_sha, author_slug, timestamp}` on
      // wiki:write. The edit-log UI's WikiEditLogEntry contract uses
      // `who`/`action`/`article_path`/`article_title`, so normalize
      // here rather than leaving undefined fields that crash
      // downstream consumers (e.g. EditLogFooter's
      // entry.who.toLowerCase()).
      const raw = (data.entry ?? data) as Record<string, unknown>;
      const path = String(raw.article_path ?? raw.path ?? "");
      const entry: WikiEditLogEntry = {
        who: String(raw.who ?? raw.author_slug ?? "unknown"),
        action: (raw.action as WikiEditLogEntry["action"]) ?? "edited",
        article_path: path,
        article_title:
          (raw.article_title as string) ??
          (path.split("/").pop() ?? path).replace(/\.md$/, ""),
        timestamp: String(raw.timestamp ?? new Date().toISOString()),
        commit_sha: String(raw.commit_sha ?? ""),
      };
      handler(entry);
    } catch {
      // ignore malformed events
    }
  };
  const unsubscribe = subscribeBrokerEvent(
    "wiki:write",
    onWrite as EventListener,
  );

  return () => {
    closed = true;
    unsubscribe();
  };
}

// ── Mock fixtures — pulled from V3 preview content. ──

export const MOCK_CATALOG: WikiCatalogEntry[] = [
  {
    path: "projects/agent-workspace",
    title: "Agent Workspace",
    author_slug: "architect",
    last_edited_ts: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
    group: "projects",
  },
  {
    path: "decisions/project-memory-contract",
    title: "Project memory contract",
    author_slug: "architect",
    last_edited_ts: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
    group: "decisions",
  },
  {
    path: "playbooks/repo-connected-task",
    title: "Repo-connected task",
    author_slug: "builder",
    last_edited_ts: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    group: "playbooks",
  },
  {
    path: "facts/runtime-constraints",
    title: "Runtime constraints",
    author_slug: "builder",
    last_edited_ts: new Date(Date.now() - 18 * 3600 * 1000).toISOString(),
    group: "facts",
  },
  {
    path: "projects/agent-workspace-log",
    title: "Agent workspace log",
    author_slug: "builder",
    last_edited_ts: new Date(Date.now() - 6 * 86400 * 1000).toISOString(),
    group: "projects",
  },
  {
    path: "playbooks/task-review",
    title: "Task review",
    author_slug: "reviewer",
    last_edited_ts: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    group: "playbooks",
  },
  {
    path: "decisions/github-is-optional",
    title: "GitHub is optional",
    author_slug: "architect",
    last_edited_ts: new Date(Date.now() - 9 * 86400 * 1000).toISOString(),
    group: "decisions",
  },
  {
    path: "inbox/raw-agent-task-review",
    title: "raw — Agent task review",
    author_slug: "builder",
    last_edited_ts: new Date(Date.now() - 14 * 86400 * 1000).toISOString(),
    group: "inbox",
  },
];

export function mockArticle(path: string): WikiArticle {
  if (
    path === "projects/agent-workspace" ||
    path === "" ||
    path === "agent-workspace" ||
    path === "team/projects/agent-workspace.md"
  ) {
    return {
      path: "projects/agent-workspace",
      title: "Agent Workspace",
      content: MOCK_PROJECT_MEMORY_MD,
      last_edited_by: "architect",
      last_edited_ts: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      revisions: 12,
      contributors: ["architect", "builder", "reviewer"],
      backlinks: [
        {
          path: "decisions/project-memory-contract",
          title: "Project memory contract",
          author_slug: "architect",
        },
        {
          path: "playbooks/repo-connected-task",
          title: "Repo-connected task",
          author_slug: "builder",
        },
        {
          path: "facts/runtime-constraints",
          title: "Runtime constraints",
          author_slug: "builder",
        },
      ],
      word_count: 746,
      categories: [
        "Project memory",
        "Agent workflow",
        "GitHub optional",
        "Local runtime",
      ],
    };
  }
  // Generic fallback for unknown paths.
  const title = path.split("/").pop() || path;
  return {
    path,
    title: title.charAt(0).toUpperCase() + title.slice(1).replace(/-/g, " "),
    content: `*Article not found in mock fixtures.*\n\nThe API endpoint for \`${path}\` is not yet wired. When Lane A completes its endpoints this view will populate with real content.\n`,
    last_edited_by: "architect",
    last_edited_ts: new Date().toISOString(),
    revisions: 1,
    contributors: ["architect"],
    backlinks: [],
    word_count: 42,
    categories: [],
  };
}

const MOCK_PROJECT_MEMORY_MD = `**Agent Workspace** is the project memory surface agents read before planning or changing work. It keeps the current objective, repo notes, delivery rules, and decisions in markdown so humans can review the same context.

## Current objective

- Make project work the default surface after login.
- Keep durable context in the local team wiki.
- Let GitHub stay optional until a project is ready for implementation.
- Require delivery receipts before repo-connected coding tasks are marked done.

## Agent rules

- Read this project memory before work starts.
- Use [[decisions/project-memory-contract|Project memory contract]] as the source of truth for task packets.
- If the excerpt is missing needed detail, call \`team_wiki_read\` for the full article.
- After work, append meaningful decisions, changed files, and delivery evidence.

## Repo connection

GitHub connection is optional. Before a repo is connected, agents can plan, document, split tasks, and update the wiki. After a repo is connected, implementation tasks need a branch or PR receipt before completion.

## Open decisions

- Should the project board make wiki freshness visible on every task?
- Should delivery receipts accept local branch names before hosted PR automation exists?
- Which project-level facts should be promoted into structured fields?

## Next steps

Architect should keep the next implementation task specific enough that Builder can run it without re-discovering product intent.
`;

export const MOCK_EDIT_LOG: WikiEditLogEntry[] = [
  {
    who: "Architect",
    action: "edited",
    article_path: "projects/agent-workspace",
    article_title: "Agent Workspace",
    timestamp: new Date().toISOString(),
    commit_sha: "9a0f113",
  },
  {
    who: "Architect",
    action: "updated",
    article_path: "decisions/project-memory-contract",
    article_title: "Project memory contract",
    timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
    commit_sha: "b1d5e22",
  },
  {
    who: "Reviewer",
    action: "created",
    article_path: "brand/voice",
    article_title: "Brand Voice",
    timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    commit_sha: "3f9a21b",
  },
  {
    who: "Builder",
    action: "wrote",
    article_path: "tech/broker-architecture",
    article_title: "Tech — broker architecture",
    timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    commit_sha: "7c2e881",
  },
];
