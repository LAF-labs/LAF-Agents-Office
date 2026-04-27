import { useEffect, useRef } from "react";

import type { Message } from "../../api/client";
import { useMessages } from "../../hooks/useMessages";
import { formatDateLabel } from "../../lib/format";
import { useAppStore } from "../../stores/app";
import { MessageBubble } from "./MessageBubble";

function dateDayKey(ts: string): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

type ThreadMessage = {
  message: Message;
  grouped: boolean;
};

type FeedElement =
  | { type: "date"; key: string; label: string }
  | {
      type: "thread";
      key: string;
      parent: ThreadMessage;
      replies: ThreadMessage[];
    };

function buildFeedElements(messages: Message[]): FeedElement[] {
  const elements: FeedElement[] = [];
  const byId = new Map<string, Message>();
  for (const message of messages) byId.set(message.id, message);

  const repliesByParent = collectThreadReplies(messages, byId);
  let lastDate = "";
  let lastFrom = "";
  let lastTime = "";

  const wrap = (message: Message): ThreadMessage => {
    const grouped = isGroupedWithPrevious(message, lastFrom, lastTime);
    lastFrom = message.from;
    lastTime = message.timestamp || lastTime;
    return { message, grouped };
  };
  const emitDateSeparator = (message: Message) => {
    if (!message.timestamp) return;
    const dayKey = dateDayKey(message.timestamp);
    if (dayKey === lastDate) return;
    elements.push({
      type: "date",
      key: `date-${dayKey}`,
      label: formatDateLabel(message.timestamp),
    });
    lastDate = dayKey;
    lastFrom = "";
    lastTime = "";
  };

  for (const message of messages) {
    if (isStatusOrReply(message)) continue;
    emitDateSeparator(message);
    const replies = buildReplyElements(
      repliesByParent.get(message.id) ?? [],
      emitDateSeparator,
      wrap,
    );
    elements.push({
      type: "thread",
      key: `thread-${message.id}`,
      parent: wrap(message),
      replies,
    });
  }
  return elements;
}

function collectThreadReplies(
  messages: Message[],
  byId: Map<string, Message>,
): Map<string, Message[]> {
  const repliesByParent = new Map<string, Message[]>();
  for (const message of messages) {
    if (message.content?.startsWith("[STATUS]")) continue;
    if (!message.reply_to) continue;
    const parent = byId.get(message.reply_to);
    if (!(parent && !parent.reply_to)) continue;
    const list = repliesByParent.get(parent.id) ?? [];
    list.push(message);
    repliesByParent.set(parent.id, list);
  }
  return repliesByParent;
}

function isStatusOrReply(message: Message): boolean {
  return Boolean(message.content?.startsWith("[STATUS]") || message.reply_to);
}

function isGroupedWithPrevious(
  message: Message,
  lastFrom: string,
  lastTime: string,
): boolean {
  if (!(lastFrom === message.from && message.timestamp && lastTime))
    return false;
  const delta =
    new Date(message.timestamp).getTime() - new Date(lastTime).getTime();
  return delta >= 0 && delta < 5 * 60 * 1000;
}

function buildReplyElements(
  replies: Message[],
  emitDateSeparator: (message: Message) => void,
  wrap: (message: Message) => ThreadMessage,
): ThreadMessage[] {
  return replies.map((reply) => {
    emitDateSeparator(reply);
    return wrap(reply);
  });
}

export function MessageFeed() {
  const currentChannel = useAppStore((s) => s.currentChannel);
  const setActiveThreadId = useAppStore((s) => s.setActiveThreadId);
  const collapsedThreads = useAppStore((s) => s.collapsedThreads);
  const toggleThreadCollapsed = useAppStore((s) => s.toggleThreadCollapsed);
  const containerRef = useRef<HTMLDivElement>(null);
  const prevLengthRef = useRef(0);

  const copyMessageLink = (id: string) => {
    const url = new URL(window.location.href);
    url.hash = `#msg-${id}`;
    navigator.clipboard?.writeText(url.toString()).catch(() => {});
  };

  const { data: messages = [], isLoading } = useMessages(currentChannel);

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (messages.length > prevLengthRef.current && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
    prevLengthRef.current = messages.length;
  }, [messages.length]);

  if (isLoading && messages.length === 0) {
    return (
      <div
        className="messages"
        style={{ alignItems: "center", justifyContent: "center" }}
      >
        <span style={{ color: "var(--text-tertiary)", fontSize: 13 }}>
          Loading messages...
        </span>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className="messages">
        <div className="channel-empty-state">
          <span className="eyebrow">quiet before the standup</span>
          <span className="title">#{currentChannel} is empty. For now.</span>
          <span className="body">
            This is where your agents will argue, claim tasks, and show progress
            on planning, implementation, and review.
          </span>
          <div className="channel-empty-hints">
            <div>
              Try <code>@ceo what should we build this week?</code>
            </div>
            <div>
              Type <code>/</code> for commands, <code>@</code> to mention an
              agent.
            </div>
          </div>
          <span className="channel-empty-foot">
            Connect GitHub when the team is ready to build.
          </span>
        </div>
      </div>
    );
  }

  const elements = buildFeedElements(messages);

  return (
    <div className="messages" ref={containerRef}>
      {elements.map((element) => (
        <FeedElementView
          element={element}
          key={element.key}
          collapsedThreads={collapsedThreads}
          toggleThreadCollapsed={toggleThreadCollapsed}
          setActiveThreadId={setActiveThreadId}
          copyMessageLink={copyMessageLink}
        />
      ))}
    </div>
  );
}

interface FeedElementViewProps {
  element: FeedElement;
  collapsedThreads: Record<string, boolean>;
  toggleThreadCollapsed: (id: string) => void;
  setActiveThreadId: (id: string | null) => void;
  copyMessageLink: (id: string) => void;
}

function FeedElementView({
  element,
  collapsedThreads,
  toggleThreadCollapsed,
  setActiveThreadId,
  copyMessageLink,
}: FeedElementViewProps) {
  if (element.type === "date") return <DateSeparator label={element.label} />;
  return (
    <ThreadElement
      element={element}
      collapsedThreads={collapsedThreads}
      toggleThreadCollapsed={toggleThreadCollapsed}
      setActiveThreadId={setActiveThreadId}
      copyMessageLink={copyMessageLink}
    />
  );
}

function DateSeparator({ label }: { label: string }) {
  return (
    <div className="date-separator">
      <div className="date-separator-line" />
      <span className="date-separator-text">{label}</span>
      <div className="date-separator-line" />
    </div>
  );
}

function ThreadElement({
  element,
  collapsedThreads,
  toggleThreadCollapsed,
  setActiveThreadId,
  copyMessageLink,
}: Omit<FeedElementViewProps, "element"> & {
  element: Extract<FeedElement, { type: "thread" }>;
}) {
  const hasReplies = element.replies.length > 0;
  const parentId = element.parent.message.id;
  const isCollapsed = hasReplies && (collapsedThreads[parentId] ?? false);
  return (
    <div
      className={`thread-group${hasReplies ? " thread-group-has-replies" : ""}${isCollapsed ? " thread-group-collapsed" : ""}`}
    >
      <MessageBubble
        message={element.parent.message}
        grouped={element.parent.grouped}
        replyCount={element.replies.length}
        onOpenThread={(id) => setActiveThreadId(id)}
        onCopyLink={copyMessageLink}
      />
      {hasReplies ? (
        <ThreadCollapseToggle
          parentId={parentId}
          replyCount={element.replies.length}
          isCollapsed={isCollapsed}
          onToggle={toggleThreadCollapsed}
        />
      ) : null}
      {hasReplies && !isCollapsed ? (
        <div className="thread-replies" id={`thread-${parentId}-replies`}>
          {element.replies.map((reply) => (
            <MessageBubble
              key={reply.message.id}
              message={reply.message}
              grouped={reply.grouped}
              isReply={true}
              onOpenThread={(id) => setActiveThreadId(id)}
              onCopyLink={copyMessageLink}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ThreadCollapseToggle({
  parentId,
  replyCount,
  isCollapsed,
  onToggle,
}: {
  parentId: string;
  replyCount: number;
  isCollapsed: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="thread-collapse-toggle"
      onClick={() => onToggle(parentId)}
      aria-expanded={!isCollapsed}
      aria-controls={`thread-${parentId}-replies`}
    >
      <svg
        className="thread-collapse-chevron"
        aria-hidden="true"
        focusable="false"
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={isCollapsed ? "m9 18 6-6-6-6" : "m6 9 6 6 6-6"} />
      </svg>
      {isCollapsed
        ? `Show ${replyCount} ${replyCount === 1 ? "reply" : "replies"}`
        : "Hide thread"}
    </button>
  );
}
