import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { getMessages, type Message, post } from "../../api/client";
import { type NotebookSearchHit, searchNotebook } from "../../api/notebook";
import { searchWiki, type WikiSearchHit } from "../../api/wiki";
import { useChannels } from "../../hooks/useChannels";
import { useOfficeMembers } from "../../hooks/useMembers";
import { useAppStore } from "../../stores/app";
import { SLASH_COMMANDS } from "../messages/Autocomplete";
import { Kbd } from "../ui/Kbd";
import { openProviderSwitcher } from "../ui/ProviderSwitcher";
import { showNotice } from "../ui/Toast";

interface PaletteItem {
  id: string;
  group: "Channels" | "Agents" | "Commands" | "Messages" | "Wiki" | "Notebooks";
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

interface MessageHit extends Message {
  matchedChannel: string;
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
  messageHits: MessageHit[];
  wikiHits: WikiSearchHit[];
  notebookHits: NotebookSearchHit[];
}

function formatTime(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return ts;
  }
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

function parseNotebookPath(
  path: string,
): { agent: string; entry: string } | null {
  // `agents/<slug>/<entry>.md` — split and validate the shape without regex
  // capture groups that trip up some static analyzers.
  if (!(path.startsWith("agents/") && path.endsWith(".md"))) return null;
  const stripped = path.slice("agents/".length, -3);
  const firstSlash = stripped.indexOf("/");
  if (firstSlash <= 0 || firstSlash === stripped.length - 1) return null;
  const agent = stripped.slice(0, firstSlash);
  const entry = stripped.slice(firstSlash + 1);
  if (entry.includes("/")) return null;
  return { agent, entry };
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

async function searchMessages(
  channels: SearchChannel[],
  needle: string,
): Promise<MessageHit[]> {
  const grouped = await Promise.all(
    channels.map(async (channel) => {
      try {
        const { messages } = await getMessages(channel.slug, null, 100);
        return messages
          .filter((message) => message.content?.toLowerCase().includes(needle))
          .map(
            (message): MessageHit => ({
              ...message,
              matchedChannel: channel.slug,
            }),
          );
      } catch {
        return [] as MessageHit[];
      }
    }),
  );

  return grouped
    .flat()
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )
    .slice(0, 8);
}

async function searchNotebooks(
  members: SearchMember[],
  query: string,
): Promise<NotebookSearchHit[]> {
  const agentSlugs = members
    .map((member) => member.slug)
    .filter(isSearchableAgentSlug);
  const grouped = await Promise.all(
    agentSlugs.map((slug) =>
      searchNotebook(slug, query).catch(() => [] as NotebookSearchHit[]),
    ),
  );
  return grouped.flat().slice(0, 8);
}

async function loadSearchHits(
  channels: SearchChannel[],
  members: SearchMember[],
  query: string,
  needle: string,
): Promise<SearchHitResults> {
  const [messageHits, wikiHits, notebookHits] = await Promise.all([
    searchMessages(channels, needle),
    searchWiki(query).then((hits) => hits.slice(0, 8)),
    searchNotebooks(members, query),
  ]);
  return { messageHits, wikiHits, notebookHits };
}

interface PaletteBuildDeps extends CommandDeps {
  query: string;
  channels: SearchChannel[];
  members: SearchMember[];
  messageHits: MessageHit[];
  wikiHits: WikiSearchHit[];
  notebookHits: NotebookSearchHit[];
  setActiveAgentSlug: (slug: string | null) => void;
  setWikiPath: (path: string | null) => void;
  setNotebookRoute: (
    agentSlug: string | null,
    entrySlug: string | null,
  ) => void;
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
      group: "Channels",
      icon: "#",
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
      group: "Agents",
      icon: member.emoji || "🤖",
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
      group: "Commands",
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
  return [
    ...buildMessageItems(deps),
    ...buildWikiItems(deps),
    ...buildNotebookItems(deps),
  ];
}

function buildMessageItems(deps: PaletteBuildDeps): PaletteItem[] {
  return deps.messageHits.map((hit) => {
    const snippet =
      hit.content.length > 100
        ? `${hit.content.slice(0, 100)}...`
        : hit.content;
    return {
      id: `msg:${hit.id}:${hit.matchedChannel}`,
      group: "Messages",
      icon: "💬",
      label: `${hit.from}: ${snippet}`,
      desc: `#${hit.matchedChannel} · ${formatTime(hit.timestamp)}`,
      run: () => {
        deps.setCurrentApp(null);
        deps.setCurrentChannel(hit.matchedChannel);
        deps.setLastMessageId(null);
        deps.close();
      },
    };
  });
}

function buildWikiItems(deps: PaletteBuildDeps): PaletteItem[] {
  return deps.wikiHits.map((hit) => ({
    id: `wiki:${hit.path}:${hit.line}`,
    group: "Wiki",
    icon: "📖",
    label: prettyWikiPath(hit.path),
    desc: hit.snippet.trim().slice(0, 120),
    meta: `L${hit.line}`,
    run: () => {
      deps.setCurrentApp("wiki");
      deps.setWikiPath(hit.path);
      deps.close();
    },
  }));
}

function buildNotebookItems(deps: PaletteBuildDeps): PaletteItem[] {
  return deps.notebookHits.map((hit) => {
    const parsed = parseNotebookPath(hit.path);
    const label = parsed ? `${parsed.agent} · ${parsed.entry}` : hit.path;
    return {
      id: `nb:${hit.path}:${hit.line}`,
      group: "Notebooks",
      icon: "📓",
      label,
      desc: hit.snippet.trim().slice(0, 120),
      meta: `L${hit.line}`,
      run: () => {
        deps.setCurrentApp("notebooks");
        if (parsed) {
          deps.setNotebookRoute(parsed.agent, parsed.entry);
        }
        deps.close();
      },
    };
  });
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
  const enterDM = useAppStore((s) => s.enterDM);
  const setLastMessageId = useAppStore((s) => s.setLastMessageId);
  const setWikiPath = useAppStore((s) => s.setWikiPath);
  const setNotebookRoute = useAppStore((s) => s.setNotebookRoute);
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
  const [messageHits, setMessageHits] = useState<MessageHit[]>([]);
  const [wikiHits, setWikiHits] = useState<WikiSearchHit[]>([]);
  const [notebookHits, setNotebookHits] = useState<NotebookSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = useCallback(() => setSearchOpen(false), [setSearchOpen]);

  const runSearch = useCallback(
    async (raw: string) => {
      const trimmed = raw.trim();
      const needle = trimmed.toLowerCase();
      if (needle.length < 2 || channels.length === 0) {
        setMessageHits([]);
        setWikiHits([]);
        setNotebookHits([]);
        return;
      }
      setSearching(true);
      try {
        const results = await loadSearchHits(
          channels,
          members,
          trimmed,
          needle,
        );
        setMessageHits(results.messageHits);
        setWikiHits(results.wikiHits);
        setNotebookHits(results.notebookHits);
      } finally {
        setSearching(false);
      }
    },
    [channels, members],
  );

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      setSelectedIdx(0);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => runSearch(value), 250);
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
    setQuery("");
    setMessageHits([]);
    setWikiHits([]);
    setNotebookHits([]);
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
      messageHits,
      wikiHits,
      notebookHits,
      setCurrentApp,
      setCurrentChannel,
      setActiveAgentSlug,
      setLastMessageId,
      setSearchOpen,
      setWikiPath,
      setNotebookRoute,
      enterDM,
      close,
    });
  }, [
    query,
    channels,
    members,
    messageHits,
    wikiHits,
    notebookHits,
    setCurrentApp,
    setCurrentChannel,
    setActiveAgentSlug,
    setLastMessageId,
    setSearchOpen,
    setWikiPath,
    setNotebookRoute,
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
            placeholder="Search channels, agents, commands, messages, wiki, notebooks..."
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
      <span className="cmd-palette-item-icon">{item.icon}</span>
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
  return group === "Messages" || group === "Wiki" || group === "Notebooks";
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
    item.group === "Wiki" || item.group === "Notebooks"
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
  "/requests": "requests",
  "/policies": "policies",
  "/skills": "skills",
  "/calendar": "calendar",
  "/tasks": "tasks",
  "/recover": "health-check",
  "/doctor": "health-check",
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
        showNotice("Office reset", "success");
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
