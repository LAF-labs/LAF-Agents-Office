import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createDM,
  get,
  getConfig,
  post,
  postMessage,
  runSlashCommand,
  setMemory,
} from "../../api/client";
import { useCommands } from "../../hooks/useCommands";
import { useMentionTargets } from "../../hooks/useMentionTargets";
import { useI18n } from "../../lib/i18n";
import {
  extractTaggedMentions,
  parseMentions,
  renderMentionTokens,
} from "../../lib/mentions";
import {
  type AppStore,
  directChannelSlug,
  useAppStore,
} from "../../stores/app";
import { confirm } from "../ui/ConfirmDialog";
import { openProviderSwitcher } from "../ui/ProviderSwitcher";
import { showNotice } from "../ui/Toast";
import {
  Autocomplete,
  type AutocompleteItem,
  applyAutocomplete,
} from "./Autocomplete";

/** How many sent messages to keep in per-channel history. */
const COMPOSER_HISTORY_LIMIT = 20;

/** sessionStorage key shape: `laf-office:composer-history:<channel>`. */
function historyKey(channel: string): string {
  return `laf-office:composer-history:${channel || "general"}`;
}

function readHistory(channel: string): string[] {
  try {
    const raw = sessionStorage.getItem(historyKey(channel));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
  } catch {
    return [];
  }
}

function writeHistory(channel: string, entries: string[]): void {
  try {
    sessionStorage.setItem(historyKey(channel), JSON.stringify(entries));
  } catch {
    // sessionStorage disabled / quota exceeded — silently drop history rather
    // than blowing up the send flow. The user still sees their message land.
  }
}

/**
 * Append a sent message to the per-channel history, trimming to the most
 * recent COMPOSER_HISTORY_LIMIT entries. Skips duplicates of the latest
 * entry so rapid resends do not pollute recall.
 */
function pushHistory(channel: string, message: string): void {
  const trimmed = message.trim();
  if (!trimmed) return;
  const current = readHistory(channel);
  if (current.length > 0 && current[current.length - 1] === trimmed) return;
  const next = [...current, trimmed].slice(-COMPOSER_HISTORY_LIMIT);
  writeHistory(channel, next);
}

/** Routing prefix for `/ask`: mirrors TUI cmdAsk which always goes to the lead. */
function askPrefix(leadSlug: string | undefined): string {
  const slug = (leadSlug || "architect").trim().toLowerCase() || "architect";
  return `@${slug} `;
}

/** Pick the team-lead slug: configured first, else first built-in agent, else architect. */
function resolveLeadSlug(
  configured: string | undefined,
  members: { slug?: string; built_in?: boolean }[],
): string {
  const explicit = (configured ?? "").trim().toLowerCase();
  if (explicit) return explicit;
  const builtin = members.find(
    (m) => m.built_in && m.slug && m.slug !== "human" && m.slug !== "you",
  );
  if (builtin?.slug) return builtin.slug;
  return "architect";
}

interface SlashHandlers {
  /** Team lead slug used for `/ask` routing. */
  leadSlug: string | undefined;
  /** Send the given text as a normal message (bypasses slash parsing). */
  sendAsMessage: (text: string) => void;
  /** Refresh the active message list after a command posts output. */
  refreshMessages: () => void;
}

interface OutboundMessage {
  content: string;
  tagged: string[];
}

interface SlashCommand {
  cmd: string;
  args: string;
}

function useComposerChromeText() {
  const commands = useCommands();
  const { t } = useI18n();
  return {
    commands,
    placeholderPrefix: t("composer.messagePrefix"),
    sendLabel: t("composer.send"),
  };
}

type SlashCommandHandler = (
  args: string,
  store: AppStore,
  handlers: SlashHandlers,
) => boolean;

const APP_COMMANDS: Record<string, string> = {
  "/requests": "requests",
  "/skills": "skills",
  "/tasks": "tasks",
  "/threads": "threads",
};

function parseSlashCommand(input: string): SlashCommand {
  const parts = input.split(/\s+/);
  return {
    cmd: parts[0].toLowerCase(),
    args: parts.slice(1).join(" ").trim(),
  };
}

function handleAppCommand(cmd: string, store: AppStore): boolean {
  const app = APP_COMMANDS[cmd];
  if (!app) return false;
  store.setCurrentApp(app);
  return true;
}

function handleAskCommand(args: string, handlers: SlashHandlers): boolean {
  if (!args) {
    showNotice("Usage: /ask <question>", "info");
    return true;
  }
  // TUI's cmdAsk always routes to the team lead. Mirror that by
  // prefixing an @mention so the broker's routing picks up the lead.
  handlers.sendAsMessage(askPrefix(handlers.leadSlug) + args);
  return true;
}

function handleLookupCommand(args: string, store: AppStore): boolean {
  if (!args) {
    showNotice("Usage: /lookup <question>", "info");
    return true;
  }
  const channel = store.currentChannel;
  showNotice("Looking up in wiki…", "info");
  get("/wiki/lookup", { q: args, channel }).catch((e: Error) => {
    showNotice(`Wiki lookup failed: ${e.message}`, "error");
  });
  return true;
}

function handleRememberCommand(args: string): boolean {
  if (!args) {
    showNotice("Usage: /remember <fact>", "info");
    return true;
  }
  // Broker /memory requires namespace + key + value. Use a stable
  // human-owned namespace and a short timestamp key so repeated
  // /remember calls do not collide.
  const key = `note-${Date.now().toString(36)}`;
  setMemory("human-notes", key, args)
    .then(() =>
      showNotice(
        "Stored in memory: " +
          (args.length > 40 ? `${args.slice(0, 40)}…` : args),
        "success",
      ),
    )
    .catch((e: Error) => showNotice(`Remember failed: ${e.message}`, "error"));
  return true;
}

function handleTaskCommand(args: string, store: AppStore): boolean {
  const taskParts = args.split(/\s+/);
  const action = (taskParts[0] || "").toLowerCase();
  const taskId = taskParts[1] || "";
  const extra = taskParts.slice(2).join(" ");
  if (!(action && taskId)) {
    showNotice(
      "Usage: /task <claim|release|complete|block|approve> <task-id>",
      "info",
    );
    return true;
  }
  const body: Record<string, string> = {
    action,
    id: taskId,
    channel: store.currentChannel,
  };
  if (action === "claim") body.owner = "human";
  if (extra) body.details = extra;
  post("/tasks", body)
    .then(() => showNotice(`Task ${taskId} → ${action}`, "success"))
    .catch((e: Error) =>
      showNotice(`Task action failed: ${e.message}`, "error"),
    );
  return true;
}

function handleCancelCommand(args: string, store: AppStore): boolean {
  if (!args) {
    showNotice("Usage: /cancel <task-id>", "info");
    return true;
  }
  post("/tasks", {
    action: "release",
    id: args.trim(),
    channel: store.currentChannel,
  })
    .then(() => showNotice(`Task ${args.trim()} cancelled`, "success"))
    .catch(() => showNotice("Cancel failed", "error"));
  return true;
}

function handleWorkflowCommand(
  cmd: string,
  args: string,
  store: AppStore,
  handlers: SlashHandlers,
): boolean {
  const input = [cmd, args].filter(Boolean).join(" ");
  showNotice(`Running ${cmd}…`, "info");
  runSlashCommand(input, store.currentChannel)
    .then(() => {
      handlers.refreshMessages();
      showNotice(`${cmd} posted to channel`, "success");
    })
    .catch((e: Error) => showNotice(`${cmd} failed: ${e.message}`, "error"));
  return true;
}

const SLASH_COMMANDS: Record<string, SlashCommandHandler> = {
  "/clear": () => {
    showNotice("Messages cleared", "info");
    return true;
  },
  "/help": (_args, store) => {
    store.setComposerHelpOpen(true);
    return true;
  },
  "/provider": () => {
    openProviderSwitcher();
    return true;
  },
  "/search": (args, store) => {
    store.setComposerSearchInitialQuery(args);
    store.setSearchOpen(true);
    return true;
  },
  "/ask": (args, _store, handlers) => handleAskCommand(args, handlers),
  "/lookup": (args, store) => handleLookupCommand(args, store),
  "/lint": (_args, store) => {
    store.setCurrentApp("wiki");
    store.setWikiPath("_lint");
    return true;
  },
  "/remember": (args) => handleRememberCommand(args),
  "/focus": () => {
    post("/focus-mode", { focus_mode: true })
      .then(() => showNotice("Switched to delegation mode", "success"))
      .catch(() => showNotice("Failed to switch mode", "error"));
    return true;
  },
  "/collab": () => {
    post("/focus-mode", { focus_mode: false })
      .then(() => showNotice("Switched to collaborative mode", "success"))
      .catch(() => showNotice("Failed to switch mode", "error"));
    return true;
  },
  "/pause": () => {
    post("/signals", { kind: "pause", summary: "Human paused all agents" })
      .then(() => showNotice("All agents paused", "success"))
      .catch((e: Error) => showNotice(`Pause failed: ${e.message}`, "error"));
    return true;
  },
  "/resume": () => {
    post("/signals", { kind: "resume", summary: "Human resumed agents" })
      .then(() => showNotice("Agents resumed", "success"))
      .catch((e: Error) => showNotice(`Resume failed: ${e.message}`, "error"));
    return true;
  },
  "/reset": (_args, store) => {
    confirm({
      title: "Reset the workspace?",
      message:
        "Clears the live message view and drops in-memory state. Persisted tasks and requests stay on the broker.",
      confirmLabel: "Reset",
      danger: true,
      onConfirm: () =>
        post("/reset", {})
          .then(() => {
            store.setLastMessageId(null);
            store.setCurrentChannel("general");
            showNotice("Workspace reset", "success");
          })
          .catch((e: Error) =>
            showNotice(`Reset failed: ${e.message}`, "error"),
          ),
    });
    return true;
  },
  "/1o1": (args, store) => {
    if (!args) {
      showNotice("Usage: /1o1 <agent-slug>", "info");
      return true;
    }
    const slug = args.trim().toLowerCase();
    createDM(slug)
      .then((data) => {
        const ch = data.slug || directChannelSlug(slug);
        store.enterDM(slug, ch);
      })
      .catch(() => showNotice(`Agent not found: ${args.trim()}`, "error"));
    return true;
  },
  "/task": (args, store) => handleTaskCommand(args, store),
  "/cancel": (args, store) => handleCancelCommand(args, store),
  "/hire-agent": (args, store, handlers) =>
    handleWorkflowCommand("/hire-agent", args, store, handlers),
  "/assign-task": (args, store, handlers) =>
    handleWorkflowCommand("/assign-task", args, store, handlers),
  "/daily-standup": (args, store, handlers) =>
    handleWorkflowCommand("/daily-standup", args, store, handlers),
  "/review-office": (args, store, handlers) =>
    handleWorkflowCommand("/review-office", args, store, handlers),
  "/promote-to-wiki": (args, store, handlers) =>
    handleWorkflowCommand("/promote-to-wiki", args, store, handlers),
  "/fix-bug": (args, store, handlers) =>
    handleWorkflowCommand("/fix-bug", args, store, handlers),
  "/deploy-simulation": (args, store, handlers) =>
    handleWorkflowCommand("/deploy-simulation", args, store, handlers),
};

/**
 * Handle slash commands. Returns true if the input was consumed as a command.
 *
 * Some commands (e.g. `/ask`) rewrite the input and invoke sendAsMessage so
 * the broker sees a normal user message with the right @mention routing.
 */
function handleSlashCommand(input: string, handlers: SlashHandlers): boolean {
  const { cmd, args } = parseSlashCommand(input);
  const store = useAppStore.getState();
  if (handleAppCommand(cmd, store)) return true;
  return SLASH_COMMANDS[cmd]?.(args, store, handlers) ?? false;
}

/**
 * History recall state. `draftStash` holds whatever the operator had typed
 * before the first Ctrl+P so we can restore it when they walk forward past
 * the end of history.
 */
interface HistoryState {
  /** -1 when live, else index into the cached history array. */
  index: number;
  /** Draft text to restore when stepping past the end. */
  draftStash: string | null;
  /** Snapshot taken at recall start; kept so mid-recall writes don't churn it. */
  entries: string[];
}

function emptyHistoryState(): HistoryState {
  return { index: -1, draftStash: null, entries: [] };
}

interface AutocompleteKeyContext {
  items: AutocompleteItem[];
  selectedIdx: number;
  setSelectedIdx: Dispatch<SetStateAction<number>>;
  pickAutocomplete: (item: AutocompleteItem) => void;
  clearAutocomplete: () => void;
}

function handleAutocompleteKey(
  e: React.KeyboardEvent,
  context: AutocompleteKeyContext,
): boolean {
  const { items, selectedIdx, setSelectedIdx, pickAutocomplete } = context;
  if (items.length === 0) return false;

  if (e.key === "ArrowDown") {
    e.preventDefault();
    setSelectedIdx((i) => (i + 1) % items.length);
    return true;
  }
  if (e.key === "ArrowUp") {
    e.preventDefault();
    setSelectedIdx((i) => (i - 1 + items.length) % items.length);
    return true;
  }
  if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    const pick = items[selectedIdx] ?? items[0];
    if (pick) pickAutocomplete(pick);
    return true;
  }
  if (e.key === "Escape") {
    e.preventDefault();
    context.clearAutocomplete();
    return true;
  }

  return false;
}

interface HistoryKeyContext {
  recallPrevious: () => boolean;
  recallNext: () => boolean;
  moveCaretToEnd: () => void;
}

function handleHistoryRecallKey(
  e: React.KeyboardEvent,
  context: HistoryKeyContext,
): boolean {
  if (!(e.ctrlKey && !e.metaKey && !e.altKey)) return false;

  if ((e.key === "p" || e.key === "P") && context.recallPrevious()) {
    e.preventDefault();
    context.moveCaretToEnd();
    return true;
  }
  if ((e.key === "n" || e.key === "N") && context.recallNext()) {
    e.preventDefault();
    context.moveCaretToEnd();
    return true;
  }

  return false;
}

function isPlainArrowUp(e: React.KeyboardEvent): boolean {
  return (
    e.key === "ArrowUp" && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey
  );
}

function handleEmptyDraftRecallKey(
  e: React.KeyboardEvent,
  text: string,
  context: Pick<HistoryKeyContext, "recallPrevious" | "moveCaretToEnd">,
): boolean {
  if (!(isPlainArrowUp(e) && text === "" && context.recallPrevious())) {
    return false;
  }
  e.preventDefault();
  context.moveCaretToEnd();
  return true;
}

function handleComposerSubmitKey(
  e: React.KeyboardEvent,
  handleSend: () => void,
): boolean {
  if (e.key !== "Enter" || e.shiftKey) return false;
  e.preventDefault();
  handleSend();
  return true;
}

interface ComposerSendButtonProps {
  disabled: boolean;
  label: string;
  onClick: () => void;
}

function ComposerSendButton({
  disabled,
  label,
  onClick,
}: ComposerSendButtonProps) {
  return (
    <button
      type="button"
      className="composer-send"
      disabled={disabled}
      onClick={onClick}
      aria-label={label}
    >
      <svg
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
        <path d="m22 2-7 20-4-9-9-4Z" />
        <path d="M22 2 11 13" />
      </svg>
    </button>
  );
}

export function Composer() {
  const currentChannel = useAppStore((s) => s.currentChannel);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [acItems, setAcItems] = useState<AutocompleteItem[]>([]);
  const [acIdx, setAcIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const { data: cfg } = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    staleTime: 60_000,
  });
  const {
    agentMembers: members,
    agentSlugs,
    mentionSlugs,
  } = useMentionTargets();
  const leadSlug = useMemo(
    () => resolveLeadSlug(cfg?.team_lead_slug, members),
    [cfg?.team_lead_slug, members],
  );
  // Slugs the mirror-overlay recognises as mention chips.
  const mentionTokens = useMemo(
    () => parseMentions(text, mentionSlugs),
    [text, mentionSlugs],
  );
  // Broker-backed slash-command registry. Falls back to the hardcoded
  // list if the broker is unreachable so the composer is never worse
  // than before this plumbing landed.
  const { commands, placeholderPrefix, sendLabel } = useComposerChromeText();

  const historyRef = useRef<HistoryState>(emptyHistoryState());
  const refreshMessages = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["messages", currentChannel] });
  }, [queryClient, currentChannel]);

  // Reset recall when switching channels so Ctrl+P replays *this* channel.
  useEffect(() => {
    historyRef.current = emptyHistoryState();
  }, []);

  const resetRecall = useCallback(() => {
    historyRef.current = emptyHistoryState();
  }, []);

  const pickAutocomplete = useCallback(
    (item: AutocompleteItem) => {
      const next = applyAutocomplete(text, caret, item);
      setText(next.text);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.caret, next.caret);
        setCaret(next.caret);
      });
    },
    [text, caret],
  );

  const sendMutation = useMutation({
    mutationFn: ({ content, tagged }: OutboundMessage) =>
      postMessage(content, currentChannel, undefined, tagged),
    onSuccess: refreshMessages,
    onError: (err: unknown) => {
      const message =
        err instanceof Error ? err.message : "Failed to send message";
      // The broker blocks chat with 409 + "request pending; answer required" when
      // an agent is waiting on the human. The InterviewBar above the composer
      // already shows the question, so the user has somewhere to act. Never yank
      // them away from the textbox they are typing in.
      if (/request pending|answer required/i.test(message)) {
        showNotice("Answer the interview above to send messages.", "info");
        return;
      }
      showNotice(message, "error");
    },
  });

  const resetComposer = useCallback(() => {
    setText("");
    resetRecall();
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [resetRecall]);

  const handleSend = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;

    // Handle slash commands
    if (trimmed.startsWith("/")) {
      const consumed = handleSlashCommand(trimmed, {
        leadSlug,
        sendAsMessage: (rewritten) => {
          sendMutation.mutate({
            content: rewritten,
            tagged: extractTaggedMentions(rewritten, mentionSlugs, {
              allSlugs: agentSlugs,
            }),
          });
        },
        refreshMessages,
      });
      if (consumed) {
        // Persist the *raw* command to history so Ctrl+P replays `/ask foo`,
        // not the rewritten `@architect foo`. Matches user expectation.
        pushHistory(currentChannel, trimmed);
        resetComposer();
        return;
      }
    }

    pushHistory(currentChannel, trimmed);
    sendMutation.mutate({
      content: trimmed,
      tagged: extractTaggedMentions(trimmed, mentionSlugs, {
        allSlugs: agentSlugs,
      }),
    });
    resetComposer();
  }, [
    text,
    sendMutation,
    leadSlug,
    currentChannel,
    resetComposer,
    agentSlugs,
    mentionSlugs,
    refreshMessages,
  ]);

  /**
   * Walk backward through history. On first invocation, snapshot the live
   * draft so Ctrl+N can restore it. Returns true if recall succeeded.
   */
  const recallPrevious = useCallback((): boolean => {
    const state = historyRef.current;
    if (state.index === -1) {
      const entries = readHistory(currentChannel);
      if (entries.length === 0) return false;
      state.entries = entries;
      state.draftStash = text;
      state.index = entries.length;
    }
    if (state.index <= 0) return false;
    state.index -= 1;
    setText(state.entries[state.index]);
    return true;
  }, [currentChannel, text]);

  /**
   * Walk forward through history. When we run off the end, restore the
   * original draft and clear recall state.
   */
  const recallNext = useCallback((): boolean => {
    const state = historyRef.current;
    if (state.index === -1) return false;
    if (state.index < state.entries.length - 1) {
      state.index += 1;
      setText(state.entries[state.index]);
      return true;
    }
    setText(state.draftStash ?? "");
    historyRef.current = emptyHistoryState();
    return true;
  }, []);

  const moveCaretToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      const end = el.value.length;
      el.setSelectionRange(end, end);
      setCaret(end);
    });
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (
        handleAutocompleteKey(e, {
          items: acItems,
          selectedIdx: acIdx,
          setSelectedIdx: setAcIdx,
          pickAutocomplete,
          clearAutocomplete: () => setAcItems([]),
        })
      ) {
        return;
      }

      // History recall — Ctrl+P / Ctrl+N (TUI parity: internal/tui/interaction.go:56-58)
      if (
        handleHistoryRecallKey(e, {
          recallPrevious,
          recallNext,
          moveCaretToEnd,
        })
      ) {
        return;
      }

      // Slack-style: empty-draft ArrowUp recalls the last message.
      if (
        handleEmptyDraftRecallKey(e, text, {
          recallPrevious,
          moveCaretToEnd,
        })
      ) {
        return;
      }

      handleComposerSubmitKey(e, handleSend);
    },
    [
      handleSend,
      acItems,
      acIdx,
      pickAutocomplete,
      recallPrevious,
      recallNext,
      text,
      moveCaretToEnd,
    ],
  );

  const handleAcItems = useCallback((items: AutocompleteItem[]) => {
    setAcItems(items);
    setAcIdx((idx) => Math.min(idx, Math.max(items.length - 1, 0)));
  }, []);

  const syncCaret = useCallback(() => {
    const el = textareaRef.current;
    if (el) setCaret(el.selectionStart ?? 0);
  }, []);

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }, []);

  // Keep the mirror overlay scroll-locked to the textarea. Once content
  // overflows the 120px cap, the textarea scrolls internally; the mirror
  // has no scroll constraint of its own, so without this the chips would
  // drift out of alignment with the visible text rows.
  const syncScroll = useCallback(() => {
    const src = textareaRef.current;
    const dst = mirrorRef.current;
    if (src && dst) dst.scrollTop = src.scrollTop;
  }, []);

  return (
    <div className="composer">
      <Autocomplete
        value={text}
        caret={caret}
        selectedIdx={acIdx}
        onItems={handleAcItems}
        onPick={pickAutocomplete}
        commands={commands}
      />
      <div className="composer-inner">
        <div className="composer-field">
          {/* Mirror overlay renders mention chips while textarea stays editable. */}
          <div ref={mirrorRef} className="composer-mirror" aria-hidden="true">
            {renderMentionTokens(mentionTokens)}
            {/* Trailing newline keeps mirror height aligned with the textarea. */}
            {"\n"}
          </div>
          <textarea
            ref={textareaRef}
            className="composer-input"
            placeholder={`${placeholderPrefix} #${currentChannel}`}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart ?? 0);
              handleInput();
              syncScroll();
              // Any manual edit cancels history recall.
              if (historyRef.current.index !== -1) {
                resetRecall();
              }
            }}
            onKeyDown={handleKeyDown}
            onKeyUp={syncCaret}
            onClick={syncCaret}
            onScroll={syncScroll}
            rows={1}
          />
        </div>
        <ComposerSendButton
          disabled={!text.trim() || sendMutation.isPending}
          label={sendLabel}
          onClick={handleSend}
        />
      </div>
    </div>
  );
}

// Re-export helpers for testing.
export const __test__ = {
  historyKey,
  readHistory,
  writeHistory,
  pushHistory,
  resolveLeadSlug,
  askPrefix,
  COMPOSER_HISTORY_LIMIT,
};
