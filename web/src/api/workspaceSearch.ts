import { get } from "./client";

export type WorkspaceSearchScope = "wiki" | "project" | "chat";

export interface WorkspaceSearchHit {
  id: string;
  scope: WorkspaceSearchScope | string;
  source: "wiki" | "project" | "task" | "chat" | string;
  title: string;
  path: string;
  line?: number;
  snippet: string;
  updated_at?: string;
  project_id?: string;
  task_id?: string;
  agent_slug?: string;
  channel?: string;
  meta?: Record<string, string>;
  score?: number;
}

export interface WorkspaceSearchResponse {
  query: string;
  hits: WorkspaceSearchHit[];
  counts: Partial<Record<WorkspaceSearchScope | string, number>>;
  omitted: string[];
}

export async function searchWorkspace(
  query: string,
  opts: { scopes?: WorkspaceSearchScope[]; limit?: number } = {},
): Promise<WorkspaceSearchResponse> {
  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { query: trimmed, hits: [], counts: {}, omitted: [] };
  }
  try {
    const params: Record<string, string | number> = {
      q: trimmed,
      limit: opts.limit ?? 24,
    };
    if (opts.scopes?.length) params.scopes = opts.scopes.join(",");
    return await get<WorkspaceSearchResponse>("/workspace/search", params);
  } catch {
    return { query: trimmed, hits: [], counts: {}, omitted: [] };
  }
}
