import { type ReactNode, useMemo } from "react";

import type { Message } from "../../api/client";
import { toggleReaction } from "../../api/client";
import { useDefaultHarness } from "../../hooks/useConfig";
import { useOfficeMembers } from "../../hooks/useMembers";
import { formatTime, formatTokens } from "../../lib/format";
import { resolveHarness } from "../../lib/harness";
import { formatMarkdown } from "../../lib/markdown";
import { renderMentions } from "../../lib/mentions";
import { useAppStore } from "../../stores/app";
import { HarnessBadge } from "../ui/HarnessBadge";
import { PixelAvatar } from "../ui/PixelAvatar";
import { showNotice } from "../ui/Toast";

interface MessageBubbleProps {
  message: Message;
  grouped?: boolean;
  /** Direct reply to a top-level channel message — renders indented under the parent. */
  isReply?: boolean;
  /** Count of direct replies to this message. Shows an "N replies" affordance. */
  replyCount?: number;
  /** Open the thread panel for this message. Shown as a hover action when provided. */
  onOpenThread?: (id: string) => void;
  /** Reply-to-this-reply inside the thread panel. Shown as a hover action when provided. */
  onQuoteReply?: (message: Message) => void;
  /** Copy a permalink to this message. Shown as a hover action when provided. */
  onCopyLink?: (id: string) => void;
}

interface MessageReaction {
  emoji: string;
  count?: number;
}

function messageUsageTotal(message: Message): number {
  if (!message.usage) return 0;
  return (
    message.usage.total_tokens ??
    (message.usage.input_tokens ?? 0) +
      (message.usage.output_tokens ?? 0) +
      (message.usage.cache_read_tokens ?? 0) +
      (message.usage.cache_creation_tokens ?? 0)
  );
}

function messageReactions(message: Message): MessageReaction[] {
  if (!message.reactions) return [];
  if (Array.isArray(message.reactions)) {
    return message.reactions as MessageReaction[];
  }
  return Object.entries(message.reactions).map(([emoji, users]) => ({
    emoji,
    count: Array.isArray(users) ? users.length : 1,
  }));
}

export function MessageBubble({
  message,
  grouped = false,
  isReply = false,
  replyCount = 0,
  onOpenThread,
  onQuoteReply,
  onCopyLink,
}: MessageBubbleProps) {
  const currentChannel = useAppStore((s) => s.currentChannel);
  const { data: members = [] } = useOfficeMembers();
  const isHuman = message.from === "you" || message.from === "human";
  const agent = members.find((m) => m.slug === message.from);
  const defaultHarness = useDefaultHarness();
  const harness = !isHuman
    ? resolveHarness(agent?.provider, defaultHarness)
    : null;
  // Turn human text like "@pm when are you free?" into mention chips for
  // registered agent slugs. Non-agent @-references stay plain text. The
  // memo keys on content + the slug list so rapid renders don't re-parse.
  const knownSlugs = useMemo(() => members.map((m) => m.slug), [members]);
  const humanRendered = useMemo(
    () => (isHuman ? renderMentions(message.content || "", knownSlugs) : null),
    [isHuman, message.content, knownSlugs],
  );
  const hasHoverActions = Boolean(onOpenThread || onQuoteReply || onCopyLink);

  // Status messages — compact
  if (message.content?.startsWith("[STATUS]")) {
    const statusText = message.content.replace(/^\[STATUS\]\s*/, "");
    return <div className="message-status animate-fade">{statusText}</div>;
  }

  const usageTotal = messageUsageTotal(message);
  const reactions = messageReactions(message);

  // SECURITY: formatMarkdown escapes all HTML via escapeHtml() before rendering.
  // Only trusted broker messages use this path — human input renders via the
  // safe renderMentions path below (builds ReactNode children, no innerHTML).
  const renderedHtml = !isHuman ? formatMarkdown(message.content || "") : "";

  return (
    <div
      className={`message animate-fade${grouped ? " message-grouped" : ""}${isReply ? " message-reply" : ""}`}
      data-msg-id={message.id}
    >
      {/* Avatar */}
      <MessageAvatar isHuman={isHuman} from={message.from} harness={harness} />

      {/* Content */}
      <div className="message-content">
        <MessageHeader
          isHuman={isHuman}
          authorName={agent?.name || message.from}
          role={agent?.role}
          timestamp={message.timestamp}
          usageTotal={usageTotal}
        />

        {/* Text — humans render mention chips via safe ReactNode children;
            agent messages use the formatMarkdown path. */}
        <MessageText
          isHuman={isHuman}
          humanRendered={humanRendered}
          renderedHtml={renderedHtml}
        />

        {/* Reactions */}
        <MessageReactions
          reactions={reactions}
          messageId={message.id}
          currentChannel={currentChannel}
        />

        {/* Thread summary — shown under a parent that has replies. Clicking
            opens the thread panel where the full chain is browsable. */}
        <ThreadSummary
          replyCount={replyCount}
          messageId={message.id}
          onOpenThread={onOpenThread}
        />
      </div>

      {/* Hover actions — reply in thread, quote, copy link. Absolutely
          positioned so they don't change the bubble's flow layout. */}
      <MessageHoverActions
        visible={hasHoverActions}
        message={message}
        onOpenThread={onOpenThread}
        onQuoteReply={onQuoteReply}
        onCopyLink={onCopyLink}
      />
    </div>
  );
}

interface MessageAvatarProps {
  isHuman: boolean;
  from: string;
  harness: ReturnType<typeof resolveHarness> | null;
}

function MessageAvatar({ isHuman, from, harness }: MessageAvatarProps) {
  return (
    <div
      className={`message-avatar${isHuman ? "" : " avatar-with-harness"}`}
      style={
        isHuman
          ? {
              background: "var(--bg-warm)",
              color: "var(--text-secondary)",
              fontSize: 12,
              fontWeight: 600,
            }
          : undefined
      }
    >
      {isHuman ? (
        "You"
      ) : (
        <>
          <PixelAvatar slug={from} size={24} />
          {harness ? (
            <HarnessBadge
              kind={harness}
              size={14}
              className="harness-badge-on-avatar"
            />
          ) : null}
        </>
      )}
    </div>
  );
}

interface MessageHeaderProps {
  isHuman: boolean;
  authorName: string;
  role?: string;
  timestamp: string;
  usageTotal: number;
}

function MessageHeader({
  isHuman,
  authorName,
  role,
  timestamp,
  usageTotal,
}: MessageHeaderProps) {
  const displayName = isHuman ? "You" : authorName;

  return (
    <div className="message-header">
      <span className="message-author">{displayName}</span>
      {isHuman ? (
        <span className="badge badge-neutral">human</span>
      ) : role ? (
        <span className="badge badge-green">{role}</span>
      ) : null}
      <span className="message-time" title={timestamp}>
        {formatTime(timestamp)}
      </span>
      {usageTotal > 0 ? (
        <span className="message-token-badge">
          {formatTokens(usageTotal)} tok
        </span>
      ) : null}
    </div>
  );
}

interface MessageTextProps {
  isHuman: boolean;
  humanRendered: ReactNode;
  renderedHtml: string;
}

function MessageText({
  isHuman,
  humanRendered,
  renderedHtml,
}: MessageTextProps) {
  if (isHuman) return <div className="message-text">{humanRendered}</div>;

  return (
    <div
      className="message-text"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: renderedHtml comes from formatMarkdown() in src/lib/markdown.ts which escapes all user content via escapeHtml() before building the output. Only trusted broker/agent messages reach this branch — humans go through the React ReactNode path above.
      dangerouslySetInnerHTML={{ __html: renderedHtml }}
    />
  );
}

interface MessageReactionsProps {
  reactions: MessageReaction[];
  messageId: string;
  currentChannel: string;
}

function MessageReactions({
  reactions,
  messageId,
  currentChannel,
}: MessageReactionsProps) {
  if (reactions.length === 0) return null;

  return (
    <div className="message-reactions">
      {reactions.map((reaction) => (
        <button
          type="button"
          key={reaction.emoji}
          className="reaction-pill"
          onClick={() => {
            toggleReaction(messageId, reaction.emoji, currentChannel).catch(
              (e: Error) =>
                showNotice(`Reaction failed: ${e.message}`, "error"),
            );
          }}
        >
          <span>{reaction.emoji}</span>
          <span className="reaction-pill-count">{reaction.count ?? 1}</span>
        </button>
      ))}
    </div>
  );
}

interface ThreadSummaryProps {
  replyCount: number;
  messageId: string;
  onOpenThread?: (id: string) => void;
}

function ThreadSummary({
  replyCount,
  messageId,
  onOpenThread,
}: ThreadSummaryProps) {
  if (!(replyCount > 0 && onOpenThread)) return null;

  return (
    <button
      type="button"
      className="inline-thread-toggle"
      onClick={() => onOpenThread(messageId)}
      title="Open thread"
    >
      <svg
        aria-hidden="true"
        focusable="false"
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {replyCount} {replyCount === 1 ? "reply" : "replies"}
    </button>
  );
}

interface MessageHoverActionsProps {
  visible: boolean;
  message: Message;
  onOpenThread?: (id: string) => void;
  onQuoteReply?: (message: Message) => void;
  onCopyLink?: (id: string) => void;
}

function MessageHoverActions({
  visible,
  message,
  onOpenThread,
  onQuoteReply,
  onCopyLink,
}: MessageHoverActionsProps) {
  if (!visible) return null;

  return (
    <div
      className="message-hover-actions"
      role="toolbar"
      aria-label="Message actions"
    >
      {onOpenThread ? (
        <button
          type="button"
          className="message-hover-btn"
          onClick={() => onOpenThread(message.id)}
          title="Reply in thread"
          aria-label="Reply in thread"
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      ) : null}
      {onQuoteReply ? (
        <button
          type="button"
          className="message-hover-btn"
          onClick={() => onQuoteReply(message)}
          title="Quote-reply"
          aria-label="Quote-reply"
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 21v-5a5 5 0 0 1 5-5h13" />
            <path d="m16 16-5-5 5-5" />
          </svg>
        </button>
      ) : null}
      {onCopyLink ? (
        <button
          type="button"
          className="message-hover-btn"
          onClick={() => onCopyLink(message.id)}
          title="Copy link"
          aria-label="Copy link"
        >
          <svg
            aria-hidden="true"
            focusable="false"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.71" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
