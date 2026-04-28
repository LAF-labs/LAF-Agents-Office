import { type ReactNode, useMemo, useState } from "react";

import type { StreamLine } from "../../hooks/useAgentStream";

interface StreamLineViewProps {
  line: StreamLine;
  /** Compact mode collapses arrays and objects beyond the first level. */
  compact?: boolean;
}

/**
 * Renders one SSE line from the agent stream. Understands the broker's
 * OpenAI-Responses-style events — agent messages render as dim thinking
 * lines, tool calls render as collapsible cards, token totals render as
 * a single line. Everything else falls back to pretty-printed JSON.
 */
export function StreamLineView({ line, compact = false }: StreamLineViewProps) {
  if (!line.parsed) {
    return <RawStreamLine data={line.data} />;
  }

  const { parsed } = line;
  const evtType = typeof parsed.type === "string" ? parsed.type : "";
  const knownEvent = renderKnownStreamEvent(evtType, parsed, compact);
  if (knownEvent !== undefined) return knownEvent;

  // Fallback: structured event with type/phase/agent + detail + extras
  return <GenericEventCard parsed={parsed} compact={compact} />;
}

function RawStreamLine({ data }: { data: string }) {
  const text = data.length > 400 ? `${data.slice(0, 400)}\u2026` : data;
  return <div className="stream-line stream-line-raw">{text}</div>;
}

function renderKnownStreamEvent(
  evtType: string,
  parsed: Record<string, unknown>,
  compact: boolean,
): ReactNode | undefined {
  if (isNoiseEvent(evtType)) return null;
  if (evtType === "turn.completed" || evtType === "response.completed") {
    return renderTokenLine(parsed);
  }
  if (evtType === "mcp_tool_event") {
    return <ToolCallCard item={mcpToolItem(parsed)} compact={compact} />;
  }
  if (evtType === "assistant") {
    return <ClaudeAssistantEvent parsed={parsed} compact={compact} />;
  }
  if (evtType === "user") {
    return <ClaudeUserEvent parsed={parsed} compact={compact} />;
  }
  if (evtType === "result") {
    return renderThinkingText(parsed.result);
  }
  if (evtType === "response.output_text.delta") {
    return renderThinkingText(parsed.delta ?? parsed.text);
  }
  if (evtType === "item.completed") {
    return renderCompletedItem(parsed, compact);
  }
  return undefined;
}

function isNoiseEvent(evtType: string): boolean {
  return (
    evtType === "thread.started" ||
    evtType === "turn.started" ||
    evtType === "item.started"
  );
}

function renderTokenLine(parsed: Record<string, unknown>): ReactNode {
  const tokens = renderTokens(parsed);
  return tokens ? <div className="cc-token-line">{tokens}</div> : null;
}

function mcpToolItem(parsed: Record<string, unknown>): Record<string, unknown> {
  const phase = stringish(parsed.phase);
  const tool = stringish(parsed.tool) || "tool";
  return {
    type: "tool_call",
    name: phase ? `${phase}: ${tool}` : tool,
    arguments: parsed.arguments ?? parsed.args,
    result: parsed.result,
    error: parsed.error,
  };
}

function renderThinkingText(value: unknown): ReactNode {
  const text = stringish(value).trim();
  return text ? <div className="cc-thinking">{text}</div> : undefined;
}

function renderCompletedItem(
  parsed: Record<string, unknown>,
  compact: boolean,
): ReactNode | undefined {
  if (!(parsed.item && typeof parsed.item === "object")) return undefined;

  const item = parsed.item as Record<string, unknown>;
  const itemType = typeof item.type === "string" ? item.type : "";
  if (isMessageItem(itemType)) return renderMessageItem(item);
  if (isToolCallItem(itemType))
    return <ToolCallCard item={item} compact={compact} />;
  return null;
}

function isMessageItem(itemType: string): boolean {
  return (
    itemType === "agent_message" ||
    itemType === "message" ||
    itemType === "assistant"
  );
}

function isToolCallItem(itemType: string): boolean {
  return (
    itemType === "mcp_tool_call" ||
    itemType === "tool_call" ||
    itemType === "function_call"
  );
}

function renderMessageItem(item: Record<string, unknown>): ReactNode {
  const text = codexItemText(item);
  if (!text) return null;
  const truncated = text.length > 500 ? `${text.slice(0, 500)}\u2026` : text;
  return <div className="cc-thinking">{truncated}</div>;
}

function ClaudeAssistantEvent({
  parsed,
  compact,
}: {
  parsed: Record<string, unknown>;
  compact: boolean;
}) {
  const blocks = messageContentBlocks(parsed);
  const rendered = keyedByOccurrence(blocks, (block) =>
    stableValueKey("block", block),
  )
    .map(({ item: block, key }) => renderAssistantBlock(block, key, compact))
    .filter(Boolean);

  if (rendered.length === 0) return null;
  if (rendered.length === 1) return <>{rendered[0]}</>;
  return <div className="stream-event-stack">{rendered}</div>;
}

function renderAssistantBlock(
  block: Record<string, unknown>,
  key: string,
  compact: boolean,
): ReactNode {
  const blockType = stringish(block.type);
  if (blockType === "text") {
    return renderKeyedText(key, "cc-thinking", block.text);
  }
  if (blockType === "thinking") {
    return renderKeyedText(key, "stream-card-detail", block.thinking);
  }
  if (blockType === "tool_use") {
    return (
      <ToolCallCard
        key={key}
        item={{
          type: "tool_call",
          name: block.name,
          arguments: block.input,
        }}
        compact={compact}
      />
    );
  }
  return null;
}

function renderKeyedText(
  key: string,
  className: string,
  value: unknown,
): ReactNode {
  const text = stringish(value).trim();
  return text ? (
    <div key={key} className={className}>
      {text}
    </div>
  ) : null;
}

function ClaudeUserEvent({
  parsed,
  compact,
}: {
  parsed: Record<string, unknown>;
  compact: boolean;
}) {
  const blocks = messageContentBlocks(parsed);
  const rendered = keyedByOccurrence(blocks, (block) =>
    stableValueKey("tool-result", block),
  )
    .map(({ item: block, key }) => {
      if (stringish(block.type) !== "tool_result") return null;
      const { content } = block;
      return (
        <div key={key} className="cc-tool-call">
          <div className="cc-tool-section-label">Tool result</div>
          <ToolResultContent
            text={stringFromToolContent(content)}
            compact={compact}
          />
        </div>
      );
    })
    .filter(Boolean);

  const toolUseResult = parsed.tool_use_result;
  if (toolUseResult && typeof toolUseResult === "object") {
    const result = toolUseResult as Record<string, unknown>;
    const text = [stringish(result.stdout), stringish(result.stderr)]
      .filter(Boolean)
      .join("\n");
    if (text) {
      rendered.push(
        <div key="tool-use-result" className="cc-tool-call">
          <div className="cc-tool-section-label">Tool result</div>
          <ToolResultContent text={text} compact={compact} />
        </div>,
      );
    }
  }

  if (rendered.length === 0) return null;
  if (rendered.length === 1) return <>{rendered[0]}</>;
  return <div className="stream-event-stack">{rendered}</div>;
}

function keyedByOccurrence<T>(
  items: readonly T[],
  getBaseKey: (item: T) => string,
): Array<{ item: T; key: string }> {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const baseKey = getBaseKey(item) || "item";
    const occurrence = (seen.get(baseKey) ?? 0) + 1;
    seen.set(baseKey, occurrence);
    return {
      item,
      key: occurrence === 1 ? baseKey : `${baseKey}-${occurrence}`,
    };
  });
}

function stableValueKey(prefix: string, value: unknown): string {
  const raw =
    typeof value === "string" ? value : safeStringify(value) || String(value);
  let hash = 2166136261;
  for (const char of raw) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return "";
  }
}

function messageContentBlocks(
  parsed: Record<string, unknown>,
): Record<string, unknown>[] {
  const { message } = parsed;
  if (!message || typeof message !== "object") return [];
  const { content } = message as Record<string, unknown>;
  if (!Array.isArray(content)) return [];
  return content.filter(
    (block): block is Record<string, unknown> =>
      !!block && typeof block === "object",
  );
}

function codexItemText(item: Record<string, unknown>): string {
  const direct = stringish(item.text).trim();
  if (direct) return direct;
  const { content } = item;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const p = part as Record<string, unknown>;
      const typ = stringish(p.type);
      if (typ && typ !== "output_text" && typ !== "text") return "";
      return stringish(p.text).trim();
    })
    .filter(Boolean)
    .join("\n");
}

function stringFromToolContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          const obj = item as Record<string, unknown>;
          return stringish(obj.text ?? obj.content);
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object") {
    return JSON.stringify(content);
  }
  return "";
}

function renderTokens(parsed: Record<string, unknown>): string | null {
  const u = extractUsage(parsed);
  if (!u) return null;
  const inTok = toNum(u.input_tokens);
  const outTok = toNum(u.output_tokens);
  const cacheRead = toNum(
    u.cached_input_tokens ?? u.cache_read_input_tokens ?? u.cache_read_tokens,
  );
  const cacheCreate = toNum(
    u.cache_creation_input_tokens ?? u.cache_creation_tokens,
  );
  const total = inTok + outTok + cacheRead + cacheCreate;
  if (total === 0) return null;
  const parts = [`${formatTokens(inTok)} in`, `${formatTokens(outTok)} out`];
  if (cacheRead > 0) parts.push(`${formatTokens(cacheRead)} cache read`);
  if (cacheCreate > 0) parts.push(`${formatTokens(cacheCreate)} cache write`);
  return `\u2500\u2500 ${formatTokens(total)} tokens (${parts.join(", ")})`;
}

function extractUsage(
  parsed: Record<string, unknown>,
): Record<string, unknown> | null {
  const candidates: unknown[] = [
    parsed.usage,
    (parsed.response as Record<string, unknown> | undefined)?.usage,
    (parsed.turn as Record<string, unknown> | undefined)?.usage,
  ];
  for (const c of candidates) {
    if (c && typeof c === "object") return c as Record<string, unknown>;
  }
  return null;
}

function toNum(v: unknown): number {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

const ARG_SKIP = new Set(["my_slug", "new_topic", "viewer_slug", "tagged"]);

function ToolCallCard({
  item,
  compact,
}: {
  item: Record<string, unknown>;
  compact: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toolName =
    (item.tool as string | undefined) ||
    (item.name as string | undefined) ||
    "tool";
  const args = objectFromToolField(item.arguments ?? item.args);
  const result = normalizeToolResult(item.result);
  const errorField = item.error;

  const { summaryArg, summaryResult, summaryError } = useMemo(
    () => buildToolSummary(args, result, errorField),
    [args, result, errorField],
  );

  const cleanArgs = useMemo<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      if (!ARG_SKIP.has(k) && v !== null && v !== "") out[k] = v;
    }
    return out;
  }, [args]);

  return (
    <div className="cc-tool-call">
      <button
        type="button"
        className="cc-tool-header"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={`cc-tool-chevron${open ? " open" : ""}`}>▸</span>
        <span className="cc-tool-name">{toolName}</span>
        {summaryArg ? (
          <span className="cc-tool-summary">{summaryArg}</span>
        ) : null}
      </button>
      <ToolResultSummary summaryResult={summaryResult} open={open} />
      <ToolErrorSummary summaryError={summaryError} open={open} />
      {open ? (
        <ToolCallBody
          cleanArgs={cleanArgs}
          result={result}
          errorField={errorField}
          compact={compact}
        />
      ) : null}
    </div>
  );
}

function ToolResultSummary({
  summaryResult,
  open,
}: {
  summaryResult: string;
  open: boolean;
}) {
  if (!(summaryResult && !open)) return null;
  return (
    <div className="cc-tool-result-summary">
      {"\u2713 "}
      {summaryResult}
    </div>
  );
}

function ToolErrorSummary({
  summaryError,
  open,
}: {
  summaryError: string;
  open: boolean;
}) {
  if (!(summaryError && !open)) return null;
  return (
    <div className="cc-tool-error">
      {"\u2717 "}
      {summaryError}
    </div>
  );
}

function ToolCallBody({
  cleanArgs,
  result,
  errorField,
  compact,
}: {
  cleanArgs: Record<string, unknown>;
  result: { content?: Array<{ text?: string }> } | undefined;
  errorField: unknown;
  compact: boolean;
}) {
  return (
    <div className="cc-tool-body">
      {Object.keys(cleanArgs).length > 0 ? (
        <>
          <div className="cc-tool-section-label">Args</div>
          <Value value={cleanArgs} depth={1} compact={compact} />
        </>
      ) : null}
      {result && Array.isArray(result.content) && result.content.length > 0 ? (
        <>
          <div className="cc-tool-section-label cc-tool-result-label">
            {"\u2713 Response"}
          </div>
          {keyedByOccurrence(result.content, (content) =>
            stableValueKey("content", content.text ?? content),
          ).map(({ item: content, key }) => (
            <ToolResultContent
              key={key}
              text={content.text}
              compact={compact}
            />
          ))}
        </>
      ) : null}
      {errorField !== null ? (
        <>
          <div className="cc-tool-section-label cc-tool-error">
            {"\u2717 Error"}
          </div>
          <ToolErrorContent error={errorField} compact={compact} />
        </>
      ) : null}
    </div>
  );
}

function buildToolSummary(
  args: Record<string, unknown>,
  result: { content?: Array<{ text?: string }> } | undefined,
  errorField: unknown,
) {
  return {
    summaryArg: summarizeToolArgs(args),
    summaryResult: summarizeToolResult(result),
    summaryError: summarizeToolError(errorField),
  };
}

function summarizeToolArgs(args: Record<string, unknown>): string {
  const pick = [
    args.content,
    args.command,
    args.text,
    args.query,
    args.channel,
  ].find((v) => typeof v === "string" && v.length > 0);
  return typeof pick === "string" ? truncateText(pick, 80) : "";
}

function summarizeToolResult(
  result: { content?: Array<{ text?: string }> } | undefined,
): string {
  if (!(result && Array.isArray(result.content))) return "";
  const firstText = result.content.find((item) => item.text)?.text;
  return firstText ? truncateText(resultTextPreview(firstText), 60) : "";
}

function resultTextPreview(text: string): string {
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return objectSummaryText(parsed as Record<string, unknown>);
    }
  } catch {
    // keep plain text
  }
  return text;
}

function objectSummaryText(parsed: Record<string, unknown>): string {
  return (
    stringish(parsed.message) ||
    stringish(parsed.status) ||
    stringish(parsed.result) ||
    stringish(parsed.text) ||
    `${Object.keys(parsed).length} fields`
  );
}

function summarizeToolError(errorField: unknown): string {
  if (errorField === null) return "";
  return typeof errorField === "string" ? errorField.slice(0, 60) : "Error";
}

function truncateText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}\u2026` : text;
}

function objectFromToolField(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // keep as scalar below
    }
    return { value };
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return { value };
}

function normalizeToolResult(
  value: unknown,
): { content?: Array<{ text?: string }> } | undefined {
  if (value === null || value === "") return undefined;
  if (typeof value === "object" && !Array.isArray(value)) {
    const obj = value as { content?: Array<{ text?: string }> };
    if (Array.isArray(obj.content)) return obj;
    return { content: [{ text: JSON.stringify(value) }] };
  }
  return {
    content: [
      { text: typeof value === "string" ? value : JSON.stringify(value) },
    ],
  };
}

function ToolResultContent({
  text,
  compact,
}: {
  text?: string;
  compact: boolean;
}) {
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object") {
      return <Value value={parsed} depth={1} compact={compact} />;
    }
  } catch {
    // fall through
  }
  return <div className="cc-tool-result-inline">{text}</div>;
}

function ToolErrorContent({
  error,
  compact,
}: {
  error: unknown;
  compact: boolean;
}) {
  if (typeof error === "string") {
    try {
      const parsed = JSON.parse(error);
      if (parsed && typeof parsed === "object") {
        return <Value value={parsed} depth={1} compact={compact} />;
      }
    } catch {
      // fall through
    }
    return <div className="cc-tool-error-text">{error}</div>;
  }
  return <Value value={error} depth={1} compact={compact} />;
}

const NOISE_KEYS = new Set([
  "type",
  "activity",
  "phase",
  "status",
  "event",
  "agent",
  "from",
  "slug",
  "timestamp",
  "ts",
  "time",
  "detail",
  "content",
  "message",
  "text",
  "summary",
  "thread_id",
  "item",
  "id",
  "error",
  "result",
  "structured_content",
]);

function GenericEventCard({
  parsed,
  compact,
}: {
  parsed: Record<string, unknown>;
  compact: boolean;
}) {
  const phase = stringish(
    parsed.activity ?? parsed.phase ?? parsed.status ?? parsed.type,
  );
  const agent = stringish(parsed.agent ?? parsed.from ?? parsed.slug);
  const detail = stringish(
    parsed.detail ??
      parsed.content ??
      parsed.message ??
      parsed.text ??
      parsed.summary,
  );
  const detailText =
    detail.length > 300 ? `${detail.slice(0, 300)}\u2026` : detail;

  const extras = useMemo<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (NOISE_KEYS.has(k)) continue;
      if (v === null || v === "" || v === false) continue;
      out[k] = v;
    }
    return out;
  }, [parsed]);

  return (
    <div className="stream-card">
      {phase || agent ? (
        <div className="stream-card-header">
          {phase ? (
            <span
              className={`stream-card-phase stream-phase-${phase.replace(/[^a-z]/gi, "").toLowerCase()}`}
            >
              {phase}
            </span>
          ) : null}
          {agent ? <span className="stream-card-agent">{agent}</span> : null}
        </div>
      ) : null}
      {detail ? (
        <div className="stream-card-detail">
          <span>{detailText}</span>
        </div>
      ) : null}
      {Object.keys(extras).length > 0 && Object.keys(extras).length <= 8 ? (
        <div className="stream-line-json">
          <Value value={extras} depth={0} compact={compact} />
        </div>
      ) : null}
    </div>
  );
}

function stringish(v: unknown): string {
  return typeof v === "string" ? v : "";
}

/* ───── JSON tree primitive (shared by both card and fallback paths) ───── */

function Value({
  value,
  depth,
  compact,
}: {
  value: unknown;
  depth: number;
  compact: boolean;
}): ReactNode {
  if (value === null) return <span className="sv-null">null</span>;
  if (typeof value === "boolean") return <BooleanValue value={value} />;
  if (typeof value === "number") return <NumberValue value={value} />;
  if (typeof value === "string")
    return <StringValue value={value} depth={depth} />;
  if (Array.isArray(value)) {
    return <ArrayValue value={value} depth={depth} compact={compact} />;
  }
  if (typeof value === "object") {
    return (
      <ObjectValue
        value={value as Record<string, unknown>}
        depth={depth}
        compact={compact}
      />
    );
  }
  return <span className="sv-str">{String(value)}</span>;
}

function BooleanValue({ value }: { value: boolean }) {
  return <span className="sv-bool">{String(value)}</span>;
}

function NumberValue({ value }: { value: number }) {
  return <span className="sv-num">{String(value)}</span>;
}

function StringValue({ value, depth }: { value: string; depth: number }) {
  if (isIsoTimestamp(value)) {
    return <TimestampValue value={value} />;
  }
  const truncated =
    depth > 0 && value.length > 200 ? `${value.slice(0, 200)}\u2026` : value;
  return <span className="sv-str">{truncated}</span>;
}

function isIsoTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value);
}

function TimestampValue({ value }: { value: string }) {
  let display = value;
  try {
    display = new Date(value).toLocaleString([], {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    // keep raw
  }
  return (
    <span className="sv-ts" title={value}>
      {display}
    </span>
  );
}

function ArrayValue({
  value,
  depth,
  compact,
}: {
  value: unknown[];
  depth: number;
  compact: boolean;
}) {
  if (value.length === 0) return <span className="sv-null">[]</span>;
  if ((compact && depth >= 1) || depth > 3) {
    return <span className="sv-str">[{value.length} items]</span>;
  }
  return (
    <Collapsible label={`[${value.length}]`} startOpen={depth === 0}>
      <div className="sv-array">
        {keyedByOccurrence(value, (item) =>
          stableValueKey("array-item", item),
        ).map(({ item, key }) => (
          <div key={key} className="sv-array-item">
            <Value value={item} depth={depth + 1} compact={compact} />
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

function ObjectValue({
  value,
  depth,
  compact,
}: {
  value: Record<string, unknown>;
  depth: number;
  compact: boolean;
}) {
  const keys = Object.keys(value);
  if (keys.length === 0) return <span className="sv-null">{"{}"}</span>;
  if ((compact && depth >= 1) || depth > 3) {
    return <span className="sv-str">{`{${keys.length} fields}`}</span>;
  }
  return (
    <Collapsible label={`{${keys.length}}`} startOpen={depth === 0}>
      <div className="sv-obj">
        {keys.map((key) => (
          <div key={key} className="sv-obj-row">
            <span className="sv-key">{key}</span>
            <Value value={value[key]} depth={depth + 1} compact={compact} />
          </div>
        ))}
      </div>
    </Collapsible>
  );
}

function Collapsible({
  label,
  startOpen,
  children,
}: {
  label: string;
  startOpen: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(startOpen);
  if (open) {
    return (
      <span className="sv-collapsible">
        <button
          type="button"
          className="sv-toggle"
          onClick={() => setOpen(false)}
          title="Collapse"
        >
          ▾ {label}
        </button>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      className="sv-toggle"
      onClick={() => setOpen(true)}
      title="Expand"
    >
      ▸ {label}
    </button>
  );
}
