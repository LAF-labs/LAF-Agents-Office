/**
 * Simple markdown-to-HTML formatter for trusted agent messages.
 * Mirrors the formatTrusted() function from index.legacy.html.
 *
 * SECURITY: Only use for messages from the broker (trusted source).
 * User-submitted content should be escaped before display.
 */

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type ListType = "" | "ul" | "ol";

interface MarkdownFormatState {
  result: string[];
  inCodeBlock: boolean;
  codeLines: string[];
  listType: ListType;
}

export function formatMarkdown(raw: string): string {
  if (!raw) return "";

  const state: MarkdownFormatState = {
    result: [],
    inCodeBlock: false,
    codeLines: [],
    listType: "",
  };

  for (const line of raw.split("\n")) formatMarkdownLine(line, state);

  if (state.inCodeBlock) flushCodeBlock(state);
  closeList(state);

  return state.result.join("");
}

function formatMarkdownLine(line: string, state: MarkdownFormatState) {
  if (line.trimStart().startsWith("```")) {
    toggleCodeBlock(state);
    return;
  }
  if (state.inCodeBlock) {
    state.codeLines.push(line);
    return;
  }

  const isUl = /^\s*[-*]\s/.test(line);
  const isOl = /^\s*\d+\.\s/.test(line);
  const trimmed = line.trim();
  if (state.listType && !isUl && !isOl && trimmed !== "") closeList(state);
  if (appendEmptyLine(trimmed, state)) return;

  const block = formatBlock(trimmed);
  if (block) {
    state.result.push(block);
    return;
  }
  if (isUl) {
    appendListItem(state, "ul", trimmed.replace(/^\s*[-*]\s/, ""));
    return;
  }
  if (isOl) {
    appendListItem(state, "ol", trimmed.replace(/^\s*\d+\.\s/, ""));
    return;
  }

  state.result.push(`<span>${formatInline(trimmed)}</span><br/>`);
}

function toggleCodeBlock(state: MarkdownFormatState) {
  if (state.inCodeBlock) {
    flushCodeBlock(state);
    state.inCodeBlock = false;
    return;
  }
  closeList(state);
  state.inCodeBlock = true;
}

function flushCodeBlock(state: MarkdownFormatState) {
  state.result.push(
    `<div class="msg-codeblock"><code>${escapeHtml(state.codeLines.join("\n"))}</code></div>`,
  );
  state.codeLines = [];
}

function closeList(state: MarkdownFormatState) {
  if (!state.listType) return;
  state.result.push(`</${state.listType}>`);
  state.listType = "";
}

function appendEmptyLine(trimmed: string, state: MarkdownFormatState): boolean {
  if (trimmed !== "") return false;
  closeList(state);
  state.result.push("<br/>");
  return true;
}

function appendListItem(
  state: MarkdownFormatState,
  listType: Exclude<ListType, "">,
  text: string,
) {
  if (state.listType !== listType) {
    closeList(state);
    state.result.push(`<${listType} class="msg-${listType}">`);
    state.listType = listType;
  }
  state.result.push(`<li>${formatInline(text)}</li>`);
}

function formatBlock(trimmed: string): string | null {
  if (trimmed.startsWith("### ")) {
    return `<div class="msg-h3">${formatInline(trimmed.slice(4))}</div>`;
  }
  if (trimmed.startsWith("## ")) {
    return `<div class="msg-h2">${formatInline(trimmed.slice(3))}</div>`;
  }
  if (trimmed.startsWith("# ")) {
    return `<div class="msg-h1">${formatInline(trimmed.slice(2))}</div>`;
  }
  if (/^---+$/.test(trimmed) || /^\*\*\*+$/.test(trimmed)) {
    return '<hr class="msg-hr"/>';
  }
  if (trimmed.startsWith("> ")) {
    return `<div class="msg-blockquote">${formatInline(trimmed.slice(2))}</div>`;
  }
  return null;
}

// Only http/https/mailto and same-origin path / fragment URLs are allowed in
// rendered links. Agent output is "trusted" only insofar as it comes from the
// broker, but the broker can relay attacker-controlled context (emails,
// calendar, CRM), so we must still defend against javascript:/data:/vbscript:
// payloads. The negative lookahead on the path branch rejects protocol-
// relative URLs like `//evil.com/x`, which the browser otherwise resolves
// against the current scheme.
const SAFE_URL_SCHEME = /^(?:https?:\/\/|mailto:|\/(?!\/)|#)/i;

function safeURL(raw: string): string {
  const trimmed = raw.trim();
  return SAFE_URL_SCHEME.test(trimmed) ? trimmed : "#";
}

function formatInline(text: string): string {
  let s = escapeHtml(text);
  // Bold
  s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  // Italic
  s = s.replace(/\*(.+?)\*/g, "<em>$1</em>");
  // Inline code
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // Links
  s = s.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    (_, label, url) =>
      `<a class="msg-link" href="${safeURL(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  // @mentions
  s = s.replace(/@(\w[\w-]*)/g, '<span class="mention">@$1</span>');
  return s;
}
