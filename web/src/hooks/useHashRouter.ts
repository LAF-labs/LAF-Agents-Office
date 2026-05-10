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
  | {
      view: "app";
      app: string;
      projectId?: string | null;
      taskId?: string | null;
    }
  | { view: "wiki"; articlePath: string | null }
  | { view: "wiki-lookup"; query: string }
  | { view: "notebooks"; agentSlug: string | null; entrySlug: string | null }
  | { view: "reviews" };

const HOME_ROUTE = { view: "app", app: "home" } as const;
const PROJECTS_ROUTE = { view: "app", app: "tasks" } as const;
const DEFAULT_ROUTE: Route = HOME_ROUTE;

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
    case "home":
      return HOME_ROUTE;
    case "projects":
      return {
        ...PROJECTS_ROUTE,
        projectId: parts[1] ? decodeURIComponent(parts[1]) : null,
        taskId:
          parts[1] &&
          (parts[2] === "tickets" || parts[2] === "tasks") &&
          parts[3]
            ? decodeURIComponent(parts[3])
            : null,
      };
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
  projectFocusId: string | null;
  taskFocusId: string | null;
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
  projectFocusId: string | null;
  taskFocusId: string | null;
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
    case "home":
      return "#/home";
    case "tasks":
      if (!state.projectFocusId) return "#/projects";
      if (state.taskFocusId) {
        return `#/projects/${encodeURIComponent(
          state.projectFocusId,
        )}/tickets/${encodeURIComponent(state.taskFocusId)}`;
      }
      return `#/projects/${encodeURIComponent(state.projectFocusId)}`;
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
  setProjectFocusId: (projectId: string | null) => void;
  setTaskFocusId: (taskId: string | null) => void;
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
      actions.setProjectFocusId(
        route.app === "tasks" ? (route.projectId ?? null) : null,
      );
      actions.setTaskFocusId(
        route.app === "tasks" ? (route.taskId ?? null) : null,
      );
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
  const projectFocusId = useAppStore((s) => s.projectFocusId);
  const setProjectFocusId = useAppStore((s) => s.setProjectFocusId);
  const taskFocusId = useAppStore((s) => s.taskFocusId);
  const setTaskFocusId = useAppStore((s) => s.setTaskFocusId);
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

  // Avoid ping-ponging: browser navigation applies store state, while app
  // navigation pushes URLs directly without waiting for a hashchange event.
  const lastAppliedLocation = useRef<string | null>(null);
  const ignoreNextStoreSync = useRef(false);

  // Apply current hash on mount and when it changes
  useEffect(() => {
    function applyHash() {
      const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      if (lastAppliedLocation.current === currentLocation) return;
      lastAppliedLocation.current = currentLocation;
      const route = parseHash(window.location.hash);
      ignoreNextStoreSync.current = true;
      applyRoute(route, {
        enterDM,
        setCurrentApp,
        setCurrentChannel,
        setLastMessageId,
        setProjectFocusId,
        setTaskFocusId,
        setWikiPath,
        setWikiLookupQuery,
        setNotebookRoute,
      });
    }

    applyHash();
    window.addEventListener("hashchange", applyHash);
    window.addEventListener("popstate", applyHash);
    return () => {
      window.removeEventListener("hashchange", applyHash);
      window.removeEventListener("popstate", applyHash);
    };
  }, [
    enterDM,
    setCurrentApp,
    setCurrentChannel,
    setLastMessageId,
    setProjectFocusId,
    setTaskFocusId,
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
      projectFocusId,
      taskFocusId,
    });
    if (next !== window.location.hash) {
      window.history.pushState(null, "", next);
      lastAppliedLocation.current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    }
  }, [
    currentApp,
    currentChannel,
    channelMeta,
    wikiPath,
    wikiLookupQuery,
    notebookAgentSlug,
    notebookEntrySlug,
    projectFocusId,
    taskFocusId,
  ]);
}

export const __test__ = {
  parseHash,
  stateToHash,
};
