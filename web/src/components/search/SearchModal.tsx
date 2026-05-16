import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { post } from "../../api/client";
import {
  searchWorkspace,
  type WorkspaceSearchHit,
} from "../../api/workspaceSearch";
import { useChannels } from "../../hooks/useChannels";
import { useOfficeMembers } from "../../hooks/useMembers";
import { useAppStore } from "../../stores/app";
import { SLASH_COMMANDS } from "../messages/Autocomplete";
import { CommandGlyph } from "../ui/CommandGlyph";
import { Kbd } from "../ui/Kbd";
import { openProviderSwitcher } from "../ui/ProviderSwitcher";
import { showNotice } from "../ui/Toast";

interface PaletteItem {
  id: string;
  group:
    | "Project activity"
    | "Project agents"
    | "Actions"
    | "Wiki"
    | "Projects"
    | "Chat";
  icon: string;
  label: string;
  desc?: string;
  meta?: string;
  run: () => void;
}

interface GroupedPaletteItem {
  group: PaletteItem["group"];
  items: { item: PaletteItem; flatIdx: number }[];
}

interface SearchChannel {
  slug: string;
  name?: string | null;
  description?: string | null;
}

interface SearchMember {
  slug?: string | null;
  name?: string | null;
  role?: string | null;
  emoji?: string | null;
}

interface SearchHitResults {
  workspaceHits: WorkspaceSearchHit[];
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  let offset = 0;
  return parts.map((part) => {
    const key = `${offset}-${part}`;
    offset += part.length;
    const isMatch =
      regex.test(part) && part.toLowerCase() === query.toLowerCase();
    regex.lastIndex = 0;
    return isMatch ? <mark key={key}>{part}</mark> : part;
  });
}

function prettyWikiPath(path: string): string {
  return path.replace(/^team\//, "").replace(/\.md$/, "");
}

function parseNotebookPathLegacy(
  path: string,
): { agent: string; entry: string } | null {
  // `agents/<slug>/<entry>.md` — split and validate the shape without regex
  // capture groups that trip up some static analyzers.
  if (!(path.startsWith("agents/") && path.endsWith(".md"))) return null;
  const stripped = path.slice("agents/".length, -3);
  const parts = stripped.split("/");
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { agent: parts[0], entry: parts[1] };
  }
  if (parts.length === 3 && parts[0] && parts[1] === "notebook" && parts[2]) {
    return { agent: parts[0], entry: parts[2] };
  }
  return null;
}

function searchTerm(query: string, prefix: string): string {
  return query.replace(new RegExp(`^${prefix}`), "");
}

function isSearchableAgentSlug(slug: unknown): slug is string {
  return (
    typeof slug === "string" &&
    slug !== "human" &&
    slug !== "you" &&
    slug !== "system"
  );
}

async function loadSearchHits(query: string): Promise<SearchHitResults> {
  const workspace = await searchWorkspace(query, { limit: 24 });
  return { workspaceHits: workspace.hits };
}

interface PaletteBuildDeps extends CommandDeps {
  query: string;
  channels: SearchChannel[];
  members: SearchMember[];
  workspaceHits: WorkspaceSearchHit[];
  setActiveAgentSlug: (slug: string | null) => void;
  setProjectFocusId: (projectId: string | null) => void;
  setTaskFocusId: (taskId: string | null) => void;
  setWikiPath: (path: string | null) => void;
  close: () => void;
}

function buildPaletteItems(deps: PaletteBuildDeps): PaletteItem[] {
  const q = deps.query.trim().toLowerCase();
  return [
    ...buildChannelItems(deps, q),
    ...buildAgentItems(deps, q),
    ...buildCommandItems(deps, q),
    ...buildSearchResultItems(deps, q),
  ];
}

function buildChannelItems(deps: PaletteBuildDeps, q: string): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const channel of deps.channels) {
    const hay =
      `${channel.slug} ${channel.name ?? ""} ${channel.description ?? ""}`.toLowerCase();
    if (q && !hay.includes(searchTerm(q, "#"))) continue;
    items.push({
      id: `ch:${channel.slug}`,
      group: "Project activity",
      icon: "channel",
      label: channel.name || channel.slug,
      desc: channel.description || undefined,
      meta: `#${channel.slug}`,
      run: () => {
        deps.setCurrentApp(null);
        deps.setCurrentChannel(channel.slug);
        deps.setLastMessageId(null);
        deps.close();
      },
    });
  }
  return items;
}

function buildAgentItems(deps: PaletteBuildDeps, q: string): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const member of deps.members) {
    const { slug } = member;
    if (!isSearchableAgentSlug(slug)) continue;
    const hay =
      `${slug} ${member.name ?? ""} ${member.role ?? ""}`.toLowerCase();
    if (q && !hay.includes(searchTerm(q, "@"))) continue;
    items.push({
      id: `ag:${slug}`,
      group: "Project agents",
      icon: "agent",
      label: member.name || slug,
      desc: member.role || undefined,
      meta: `@${slug}`,
      run: () => {
        deps.setActiveAgentSlug(slug);
        deps.close();
      },
    });
  }
  return items;
}

function buildCommandItems(deps: PaletteBuildDeps, q: string): PaletteItem[] {
  const items: PaletteItem[] = [];
  for (const command of SLASH_COMMANDS) {
    const hay = `${command.name} ${command.desc}`.toLowerCase();
    if (q && !hay.includes(searchTerm(q, "/"))) continue;
    items.push({
      id: `cmd:${command.name}`,
      group: "Actions",
      icon: command.icon,
      label: command.name,
      desc: command.desc,
      run: () => {
        dispatchPaletteCommand(command.name, deps);
        deps.close();
      },
    });
  }
  return items;
}

function buildSearchResultItems(
  deps: PaletteBuildDeps,
  q: string,
): PaletteItem[] {
  if (q.length < 2) return [];
  return buildWorkspaceItems(deps);
}

function buildWorkspaceItems(deps: PaletteBuildDeps): PaletteItem[] {
  return deps.workspaceHits.map((hit) => {
    const path = hit.path ?? "";
    return {
      id: `workspace:${hit.id}`,
      group: workspaceGroup(hit),
      icon: workspaceIcon(hit),
      label: workspaceLabel(hit, path),
      desc: hit.snippet.trim().slice(0, 140),
      meta: workspaceMeta(hit),
      run: () => {
        if (hit.source === "wiki" && path) {
          deps.setCurrentApp("wiki");
          deps.setWikiPath(path);
        } else if (hit.source === "chat" && hit.channel) {
          deps.setCurrentApp(null);
          deps.setCurrentChannel(hit.channel);
          deps.setLastMessageId(null);
        } else if (hit.source === "project" || hit.source === "task") {
          deps.setProjectFocusId(hit.project_id || null);
          deps.setTaskFocusId(
            hit.source === "task" ? hit.task_id || null : null,
          );
          deps.setCurrentApp("tasks");
        } else if (hit.channel) {
          deps.setCurrentApp(null);
          deps.setCurrentChannel(hit.channel);
        } else {
          deps.setCurrentApp("tasks");
        }
        deps.close();
      },
    };
  });
}

function workspaceLabel(hit: WorkspaceSearchHit, path: string): string {
  if (hit.source === "wiki") return prettyWikiPath(path || hit.title);
  const legacyNotebook =
    hit.source === "notebook" ? parseNotebookPathLegacy(path) : null;
  if (legacyNotebook)
    return `${legacyNotebook.agent} - ${legacyNotebook.entry}`;
  return hit.title || path || hit.id;
}

function workspaceGroup(hit: WorkspaceSearchHit): PaletteItem["group"] {
  if (hit.source === "wiki") return "Wiki";
  if (hit.source === "chat") return "Chat";
  return "Projects";
}

function workspaceIcon(hit: WorkspaceSearchHit): string {
  switch (hit.source) {
    case "wiki":
      return "wiki";
    case "project":
      return "page";
    case "task":
      return "task";
    case "chat":
      return "message";
    default:
      return "search";
  }
}

function workspaceMeta(hit: WorkspaceSearchHit): string {
  const parts = [sourceLabel(hit.source)];
  if (hit.line) parts.push(`L${hit.line}`);
  if (hit.task_id) parts.push(`#${hit.task_id}`);
  if (hit.channel) parts.push(`#${hit.channel}`);
  return parts.filter(Boolean).join(" - ");
}

function sourceLabel(source: string): string {
  switch (source) {
    case "wiki":
      return "wiki";
    case "project":
      return "project";
    case "task":
      return "task";
    case "chat":
      return "chat";
    default:
      return source.replace(/_/g, " ");
  }
}

interface PaletteKeyContext {
  close: () => void;
  items: PaletteItem[];
  selectedIdx: number;
  setSelectedIdx: React.Dispatch<React.SetStateAction<number>>;
}

function handlePaletteKeyDown(e: KeyboardEvent, context: PaletteKeyContext) {
  if (e.key === "Escape") {
    e.preventDefault();
    context.close();
    return;
  }
  if (e.key === "ArrowDown") {
    e.preventDefault();
    context.setSelectedIdx((i) =>
      context.items.length === 0 ? 0 : (i + 1) % context.items.length,
    );
    return;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    context.setSelectedIdx((i) =>
      context.items.length === 0
        ? 0
        : (i - 1 + context.items.length) % context.items.length,
    );
    return;
  }
  if (e.key === "Enter") {
    e.preventDefault();
    context.items[context.selectedIdx]?.run();
  }
}

export function SearchModal() {
  const searchOpen = useAppStore((s) => s.searchOpen);
  const setSearchOpen = useAppStore((s) => s.setSearchOpen);
  const setCurrentChannel = useAppStore((s) => s.setCurrentChannel);
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const setActiveAgentSlug = useAppStore((s) => s.setActiveAgentSlug);
  const setProjectFocusId = useAppStore((s) => s.setProjectFocusId);
  const setTaskFocusId = useAppStore((s) => s.setTaskFocusId);
  const enterDM = useAppStore((s) => s.enterDM);
  const setLastMessageId = useAppStore((s) => s.setLastMessageId);
  const setWikiPath = useAppStore((s) => s.setWikiPath);
  const composerSearchInitialQuery = useAppStore(
    (s) => s.composerSearchInitialQuery,
  );
  const setComposerSearchInitialQuery = useAppStore(
    (s) => s.setComposerSearchInitialQuery,
  );
  const { data: channels = [] } = useChannels();
  const { data: members = [] } = useOfficeMembers();

  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [workspaceHits, setWorkspaceHits] = useState<WorkspaceSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRequestRef = useRef(0);

  const close = useCallback(() => setSearchOpen(false), [setSearchOpen]);

  const runSearch = useCallback(async (raw: string) => {
    const trimmed = raw.trim();
    const requestId = searchRequestRef.current + 1;
    searchRequestRef.current = requestId;
    if (trimmed.length < 2) {
      setWorkspaceHits([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    try {
      const results = await loadSearchHits(trimmed);
      if (requestId === searchRequestRef.current) {
        setWorkspaceHits(results.workspaceHits);
      }
    } finally {
      if (requestId === searchRequestRef.current) {
        setSearching(false);
      }
    }
  }, []);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedIdx(0);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSearch(value), 320);
    },
    [runSearch],
  );

  useEffect(() => {
    if (searchOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      if (composerSearchInitialQuery) {
        handleQueryChange(composerSearchInitialQuery);
        setComposerSearchInitialQuery("");
      }
      return () => clearTimeout(t);
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    searchRequestRef.current += 1;
    setQuery("");
    setWorkspaceHits([]);
    setSearching(false);
    setSelectedIdx(0);
  }, [
    searchOpen,
    composerSearchInitialQuery,
    handleQueryChange,
    setComposerSearchInitialQuery,
  ]);

  const items = useMemo<PaletteItem[]>(() => {
    return buildPaletteItems({
      query,
      channels,
      members,
      workspaceHits,
      setCurrentApp,
      setCurrentChannel,
      setActiveAgentSlug,
      setProjectFocusId,
      setTaskFocusId,
      setLastMessageId,
      setSearchOpen,
      setWikiPath,
      enterDM,
      close,
    });
  }, [
    query,
    channels,
    members,
    workspaceHits,
    setCurrentApp,
    setCurrentChannel,
    setActiveAgentSlug,
    setProjectFocusId,
    setTaskFocusId,
    setLastMessageId,
    setSearchOpen,
    setWikiPath,
    enterDM,
    close,
  ]);

  useEffect(() => {
    setSelectedIdx((idx) => Math.min(idx, Math.max(items.length - 1, 0)));
  }, [items.length]);

  useEffect(() => {
    if (!searchOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      handlePaletteKeyDown(e, { close, items, selectedIdx, setSelectedIdx });
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, items, selectedIdx, close]);

  const grouped = useMemo(() => {
    const out: GroupedPaletteItem[] = [];
    items.forEach((item, idx) => {
      const last = out[out.length - 1];
      if (last && last.group === item.group) {
        last.items.push({ item, flatIdx: idx });
      } else {
        out.push({ group: item.group, items: [{ item, flatIdx: idx }] });
      }
    });
    return out;
  }, [items]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (e.target === e.currentTarget) close();
  }

  if (!searchOpen) return null;

  return (
    <div
      className="search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      tabIndex={-1}
      onClick={handleOverlayClick}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <div className="search-modal card cmd-palette">
        <div className="search-input-wrap">
          <svg
            className="search-input-icon"
            aria-hidden="true"
            focusable="false"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            className="search-input"
            type="text"
            placeholder="Search channels, agents, wiki, projects, and task chats..."
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
          />
          {searching ? <span className="search-spinner" /> : null}
        </div>

        <PaletteResults
          items={items}
          grouped={grouped}
          query={query}
          selectedIdx={selectedIdx}
          setSelectedIdx={setSelectedIdx}
        />

        <div className="cmd-palette-footer">
          <span>
            <Kbd size="sm">↑</Kbd>
            <Kbd size="sm">↓</Kbd> navigate
          </span>
          <span>
            <Kbd size="sm">↵</Kbd> open
          </span>
          <span>
            <Kbd size="sm">esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

interface PaletteResultsProps {
  items: PaletteItem[];
  grouped: GroupedPaletteItem[];
  query: string;
  selectedIdx: number;
  setSelectedIdx: React.Dispatch<React.SetStateAction<number>>;
}

function PaletteResults({
  items,
  grouped,
  query,
  selectedIdx,
  setSelectedIdx,
}: PaletteResultsProps) {
  return (
    <div className="cmd-palette-results">
      {items.length === 0 ? (
        <PaletteEmpty query={query} />
      ) : (
        grouped.map((group) => (
          <PaletteGroup
            key={group.group}
            group={group}
            query={query}
            selectedIdx={selectedIdx}
            setSelectedIdx={setSelectedIdx}
          />
        ))
      )}
    </div>
  );
}

function PaletteEmpty({ query }: { query: string }) {
  const message = query
    ? `No results for "${query}"`
    : "Start typing to search...";
  return <div className="cmd-palette-empty">{message}</div>;
}

interface PaletteGroupProps {
  group: GroupedPaletteItem;
  query: string;
  selectedIdx: number;
  setSelectedIdx: React.Dispatch<React.SetStateAction<number>>;
}

function PaletteGroup({
  group,
  query,
  selectedIdx,
  setSelectedIdx,
}: PaletteGroupProps) {
  return (
    <div className="cmd-palette-group">
      <div className="cmd-palette-group-title">{group.group}</div>
      {group.items.map(({ item, flatIdx }) => (
        <PaletteButton
          key={item.id}
          item={item}
          flatIdx={flatIdx}
          query={query}
          selectedIdx={selectedIdx}
          setSelectedIdx={setSelectedIdx}
        />
      ))}
    </div>
  );
}

interface PaletteButtonProps {
  item: PaletteItem;
  flatIdx: number;
  query: string;
  selectedIdx: number;
  setSelectedIdx: React.Dispatch<React.SetStateAction<number>>;
}

function PaletteButton({
  item,
  flatIdx,
  query,
  selectedIdx,
  setSelectedIdx,
}: PaletteButtonProps) {
  const trimmedQuery = query.trim();
  return (
    <button
      type="button"
      className={`cmd-palette-item${flatIdx === selectedIdx ? " selected" : ""}`}
      onMouseEnter={() => setSelectedIdx(flatIdx)}
      onClick={item.run}
    >
      <span className="cmd-palette-item-icon">
        <CommandGlyph name={item.icon} />
      </span>
      <span className="cmd-palette-item-text">
        <span className="cmd-palette-item-label">
          {renderPaletteLabel(item, trimmedQuery)}
        </span>
        <PaletteDescription item={item} query={trimmedQuery} />
      </span>
      {item.meta ? (
        <span className="cmd-palette-item-meta">{item.meta}</span>
      ) : null}
    </button>
  );
}

function renderPaletteLabel(item: PaletteItem, query: string): ReactNode {
  return shouldHighlightLabel(item.group)
    ? highlightMatch(item.label, query)
    : item.label;
}

function shouldHighlightLabel(group: PaletteItem["group"]): boolean {
  return group === "Wiki" || group === "Projects" || group === "Chat";
}

function PaletteDescription({
  item,
  query,
}: {
  item: PaletteItem;
  query: string;
}) {
  if (!item.desc) return null;
  const desc =
    item.group === "Wiki" || item.group === "Projects" || item.group === "Chat"
      ? highlightMatch(item.desc, query)
      : item.desc;
  return <span className="cmd-palette-item-desc">{desc}</span>;
}

interface CommandDeps {
  setCurrentApp: (id: string | null) => void;
  setCurrentChannel: (slug: string) => void;
  setLastMessageId: (id: string | null) => void;
  setSearchOpen: (open: boolean) => void;
  enterDM: (agentSlug: string, channelSlug: string) => void;
}

const PALETTE_APP_COMMANDS: Record<string, string> = {
  "/growth": "growth",
  "/requests": "requests",
  "/skills": "skills",
  "/tasks": "tasks",
  "/threads": "threads",
};

const PALETTE_COMMAND_HANDLERS: Record<string, (deps: CommandDeps) => void> = {
  "/clear": () => showNotice("Messages cleared", "info"),
  "/help": () => useAppStore.getState().setComposerHelpOpen(true),
  "/ask": () =>
    showNotice("/ask requires arguments — type it in the composer.", "info"),
  "/remember": () =>
    showNotice(
      "/remember requires arguments — type it in the composer.",
      "info",
    ),
  "/search": (deps) => deps.setSearchOpen(true),
  "/provider": () => openProviderSwitcher(),
  "/focus": () => {
    post("/focus-mode", { focus_mode: true })
      .then(() => showNotice("Switched to delegation mode", "success"))
      .catch((e: Error) =>
        showNotice(`Failed to switch mode: ${e.message}`, "error"),
      );
  },
  "/collab": () => {
    post("/focus-mode", { focus_mode: false })
      .then(() => showNotice("Switched to collaborative mode", "success"))
      .catch((e: Error) =>
        showNotice(`Failed to switch mode: ${e.message}`, "error"),
      );
  },
  "/pause": () => {
    post("/signals", { kind: "pause", summary: "Human paused all agents" })
      .then(() => showNotice("All agents paused", "success"))
      .catch((e: Error) => showNotice(`Pause failed: ${e.message}`, "error"));
  },
  "/resume": () => {
    post("/signals", { kind: "resume", summary: "Human resumed agents" })
      .then(() => showNotice("Agents resumed", "success"))
      .catch((e: Error) => showNotice(`Resume failed: ${e.message}`, "error"));
  },
  "/reset": (deps) => {
    post("/reset", {})
      .then(() => {
        deps.setLastMessageId(null);
        deps.setCurrentChannel("general");
        showNotice("Workspace reset", "success");
      })
      .catch((e: Error) => showNotice(`Reset failed: ${e.message}`, "error"));
  },
};

function dispatchPaletteCommand(name: string, deps: CommandDeps) {
  const app = PALETTE_APP_COMMANDS[name];
  if (app) {
    deps.setCurrentApp(app);
    return;
  }
  const handler = PALETTE_COMMAND_HANDLERS[name];
  if (handler) {
    handler(deps);
    return;
  }
  showNotice(`${name} requires arguments — type it in the composer.`, "info");
}
