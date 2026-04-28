import { useEffect, useRef } from "react";

import {
  type ChannelMeta,
  directChannelSlug,
  isDMChannel,
  useAppStore,
} from "../stores/app";

type Route =
  | { view: "channel"; channel: string }
  | { view: "dm"; agent: string }
  | { view: "app"; app: string }
  | { view: "wiki"; articlePath: string | null }
  | { view: "wiki-lookup"; query: string }
  | { view: "notebooks"; agentSlug: string | null; entrySlug: string | null }
  | { view: "reviews" };

const PROJECTS_ROUTE: Route = { view: "app", app: "tasks" };
const DEFAULT_ROUTE: Route = PROJECTS_ROUTE;

function appRoute(app: string): Route {
  return { view: "app", app: app === "projects" ? "tasks" : app };
}

function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/, "");
  const parts = cleaned.split("/").filter(Boolean);

  switch (parts[0]) {
    case "channels":
      return parts[1]
        ? { view: "channel", channel: decodeURIComponent(parts[1]) }
        : DEFAULT_ROUTE;
    case "dm":
      return parts[1]
        ? { view: "dm", agent: decodeURIComponent(parts[1]) }
        : DEFAULT_ROUTE;
    case "apps":
      return parts[1] ? appRoute(decodeURIComponent(parts[1])) : DEFAULT_ROUTE;
    case "projects":
      return PROJECTS_ROUTE;
    case "threads":
      return { view: "app", app: "threads" };
    case "wiki":
      return parseWikiRoute(parts, cleaned);
    case "notebooks":
      return parseNotebookRoute(parts);
    case "reviews":
      return { view: "reviews" };
    default:
      return DEFAULT_ROUTE;
  }
}

function parseWikiRoute(parts: string[], cleaned: string): Route {
  if (parts[1] === "lookup") {
    const params = new URLSearchParams(
      window.location.search.slice(1) || cleaned.split("?")[1] || "",
    );
    const q = params.get("q") || "";
    return { view: "wiki-lookup", query: decodeURIComponent(q) };
  }
  const rest = parts.slice(1).map(decodeURIComponent).join("/");
  return { view: "wiki", articlePath: rest || null };
}

function parseNotebookRoute(parts: string[]): Route {
  const agent = parts[1] ? decodeURIComponent(parts[1]) : null;
  const entry = parts[2] ? decodeURIComponent(parts[2]) : null;
  return { view: "notebooks", agentSlug: agent, entrySlug: entry };
}

function stateToHash(state: {
  currentApp: string | null;
  currentChannel: string;
  channelMeta: Record<string, ChannelMeta>;
  wikiPath: string | null;
  wikiLookupQuery: string | null;
  notebookAgentSlug: string | null;
  notebookEntrySlug: string | null;
}): string {
  const appHash = appStateToHash(state);
  if (appHash) return appHash;
  const dm = isDMChannel(state.currentChannel, state.channelMeta);
  if (dm) {
    return `#/dm/${encodeURIComponent(dm.agentSlug)}`;
  }
  return `#/channels/${encodeURIComponent(state.currentChannel || "general")}`;
}

function appStateToHash(state: {
  currentApp: string | null;
  wikiPath: string | null;
  wikiLookupQuery: string | null;
  notebookAgentSlug: string | null;
  notebookEntrySlug: string | null;
}): string | null {
  switch (state.currentApp) {
    case "wiki-lookup":
      return state.wikiLookupQuery
        ? `#/wiki/lookup?q=${encodeURIComponent(state.wikiLookupQuery)}`
        : "#/wiki/lookup";
    case "wiki":
      return state.wikiPath
        ? `#/wiki/${state.wikiPath.split("/").map(encodeURIComponent).join("/")}`
        : "#/wiki";
    case "notebooks":
      return notebookStateToHash(state);
    case "reviews":
      return "#/reviews";
    case "tasks":
      return "#/projects";
    case null:
      return null;
    default:
      return `#/apps/${encodeURIComponent(state.currentApp)}`;
  }
}

function notebookStateToHash(state: {
  notebookAgentSlug: string | null;
  notebookEntrySlug: string | null;
}): string {
  const parts: string[] = ["notebooks"];
  if (state.notebookAgentSlug)
    parts.push(encodeURIComponent(state.notebookAgentSlug));
  if (state.notebookAgentSlug && state.notebookEntrySlug) {
    parts.push(encodeURIComponent(state.notebookEntrySlug));
  }
  return `#/${parts.join("/")}`;
}

interface HashRouteActions {
  enterDM: (agent: string, channel: string) => void;
  setCurrentApp: (app: string | null) => void;
  setCurrentChannel: (channel: string) => void;
  setLastMessageId: (id: string | null) => void;
  setWikiPath: (path: string | null) => void;
  setWikiLookupQuery: (query: string) => void;
  setNotebookRoute: (
    agentSlug: string | null,
    entrySlug: string | null,
  ) => void;
}

function applyRoute(route: Route, actions: HashRouteActions) {
  switch (route.view) {
    case "dm":
      actions.enterDM(route.agent, directChannelSlug(route.agent));
      break;
    case "app":
      actions.setCurrentApp(route.app);
      break;
    case "wiki-lookup":
      actions.setWikiLookupQuery(route.query);
      actions.setCurrentApp("wiki-lookup");
      break;
    case "wiki":
      actions.setWikiPath(route.articlePath);
      actions.setCurrentApp("wiki");
      break;
    case "notebooks":
      actions.setNotebookRoute(route.agentSlug, route.entrySlug);
      actions.setCurrentApp("notebooks");
      break;
    case "reviews":
      actions.setCurrentApp("reviews");
      break;
    case "channel":
      actions.setCurrentApp(null);
      actions.setCurrentChannel(route.channel);
      actions.setLastMessageId(null);
      break;
  }
}

/**
 * Two-way sync between the Zustand app store and the location hash.
 *
 *   #/channels/<slug>            ↔ currentChannel=<slug>, currentApp=null
 *   #/dm/<agent>                 ↔ currentChannel=<agent>__human, channelMeta marked type 'D'
 *   #/apps/<id>                  ↔ currentApp=<id>
 *   #/wiki[/<path>]              ↔ currentApp='wiki', wikiPath=<path>
 *   #/notebooks[/<agent>[/<e>]]  ↔ currentApp='notebooks', notebookAgentSlug, notebookEntrySlug
 *   #/reviews                    ↔ currentApp='reviews'
 *
 * Lets the user bookmark any screen and share URLs. Silent fallback to
 * the channel view if the hash is malformed.
 */
export function useHashRouter() {
  const currentApp = useAppStore((s) => s.currentApp);
  const currentChannel = useAppStore((s) => s.currentChannel);
  const channelMeta = useAppStore((s) => s.channelMeta);
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const setCurrentChannel = useAppStore((s) => s.setCurrentChannel);
  const enterDM = useAppStore((s) => s.enterDM);
  const setLastMessageId = useAppStore((s) => s.setLastMessageId);
  const wikiPath = useAppStore((s) => s.wikiPath);
  const setWikiPath = useAppStore((s) => s.setWikiPath);
  const wikiLookupQuery = useAppStore((s) => s.wikiLookupQuery);
  const setWikiLookupQuery = useAppStore((s) => s.setWikiLookupQuery);
  const notebookAgentSlug = useAppStore((s) => s.notebookAgentSlug);
  const notebookEntrySlug = useAppStore((s) => s.notebookEntrySlug);
  const setNotebookRoute = useAppStore((s) => s.setNotebookRoute);

  // Avoid ping-ponging: skip the next hashchange or store-sync when we
  // were the one that caused it.
  const ignoreNextHashChange = useRef(false);
  const ignoreNextStoreSync = useRef(false);

  // Apply current hash on mount and when it changes
  useEffect(() => {
    function applyHash() {
      if (ignoreNextHashChange.current) {
        ignoreNextHashChange.current = false;
        return;
      }
      const route = parseHash(window.location.hash);
      ignoreNextStoreSync.current = true;
      applyRoute(route, {
        enterDM,
        setCurrentApp,
        setCurrentChannel,
        setLastMessageId,
        setWikiPath,
        setWikiLookupQuery,
        setNotebookRoute,
      });
    }

    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [
    enterDM,
    setCurrentApp,
    setCurrentChannel,
    setLastMessageId,
    setWikiPath,
    setWikiLookupQuery,
    setNotebookRoute,
  ]);

  // Push store changes back into the hash
  useEffect(() => {
    if (ignoreNextStoreSync.current) {
      ignoreNextStoreSync.current = false;
      return;
    }
    const next = stateToHash({
      currentApp,
      currentChannel,
      channelMeta,
      wikiPath,
      wikiLookupQuery,
      notebookAgentSlug,
      notebookEntrySlug,
    });
    if (next !== window.location.hash) {
      ignoreNextHashChange.current = true;
      // Use replaceState for the initial sync so we don't spam history,
      // then push afterwards.
      window.history.replaceState(null, "", next);
    }
  }, [
    currentApp,
    currentChannel,
    channelMeta,
    wikiPath,
    wikiLookupQuery,
    notebookAgentSlug,
    notebookEntrySlug,
  ]);
}

export const __test__ = {
  parseHash,
  stateToHash,
};
