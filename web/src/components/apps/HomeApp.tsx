import {
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, Plus, SendDiagonal, Trash, Xmark } from "iconoir-react";

import {
  type AuthSessionResponse,
  confirmOrchestrationIntent,
  deleteHomeSession,
  getAuthSession,
  getConfig,
  getHomeSessions,
  getProjects,
  getSkills,
  getThreadMessages,
  type HomeChatSession,
  type Message,
  type ModelMode,
  type OfficeMember,
  type OrchestrationIntent,
  type Project,
  postMessage,
  routeOrchestrationIntent,
  type Skill,
} from "../../api/client";
import { subscribeBrokerEvent } from "../../api/events";
import { useOfficeMembers } from "../../hooks/useMembers";
import { formatTime } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { formatMarkdown } from "../../lib/markdown";
import { extractTaggedMentions, renderMentions } from "../../lib/mentions";
import { ModelModeToggle } from "../ModelModeToggle";
import { PixelAvatar } from "../ui/PixelAvatar";

const HOME_CHANNEL = "general";
const NON_AGENT_SLUGS = new Set(["human", "you", "system"]);
const HOME_MESSAGE_REFETCH_MS =
  typeof (globalThis as { EventSource?: typeof EventSource }).EventSource !==
  "undefined"
    ? 10_000
    : 2_000;
const HOME_STREAM_INITIAL_CHARS = 10;
const HOME_STREAM_INTERVAL_MS = 18;

type HomeAutocompleteType = "mention" | "project" | "skill";

interface HomeAutocompleteTrigger {
  type: HomeAutocompleteType;
  query: string;
  start: number;
}

interface HomeAutocompleteItem {
  insert: string;
  label: string;
  desc?: string;
}

function stableHomePart(value: string | undefined): string {
  const safe = (value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return safe || "unknown";
}

function createHomeSessionToken(): string {
  const cryptoUUID =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  return `s-${stableHomePart(cryptoUUID)}`;
}

function createHomeSessionThreadId(baseThreadId: string): string {
  return `${baseThreadId}:${createHomeSessionToken()}`;
}

const homeSessionRuntimeStore = {
  activeByBase: new Map<string, string>(),
  localBaseThreadId: null as string | null,
  current(baseThreadId: string): string {
    const existing = this.activeByBase.get(baseThreadId);
    if (existing) return existing;
    const next = createHomeSessionThreadId(baseThreadId);
    this.activeByBase.set(baseThreadId, next);
    return next;
  },
  remember(baseThreadId: string, threadId: string) {
    if (!baseThreadId || !threadId) return;
    this.activeByBase.set(baseThreadId, threadId);
  },
  reset() {
    this.activeByBase.clear();
    this.localBaseThreadId = null;
  },
  localBase(): string {
    if (!this.localBaseThreadId) {
      this.localBaseThreadId = `home:local:${createHomeSessionToken()}`;
    }
    return this.localBaseThreadId;
  },
};

function currentHomeSessionThreadId(baseThreadId: string): string {
  return homeSessionRuntimeStore.current(baseThreadId);
}

function rememberHomeSessionThread(baseThreadId: string, threadId: string) {
  homeSessionRuntimeStore.remember(baseThreadId, threadId);
}

function resetHomeSessionMemory() {
  homeSessionRuntimeStore.reset();
}

function createLocalHomeBaseThreadId(): string {
  return homeSessionRuntimeStore.localBase();
}

function createHomeChatBaseThreadId(
  session: AuthSessionResponse | null | undefined,
): string | null {
  if (!session) return null;
  if (session.authenticated && session.user) {
    const teamID = stableHomePart(session.user.team_id || session.team?.id);
    const userID = stableHomePart(session.user.id || session.user.email);
    return `home:${teamID}:${userID}`;
  }
  return createLocalHomeBaseThreadId();
}

function resolveLeadSlug(
  configured: string | undefined,
  members: OfficeMember[],
): string {
  const explicit = configured?.trim().toLowerCase();
  if (explicit && !NON_AGENT_SLUGS.has(explicit)) return explicit;
  const builtin = members.find(
    (member) =>
      member.built_in &&
      member.slug &&
      !NON_AGENT_SLUGS.has(member.slug.toLowerCase()),
  );
  return builtin?.slug || "ceo";
}

function agentMembersOnly(members: OfficeMember[]): OfficeMember[] {
  return members.filter(
    (member) =>
      member.slug && !NON_AGENT_SLUGS.has(member.slug.trim().toLowerCase()),
  );
}

function isHomeIMEComposing(
  event: KeyboardEvent<HTMLTextAreaElement>,
  composingRef: Pick<React.RefObject<boolean>, "current">,
): boolean {
  const native = event.nativeEvent as {
    isComposing?: boolean;
    keyCode?: number;
  };
  return composingRef.current || !!native.isComposing || native.keyCode === 229;
}

interface HomeAutocompleteKeyContext {
  items: HomeAutocompleteItem[];
  pickAutocomplete: (item: HomeAutocompleteItem) => void;
  selectedIdx: number;
  setSelectedIdx: Dispatch<SetStateAction<number>>;
}

function handleHomeAutocompleteKey(
  event: KeyboardEvent<HTMLTextAreaElement>,
  context: HomeAutocompleteKeyContext,
): boolean {
  const { items, pickAutocomplete, selectedIdx, setSelectedIdx } = context;
  if (items.length === 0) return false;

  if (event.key === "ArrowDown") {
    event.preventDefault();
    setSelectedIdx((idx) => (idx + 1) % items.length);
    return true;
  }
  if (event.key === "ArrowUp") {
    event.preventDefault();
    setSelectedIdx((idx) => (idx - 1 + items.length) % items.length);
    return true;
  }
  if (event.key === "Enter" || event.key === "Tab") {
    event.preventDefault();
    pickAutocomplete(items[selectedIdx] ?? items[0]);
    return true;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    setSelectedIdx(0);
    return true;
  }
  return false;
}

function currentAutocompleteTrigger(
  value: string,
  caret: number,
): HomeAutocompleteTrigger | null {
  const before = value.slice(0, caret);
  const triggers: Array<{ idx: number; type: HomeAutocompleteType }> = [
    { idx: before.lastIndexOf("@"), type: "mention" },
    { idx: before.lastIndexOf("#"), type: "project" },
    { idx: before.lastIndexOf("/"), type: "skill" },
  ];
  const [trigger] = triggers.sort((a, b) => b.idx - a.idx);
  if (trigger.idx === -1) return null;
  const prevChar = trigger.idx === 0 ? "" : before[trigger.idx - 1];
  if (prevChar !== "" && !/\s/.test(prevChar)) return null;
  const query = before.slice(trigger.idx + 1);
  if (/\s/.test(query)) return null;
  return { type: trigger.type, query, start: trigger.idx };
}

function mentionOptions(
  query: string,
  members: OfficeMember[],
): HomeAutocompleteItem[] {
  const q = query.toLowerCase();
  const base =
    "all".startsWith(q) && members.length > 0
      ? [{ insert: "@all", label: "@all", desc: "All agents" }]
      : [];
  const agents = members
    .filter((member) => {
      if (!q) return true;
      return [member.slug, member.name, member.role]
        .filter(Boolean)
        .some((value) => value.toLowerCase().includes(q));
    })
    .map((member) => ({
      insert: `@${member.slug}`,
      label: `@${member.slug}`,
      desc: member.name || member.role,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  return [...base, ...agents].slice(0, 8);
}

function projectTime(project: Project): number {
  const parsed = Date.parse(project.updated_at || project.created_at || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function sortProjectsByRecent(projects: Project[]): Project[] {
  return [...projects].sort((a, b) => {
    const byTime = projectTime(b) - projectTime(a);
    if (byTime !== 0) return byTime;
    return (a.name || a.id).localeCompare(b.name || b.id);
  });
}

function projectHashtag(project: Project): string {
  return `#${stableHomePart(project.id || project.name)}`;
}

function projectOptions(
  query: string,
  projects: Project[],
): HomeAutocompleteItem[] {
  const q = query.toLowerCase();
  return sortProjectsByRecent(projects)
    .filter((project) => {
      if (!q) return true;
      return [project.id, project.name, project.description]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(q));
    })
    .map((project) => ({
      insert: projectHashtag(project),
      label: projectHashtag(project),
      desc: project.name || project.id,
    }))
    .slice(0, 8);
}

function skillSummary(skill: Skill): string {
  return (
    skill.description?.trim() ||
    skill.trigger?.trim() ||
    skill.content
      ?.split("\n")
      .find((line) => line.trim())
      ?.trim() ||
    "팀에 등록된 스킬"
  );
}

function skillCommand(skill: Skill): string {
  return `/${stableHomePart(skill.name)}`;
}

function skillOptions(query: string, skills: Skill[]): HomeAutocompleteItem[] {
  const q = query.toLowerCase();
  return skills
    .filter((skill) => !skill.status || skill.status === "active")
    .filter((skill) => {
      if (!q) return true;
      return [
        skill.name,
        skill.title,
        skill.description,
        skill.trigger,
        ...(skill.tags ?? []),
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(q));
    })
    .map((skill) => ({
      insert: skillCommand(skill),
      label: skillCommand(skill),
      desc: skill.title
        ? `${skill.title} - ${skillSummary(skill)}`
        : skillSummary(skill),
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
    .slice(0, 8);
}

function applyAutocompleteOption(
  value: string,
  caret: number,
  option: HomeAutocompleteItem,
): { text: string; caret: number } {
  const trigger = currentAutocompleteTrigger(value, caret);
  if (!trigger) return { text: value, caret };
  const before = value.slice(0, trigger.start);
  const after = value.slice(caret);
  const insert = `${option.insert} `;
  return {
    text: before + insert + after,
    caret: before.length + insert.length,
  };
}

function visibleTargets(
  text: string,
  agentSlugs: string[],
  leadSlug: string,
): string[] {
  if (/(^|\s)@all\b/i.test(text)) return ["all"];
  const explicit = extractTaggedMentions(text, agentSlugs, {
    allSlugs: agentSlugs,
  });
  return explicit.length > 0 ? explicit : [leadSlug];
}

function isHumanMessage(message: Message): boolean {
  return message.from === "you" || message.from === "human";
}

function isHomeSummaryMessage(message: Message): boolean {
  return message.kind === "home_summary";
}

function isInternalMessage(message: Message): boolean {
  return message.visibility === "internal";
}

function shouldStreamHomeMessage(message: Message): boolean {
  return Boolean(
    message.id &&
      !isHumanMessage(message) &&
      !isHomeSummaryMessage(message) &&
      !isInternalMessage(message),
  );
}

function isAgentReplyAfter(message: Message, since: number | null): boolean {
  if (
    !since ||
    isHumanMessage(message) ||
    isHomeSummaryMessage(message) ||
    isInternalMessage(message)
  ) {
    return false;
  }
  const timestamp = Date.parse(message.timestamp || "");
  return Number.isFinite(timestamp) && timestamp >= since - 1000;
}

function isLikelyPendingHomeReply(
  message: Message,
  since: number | null,
  agentSlugs: string[],
): boolean {
  const from = message.from?.trim() ?? "";
  return Boolean(
    message.reply_to &&
      isAgentReplyAfter(message, since) &&
      (agentSlugs.includes(from) || from === "system"),
  );
}

function homeThreadMessageIDs(messages: Message[]): Set<string> {
  const ids = new Set<string>();
  for (const message of messages) {
    if (message.id) ids.add(message.id);
  }
  return ids;
}

function messageBelongsToHomeThread(
  message: Message,
  homeThreadId: string,
  threadMessageIds: Set<string>,
): boolean {
  if (isInternalMessage(message)) return false;
  const explicitHomeThreadId = message.home_session_thread_id?.trim() ?? "";
  if (explicitHomeThreadId) return explicitHomeThreadId === homeThreadId;
  const replyTo = message.reply_to?.trim() ?? "";
  const publicReplyTo = message.public_reply_to?.trim() ?? "";
  return Boolean(
    replyTo === homeThreadId ||
      publicReplyTo === homeThreadId ||
      message.thread_id === homeThreadId ||
      (replyTo && threadMessageIds.has(replyTo)) ||
      (publicReplyTo && threadMessageIds.has(publicReplyTo)),
  );
}

function parseBrokerMessageEvent(event: Event): Message | null {
  const raw = "data" in event ? String((event as MessageEvent).data || "") : "";
  if (!raw) return null;
  try {
    const { message } = JSON.parse(raw) as { message?: Message };
    return message ?? null;
  } catch {
    return null;
  }
}

function shouldAttachIncomingHomeMessage({
  agentSlugs,
  awaitingReplySince,
  homeThreadId,
  message,
  messages,
}: {
  agentSlugs: string[];
  awaitingReplySince: number | null;
  homeThreadId: string;
  message: Message;
  messages: Message[];
}): boolean {
  if (message.channel !== HOME_CHANNEL) return false;
  if (isInternalMessage(message)) return false;
  const explicitHomeThreadId = message.home_session_thread_id?.trim() ?? "";
  if (explicitHomeThreadId) return explicitHomeThreadId === homeThreadId;
  const threadIDs = homeThreadMessageIDs(messages);
  return (
    messageBelongsToHomeThread(message, homeThreadId, threadIDs) ||
    isLikelyPendingHomeReply(message, awaitingReplySince, agentSlugs)
  );
}

function mergeIncomingHomeMessage(
  messages: Message[],
  message: Message,
): Message[] {
  return [...messages.filter((item) => item.id !== message.id), message];
}

function buildOutboundMessage(
  text: string,
  agentSlugs: string[],
  leadSlug: string,
): { content: string; tagged: string[] } {
  const trimmed = text.trim();
  const explicitTagged = extractTaggedMentions(trimmed, agentSlugs, {
    allSlugs: agentSlugs,
  });
  if (explicitTagged.length > 0) {
    return {
      content: trimmed,
      tagged: explicitTagged,
    };
  }
  return {
    content: trimmed,
    tagged: [leadSlug],
  };
}

function formatSessionDate(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ko-KR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function renderHomeToken(token: string, key: string): ReactNode {
  const isSkill = token.startsWith("/");
  return (
    <span key={key} className={isSkill ? "home-skill-token" : "home-hash"}>
      {token}
    </span>
  );
}

function renderHomeText(content: string, agentSlugs: string[]): ReactNode[] {
  const mentionNodes = renderMentions(content, agentSlugs);
  const out: ReactNode[] = [];
  let textOffset = 0;
  for (const node of mentionNodes) {
    if (typeof node !== "string") {
      out.push(node);
      continue;
    }
    const parts: ReactNode[] = [];
    const re = /([#/])[a-zA-Z0-9][a-zA-Z0-9-_]{1,80}\b/g;
    let last = 0;
    for (const match of node.matchAll(re)) {
      if (match.index === undefined) continue;
      if (match.index > last) parts.push(node.slice(last, match.index));
      parts.push(
        renderHomeToken(
          match[0],
          `token-${textOffset + match.index}-${match[0]}`,
        ),
      );
      last = match.index + match[0].length;
    }
    if (last < node.length) parts.push(node.slice(last));
    out.push(...parts);
    textOffset += node.length;
  }
  return out;
}

function HomeMessageList({
  messages,
  isLoading,
  agentSlugs,
  showThinking,
  thinkingAgent,
  streamingMessageIds,
  onStreamComplete,
}: {
  messages: Message[];
  isLoading: boolean;
  agentSlugs: string[];
  showThinking: boolean;
  thinkingAgent: string;
  streamingMessageIds: Set<string>;
  onStreamComplete: (messageId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousMessageCountRef = useRef(messages.length);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    const messageCount = messages.length + (showThinking ? 1 : 0);
    if (previousMessageCountRef.current === messageCount) return;
    previousMessageCountRef.current = messageCount;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, showThinking]);

  if (isLoading && messages.length === 0) {
    return (
      <div className="home-chat-stream" role="status" aria-live="polite">
        <span className="home-muted">대화를 불러오는 중</span>
      </div>
    );
  }

  if (messages.length === 0 && !showThinking) {
    return (
      <div className="home-chat-stream home-chat-empty" ref={scrollRef}>
        <h1>오늘은 무슨 이야기를 할까요?</h1>
      </div>
    );
  }

  return (
    <div className="home-chat-stream" ref={scrollRef}>
      <div className="home-chat-list">
        {messages.map((message) => (
          <HomeMessage
            key={message.id}
            message={message}
            agentSlugs={agentSlugs}
            stream={streamingMessageIds.has(message.id)}
            onStreamComplete={onStreamComplete}
          />
        ))}
        {showThinking ? <HomeThinkingBubble agent={thinkingAgent} /> : null}
      </div>
    </div>
  );
}

function HomeMessage({
  message,
  agentSlugs,
  stream,
  onStreamComplete,
}: {
  message: Message;
  agentSlugs: string[];
  stream: boolean;
  onStreamComplete: (messageId: string) => void;
}) {
  const isHuman = isHumanMessage(message);
  const isSummary = isHomeSummaryMessage(message);
  const handleStreamComplete = useCallback(() => {
    onStreamComplete(message.id);
  }, [message.id, onStreamComplete]);

  return (
    <article
      className={`home-message${isHuman ? " is-human" : ""}${isSummary ? " is-summary" : ""}`}
    >
      <div className="home-message-avatar">
        {isHuman ? (
          "You"
        ) : isSummary ? (
          "Sum"
        ) : (
          <PixelAvatar slug={message.from} size={24} />
        )}
      </div>
      <div className="home-message-body">
        <div className="home-message-meta">
          <span>{isHuman ? "You" : isSummary ? "요약" : message.from}</span>
          <time dateTime={message.timestamp}>
            {formatTime(message.timestamp)}
          </time>
        </div>
        <div className="home-message-bubble">
          {isHuman ? (
            <p className="home-message-text">
              {renderHomeText(message.content || "", agentSlugs)}
            </p>
          ) : stream ? (
            <HomeStreamingMarkdown
              content={message.content || ""}
              onComplete={handleStreamComplete}
            />
          ) : (
            <div
              className="home-message-text"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: formatMarkdown escapes source text before producing trusted markup for agent messages.
              dangerouslySetInnerHTML={{
                __html: formatMarkdown(message.content || ""),
              }}
            />
          )}
        </div>
      </div>
    </article>
  );
}

function HomeStreamingMarkdown({
  content,
  onComplete,
}: {
  content: string;
  onComplete: () => void;
}) {
  const characters = useMemo(() => Array.from(content), [content]);
  const [visibleCount, setVisibleCount] = useState(() =>
    Math.min(HOME_STREAM_INITIAL_CHARS, characters.length),
  );
  const visibleContent = characters.slice(0, visibleCount).join("");

  useEffect(() => {
    const initialCount = Math.min(HOME_STREAM_INITIAL_CHARS, characters.length);
    setVisibleCount(initialCount);
    if (initialCount >= characters.length) {
      onComplete();
      return;
    }

    const step = Math.max(2, Math.ceil(characters.length / 90));
    let finishTimer: ReturnType<typeof setTimeout> | undefined;
    const interval = setInterval(() => {
      setVisibleCount((current) => {
        const next = Math.min(characters.length, current + step);
        if (next >= characters.length) {
          clearInterval(interval);
          finishTimer = setTimeout(onComplete, 120);
        }
        return next;
      });
    }, HOME_STREAM_INTERVAL_MS);

    return () => {
      clearInterval(interval);
      if (finishTimer) clearTimeout(finishTimer);
    };
  }, [characters, onComplete]);

  return (
    <div
      className="home-message-text is-streaming"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: formatMarkdown escapes source text before producing trusted markup for agent messages.
      dangerouslySetInnerHTML={{
        __html: formatMarkdown(visibleContent),
      }}
    />
  );
}

function HomeThinkingBubble({ agent }: { agent: string }) {
  return (
    <article className="home-message is-thinking" aria-live="polite">
      <div className="home-message-avatar">
        <PixelAvatar slug={agent} size={24} />
      </div>
      <div className="home-message-body">
        <div className="home-message-meta">
          <span>{agent}</span>
          <time>생각 중</time>
        </div>
        <div className="home-message-bubble">
          <span className="sr-only">생각 중</span>
          <span className="home-typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        </div>
      </div>
    </article>
  );
}

function HomeComposer({
  agentMembers,
  leadSlug,
  projects,
  skills,
  threadId,
  onAwaitingReply,
}: {
  agentMembers: OfficeMember[];
  leadSlug: string;
  projects: Project[];
  skills: Skill[];
  threadId: string;
  onAwaitingReply: (since: number | null) => void;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [sendError, setSendError] = useState<string | null>(null);
  const [modelMode, setModelMode] = useState<ModelMode>("record_only");
  const [pendingIntent, setPendingIntent] =
    useState<OrchestrationIntent | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const composingRef = useRef(false);
  const sendLockedRef = useRef(false);
  const queryClient = useQueryClient();
  const agentSlugs = useMemo(
    () => agentMembers.map((member) => member.slug),
    [agentMembers],
  );
  const displayTargets = useMemo(
    () =>
      /(^|\s)@all\b/i.test(text)
        ? ["all"]
        : extractTaggedMentions(text, agentSlugs, {
            allSlugs: agentSlugs,
          }),
    [text, agentSlugs],
  );
  const trigger = currentAutocompleteTrigger(text, caret);
  const autocompleteItems = useMemo(
    () =>
      trigger?.type === "mention"
        ? mentionOptions(trigger.query, agentMembers)
        : trigger?.type === "project"
          ? projectOptions(trigger.query, projects)
          : trigger?.type === "skill"
            ? skillOptions(trigger.query, skills)
            : [],
    [trigger, agentMembers, projects, skills],
  );
  const showAutocomplete =
    autocompleteItems.length > 0 || trigger?.type === "skill";

  const sendMutation = useMutation({
    mutationFn: async (messageText: string) => {
      const routed = await routeOrchestrationIntent({
        message: messageText,
        model_mode: modelMode,
      });
      if (routed.intent.requires_confirmation) {
        return { intent: routed.intent, kind: "intent" as const };
      }
      const outbound = buildOutboundMessage(messageText, agentSlugs, leadSlug);
      const sent = await postMessage(
        outbound.content,
        HOME_CHANNEL,
        threadId,
        outbound.tagged,
        {
          model_mode: modelMode,
          scope: "home_orchestration",
          home_session_thread_id: threadId,
        },
      );
      const sentMessage: Message = {
        id: sent.id || `home-local-${Date.now()}`,
        from: "you",
        channel: HOME_CHANNEL,
        content: outbound.content,
        tagged: outbound.tagged,
        reply_to: threadId,
        home_session_thread_id: threadId,
        timestamp: new Date().toISOString(),
        model_mode: modelMode,
        scope: "home_orchestration",
      };
      return {
        kind: "message" as const,
        message: sentMessage,
        waitsForReply: modelMode !== "record_only",
      };
    },
    onSuccess: (result) => {
      if (result.kind === "intent") {
        setPendingIntent(result.intent);
        onAwaitingReply(null);
        setSendError(null);
        return;
      }
      queryClient.setQueryData<{ messages: Message[] }>(
        ["home-messages", HOME_CHANNEL, threadId],
        (old) => ({
          messages: [
            ...((old?.messages ?? []).filter(
              (message) => message.id !== result.message.id,
            ) ?? []),
            result.message,
          ],
        }),
      );
      onAwaitingReply(
        result.waitsForReply ? Date.parse(result.message.timestamp) : null,
      );
      queryClient.invalidateQueries({ queryKey: ["home-sessions"] });
      queryClient.invalidateQueries({
        queryKey: ["home-messages", HOME_CHANNEL, threadId],
      });
      setText("");
      setSendError(null);
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      });
    },
    onError: (err: unknown) => {
      onAwaitingReply(null);
      setSendError(
        err instanceof Error ? err.message : "메시지를 보내지 못했습니다.",
      );
    },
    onSettled: () => {
      sendLockedRef.current = false;
    },
  });

  const confirmMutation = useMutation({
    mutationFn: (intent: OrchestrationIntent) =>
      confirmOrchestrationIntent(intent),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["office-tasks"] });
      queryClient.invalidateQueries({
        queryKey: ["home-messages", HOME_CHANNEL, threadId],
      });
      setPendingIntent(null);
      setText("");
      setSendError(null);
      requestAnimationFrame(() => {
        if (textareaRef.current) textareaRef.current.style.height = "auto";
      });
    },
    onError: (err: unknown) => {
      setSendError(
        err instanceof Error
          ? err.message
          : "Could not apply confirmed action.",
      );
    },
  });

  const pickAutocomplete = useCallback(
    (item: HomeAutocompleteItem) => {
      const next = applyAutocompleteOption(text, caret, item);
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

  const handleSubmit = useCallback(() => {
    const trimmed = text.trim();
    if (
      !(trimmed && threadId) ||
      sendMutation.isPending ||
      confirmMutation.isPending ||
      sendLockedRef.current
    )
      return;
    sendLockedRef.current = true;
    setPendingIntent(null);
    onAwaitingReply(null);
    sendMutation.mutate(trimmed);
  }, [
    confirmMutation.isPending,
    onAwaitingReply,
    text,
    sendMutation,
    threadId,
  ]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isHomeIMEComposing(event, composingRef)) {
      return;
    }

    if (
      handleHomeAutocompleteKey(event, {
        items: autocompleteItems,
        pickAutocomplete,
        selectedIdx,
        setSelectedIdx,
      })
    ) {
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (value: string, selectionStart: number) => {
    setText(value);
    setCaret(selectionStart);
    setSelectedIdx(0);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  };

  return (
    <div className="home-composer-wrap">
      <div className="home-context-chips">
        {displayTargets.slice(0, 4).map((target) => (
          <span className="home-context-chip" key={target}>
            @{target}
          </span>
        ))}
        {displayTargets.length > 4 ? (
          <span className="home-context-chip">
            +{displayTargets.length - 4}
          </span>
        ) : null}
      </div>
      {pendingIntent ? (
        <div className="home-confirmation-card" role="status">
          <div>
            <strong>{t("home.confirmWorkspaceChange")}</strong>
            <span>{pendingIntent.summary}</span>
            {pendingIntent.required_permissions.length > 0 ? (
              <small>
                {t("home.requires").replace(
                  "{permissions}",
                  pendingIntent.required_permissions.join(", "),
                )}
              </small>
            ) : null}
          </div>
          <div className="home-confirmation-actions">
            <button
              type="button"
              disabled={confirmMutation.isPending}
              onClick={() => confirmMutation.mutate(pendingIntent)}
            >
              {t("home.confirm")}
            </button>
            <button
              type="button"
              disabled={confirmMutation.isPending}
              onClick={() => setPendingIntent(null)}
            >
              {t("home.cancel")}
            </button>
          </div>
        </div>
      ) : null}
      <div className="home-composer">
        {showAutocomplete ? (
          <div
            className={`home-autocomplete${trigger?.type === "skill" ? " is-skill" : ""}`}
            role="listbox"
          >
            {autocompleteItems.length > 0 ? (
              autocompleteItems.map((item, idx) => (
                <button
                  type="button"
                  key={item.insert}
                  className={idx === selectedIdx ? "is-selected" : ""}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    pickAutocomplete(item);
                  }}
                >
                  <span>{item.label}</span>
                  {item.desc ? <small>{item.desc}</small> : null}
                </button>
              ))
            ) : (
              <div className="home-autocomplete-empty">
                <span>등록된 활성 스킬이 없습니다</span>
                <small>직접 /스킬이름 을 입력할 수 있습니다.</small>
              </div>
            )}
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          value={text}
          placeholder="무엇이든 물어보세요"
          rows={1}
          onChange={(event) =>
            handleInput(event.target.value, event.target.selectionStart ?? 0)
          }
          onKeyDown={handleKeyDown}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
          }}
          onKeyUp={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
          onClick={(event) => setCaret(event.currentTarget.selectionStart ?? 0)}
        />
        <button
          type="button"
          className="home-send"
          aria-label="보내기"
          title="보내기"
          disabled={
            !(text.trim() && threadId) ||
            sendMutation.isPending ||
            confirmMutation.isPending ||
            sendLockedRef.current
          }
          onClick={handleSubmit}
        >
          <SendDiagonal />
        </button>
      </div>
      <ModelModeToggle value={modelMode} onChange={setModelMode} />
      {sendError ? <p className="home-inline-error">{sendError}</p> : null}
    </div>
  );
}

function HomeSessionToolbar({
  onNewSession,
  onToggleHistory,
  historyOpen,
}: {
  onNewSession: () => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
}) {
  return (
    <div className="home-session-toolbar" aria-label="홈 채팅 세션">
      <button
        type="button"
        className="home-session-new-button"
        onClick={onNewSession}
      >
        <Plus width={16} height={16} />
        <span>새 세션 시작</span>
      </button>
      <button
        type="button"
        className="home-session-icon-button"
        aria-label="대화 기록"
        aria-pressed={historyOpen}
        title="대화 기록"
        onClick={onToggleHistory}
      >
        <Clock width={18} height={18} />
      </button>
    </div>
  );
}

function HomeSessionDrawer({
  activeThreadId,
  baseThreadId,
  open,
  onClose,
  onDeletedActive,
  onLoad,
}: {
  activeThreadId: string | null;
  baseThreadId: string | null;
  open: boolean;
  onClose: () => void;
  onDeletedActive: () => void;
  onLoad: (threadId: string) => void;
}) {
  const queryClient = useQueryClient();
  const sessionsQuery = useQuery({
    queryKey: ["home-sessions", baseThreadId],
    queryFn: () => getHomeSessions(baseThreadId ?? ""),
    enabled: open && Boolean(baseThreadId),
    staleTime: 10_000,
  });
  const deleteMutation = useMutation({
    mutationFn: (threadId: string) => deleteHomeSession(threadId),
    onSuccess: (_result, threadId) => {
      queryClient.invalidateQueries({ queryKey: ["home-sessions"] });
      queryClient.removeQueries({
        queryKey: ["home-messages", HOME_CHANNEL, threadId],
      });
      if (threadId === activeThreadId) onDeletedActive();
    },
  });
  const sessions = sessionsQuery.data?.sessions ?? [];

  if (!open) return null;

  return (
    <aside className="home-session-drawer" aria-label="홈 채팅 기록">
      <div className="home-session-drawer-header">
        <div>
          <strong>최근 대화</strong>
          <span>최근 30일 기록만 보관됩니다.</span>
        </div>
        <button
          type="button"
          aria-label="대화 기록 닫기"
          className="home-session-close"
          onClick={onClose}
        >
          <Xmark width={18} height={18} />
        </button>
      </div>
      <div className="home-session-list">
        {sessionsQuery.isLoading ? (
          <div className="home-session-empty">대화 기록을 불러오는 중</div>
        ) : sessions.length === 0 ? (
          <div className="home-session-empty">
            <strong>저장된 대화가 없습니다</strong>
            <span>메시지를 보내면 이곳에 자동으로 저장됩니다.</span>
          </div>
        ) : (
          sessions.map((session) => (
            <HomeSessionRow
              key={session.thread_id}
              active={session.thread_id === activeThreadId}
              deleting={deleteMutation.isPending}
              session={session}
              onDelete={() => {
                const ok =
                  typeof window === "undefined" ||
                  window.confirm("이 대화 기록을 삭제할까요?");
                if (!ok) return;
                deleteMutation.mutate(session.thread_id);
              }}
              onLoad={() => onLoad(session.thread_id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}

function HomeSessionRow({
  active,
  deleting,
  onDelete,
  onLoad,
  session,
}: {
  active: boolean;
  deleting: boolean;
  onDelete: () => void;
  onLoad: () => void;
  session: HomeChatSession;
}) {
  return (
    <div className={`home-session-row${active ? " is-active" : ""}`}>
      <button
        type="button"
        className="home-session-load"
        disabled={active}
        onClick={onLoad}
      >
        <span className="home-session-title-row">
          <span className="home-session-title">
            {session.title || "제목 없는 대화"}
          </span>
          {active ? <span className="home-session-current">현재</span> : null}
        </span>
        <span className="home-session-meta">
          {formatSessionDate(session.updated_at)}
        </span>
      </button>
      <button
        type="button"
        className="home-session-delete"
        aria-label={`대화 삭제: ${session.title || "새 대화"}`}
        disabled={deleting}
        onClick={onDelete}
      >
        <Trash width={16} height={16} />
      </button>
    </div>
  );
}

export function HomeApp() {
  const queryClient = useQueryClient();
  const [awaitingReplySince, setAwaitingReplySince] = useState<number | null>(
    null,
  );
  const [streamingMessageIds, setStreamingMessageIds] = useState<Set<string>>(
    () => new Set(),
  );
  const { data: authSession, isLoading: authLoading } = useQuery({
    queryKey: ["auth-session"],
    queryFn: getAuthSession,
    staleTime: 60_000,
  });
  const homeBaseThreadId = useMemo(
    () => createHomeChatBaseThreadId(authSession),
    [authSession],
  );
  const [homeThreadId, setHomeThreadId] = useState<string | null>(null);
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ["home-messages", HOME_CHANNEL, homeThreadId],
    queryFn: () => getThreadMessages(HOME_CHANNEL, homeThreadId ?? ""),
    enabled: !!homeThreadId,
    refetchInterval: HOME_MESSAGE_REFETCH_MS,
    select: (data) =>
      (data.messages ?? []).filter((message) => !isInternalMessage(message)),
  });
  const { data: config } = useQuery({
    queryKey: ["config"],
    queryFn: getConfig,
    staleTime: 60_000,
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => getProjects(),
    staleTime: 30_000,
  });
  const { data: skillsData } = useQuery({
    queryKey: ["skills"],
    queryFn: () => getSkills(),
    staleTime: 30_000,
  });
  const { data: members = [] } = useOfficeMembers();
  const agentMembers = useMemo(() => agentMembersOnly(members), [members]);
  const agentSlugs = useMemo(
    () => agentMembers.map((member) => member.slug),
    [agentMembers],
  );
  const leadSlug = useMemo(
    () => resolveLeadSlug(config?.team_lead_slug, agentMembers),
    [config?.team_lead_slug, agentMembers],
  );
  const visibleMessages = useMemo(
    () => (messagesData ?? []).filter((message) => !isInternalMessage(message)),
    [messagesData],
  );
  const hasMessages = visibleMessages.length > 0;
  const homeMessagesLoading = authLoading || messagesLoading;
  const startNewSession = useCallback(() => {
    if (!homeBaseThreadId) return;
    const next = createHomeSessionThreadId(homeBaseThreadId);
    rememberHomeSessionThread(homeBaseThreadId, next);
    setHomeThreadId(next);
    setAwaitingReplySince(null);
    setStreamingMessageIds(new Set());
    queryClient.setQueryData<{ messages: Message[] }>(
      ["home-messages", HOME_CHANNEL, next],
      { messages: [] },
    );
  }, [homeBaseThreadId, queryClient]);
  const loadSession = useCallback(
    (threadId: string) => {
      if (!homeBaseThreadId) return;
      rememberHomeSessionThread(homeBaseThreadId, threadId);
      setHomeThreadId(threadId);
      setAwaitingReplySince(null);
      setStreamingMessageIds(new Set());
      setSessionDrawerOpen(false);
    },
    [homeBaseThreadId],
  );
  const markMessageForStreaming = useCallback((message: Message) => {
    if (!shouldStreamHomeMessage(message)) return;
    setStreamingMessageIds((current) => {
      if (current.has(message.id)) return current;
      const next = new Set(current);
      next.add(message.id);
      return next;
    });
  }, []);
  const handleStreamComplete = useCallback((messageId: string) => {
    setStreamingMessageIds((current) => {
      if (!current.has(messageId)) return current;
      const next = new Set(current);
      next.delete(messageId);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!homeBaseThreadId) {
      setHomeThreadId(null);
      return;
    }
    setHomeThreadId(currentHomeSessionThreadId(homeBaseThreadId));
  }, [homeBaseThreadId]);

  useEffect(() => {
    if (!homeThreadId) return;
    const unsubscribe = subscribeBrokerEvent("message", (event) => {
      const message = parseBrokerMessageEvent(event);
      if (!message) {
        return;
      }
      const cached = queryClient.getQueryData<{ messages: Message[] }>([
        "home-messages",
        HOME_CHANNEL,
        homeThreadId,
      ]);
      const cachedMessages = (cached?.messages ?? []).filter(
        (item) => !isInternalMessage(item),
      );
      if (
        !shouldAttachIncomingHomeMessage({
          agentSlugs,
          awaitingReplySince,
          homeThreadId,
          message,
          messages: cachedMessages,
        })
      ) {
        return;
      }
      queryClient.setQueryData<{ messages: Message[] }>(
        ["home-messages", HOME_CHANNEL, homeThreadId],
        (old) => ({
          messages: mergeIncomingHomeMessage(
            (old?.messages ?? []).filter((item) => !isInternalMessage(item)),
            message,
          ),
        }),
      );
      markMessageForStreaming(message);
      if (isAgentReplyAfter(message, awaitingReplySince)) {
        setAwaitingReplySince(null);
      }
    });
    return unsubscribe;
  }, [
    agentSlugs,
    awaitingReplySince,
    homeThreadId,
    markMessageForStreaming,
    queryClient,
  ]);

  useEffect(() => {
    if (!awaitingReplySince) return;
    const replies = visibleMessages.filter((message) => {
      if (message.from === "you" || message.from === "human") return false;
      if (message.kind === "home_summary") return false;
      if (isInternalMessage(message)) return false;
      const timestamp = Date.parse(message.timestamp || "");
      return (
        Number.isFinite(timestamp) && timestamp >= awaitingReplySince - 1000
      );
    });
    if (replies.length > 0) {
      for (const message of replies) markMessageForStreaming(message);
      setAwaitingReplySince(null);
    }
  }, [awaitingReplySince, markMessageForStreaming, visibleMessages]);

  return (
    <div className={`home-app${hasMessages ? "" : " is-empty"}`}>
      <HomeSessionToolbar
        historyOpen={sessionDrawerOpen}
        onNewSession={startNewSession}
        onToggleHistory={() => setSessionDrawerOpen((open) => !open)}
      />
      <HomeSessionDrawer
        activeThreadId={homeThreadId}
        baseThreadId={homeBaseThreadId}
        open={sessionDrawerOpen}
        onClose={() => setSessionDrawerOpen(false)}
        onDeletedActive={startNewSession}
        onLoad={loadSession}
      />
      <HomeMessageList
        messages={visibleMessages}
        isLoading={homeMessagesLoading}
        agentSlugs={agentSlugs}
        showThinking={Boolean(awaitingReplySince)}
        thinkingAgent={leadSlug}
        streamingMessageIds={streamingMessageIds}
        onStreamComplete={handleStreamComplete}
      />
      <HomeComposer
        agentMembers={agentMembers}
        leadSlug={leadSlug}
        projects={projectsData?.projects ?? []}
        skills={skillsData?.skills ?? []}
        threadId={homeThreadId ?? ""}
        onAwaitingReply={setAwaitingReplySince}
      />
    </div>
  );
}

export const __test__ = {
  buildOutboundMessage,
  createHomeChatBaseThreadId,
  createHomeSessionThreadId,
  homeSessionRuntimeStore,
  projectOptions,
  resetHomeSessionMemory,
  sortProjectsByRecent,
  visibleTargets,
};
