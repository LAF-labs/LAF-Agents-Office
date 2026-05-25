import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchCommands, type SlashCommandDescriptor } from "../api/client";
import { useI18n } from "../lib/i18n";
import type { Language } from "../stores/app";

/**
 * Web-autocomplete view of one slash command. The renderer gets the same
 * shape whether commands came from the hosted API or the cloud-safe fallback.
 */
export interface SlashCommand {
  name: string;
  desc: string;
  icon: string;
}

/**
 * Fallback used when the hosted command registry is unreachable. Keep the set
 * in sync with the web-safe command set in the hosted API facade.
 *
 * Icons are web-only metadata. Values are semantic glyph names that the web
 * renderer maps to line icons.
 */
export const HOSTED_FALLBACK_SLASH_COMMANDS: SlashCommand[] = [
  { name: "/ask", desc: "Ask the team lead", icon: "ask" },
  {
    name: "/approvals",
    desc: "Review founder approval queue",
    icon: "approvals",
  },
  { name: "/search", desc: "Search messages + KB", icon: "search" },
  { name: "/remember", desc: "Store a fact in memory", icon: "remember" },
  { name: "/help", desc: "Show all commands + keys", icon: "help" },
  { name: "/clear", desc: "Clear messages", icon: "clear" },
  { name: "/growth", desc: "Open Startup Office", icon: "growth" },
  { name: "/loops", desc: "Open operating loops", icon: "loops" },
  { name: "/receipts", desc: "Open run receipts", icon: "receipts" },
  { name: "/requests", desc: "Open requests", icon: "requests" },
  { name: "/1o1", desc: "1:1 with agent", icon: "1o1" },
  { name: "/skills", desc: "View skills", icon: "skills" },
  { name: "/threads", desc: "See every active thread", icon: "threads" },
];

const HOSTED_COMMAND_NAMES = new Set(
  HOSTED_FALLBACK_SLASH_COMMANDS.map((command) => command.name),
);

/**
 * Icon map for commands returned by the hosted registry. Keyed by bare command name
 * (no leading slash). Unknown commands fall back to a generic icon so the
 * autocomplete never renders a blank glyph if someone adds a TUI command
 * and flips webSupported before updating this list.
 */
const COMMAND_ICONS: Record<string, string> = {
  ask: "ask",
  approvals: "approvals",
  lookup: "lookup",
  lint: "lint",
  search: "search",
  remember: "remember",
  help: "help",
  clear: "clear",
  reset: "reset",
  tasks: "tasks",
  growth: "growth",
  loops: "loops",
  receipts: "receipts",
  requests: "requests",
  "1o1": "1o1",
  task: "task",
  cancel: "cancel",
  skills: "skills",
  focus: "focus",
  collab: "collab",
  pause: "pause",
  resume: "resume",
  threads: "threads",
  provider: "provider",
  "hire-agent": "hire-agent",
  "assign-task": "assign-task",
  "daily-standup": "daily-standup",
  "review-office": "review-office",
  "promote-to-wiki": "promote-to-wiki",
  "fix-bug": "fix-bug",
  "deploy-simulation": "deploy-simulation",
};

const DEFAULT_ICON = "default";
const DEFERRED_WEB_COMMANDS = new Set(["calendar", "policies", "recover"]);

const COMMAND_DESCRIPTIONS_KO: Record<string, string> = {
  ask: "팀 리드에게 묻기",
  approvals: "창업자 승인 대기열 검토",
  lookup: "팀 위키에서 근거 있는 답변 찾기",
  lint: "위키의 모순, 오래된 사실, 끊긴 참조 점검",
  search: "메시지와 지식 검색",
  remember: "기억할 사실 저장",
  help: "명령어와 단축키 보기",
  clear: "메시지 비우기",
  reset: "워크스페이스 초기화",
  tasks: "작업 보드 열기",
  growth: "스타트업 오피스 열기",
  loops: "운영 루프 열기",
  receipts: "실행 영수증 열기",
  requests: "요청함 열기",
  "1o1": "에이전트와 1:1 대화",
  task: "작업 상태 변경",
  cancel: "작업 취소",
  skills: "스킬 관리 열기",
  focus: "위임 모드로 전환",
  collab: "협업 모드로 전환",
  pause: "모든 에이전트 일시정지",
  resume: "모든 에이전트 재개",
  threads: "활성 스레드 보기",
  provider: "기본 AI 제공자 전환",
  "hire-agent": "Claude/Codex 기반 에이전트 추가",
  "assign-task": "작업 보드 일을 에이전트에게 배정",
  "daily-standup": "데일리 스탠드업 실행",
  "review-office": "오피스 규칙, 보안, 메모리 일관성 점검",
  "promote-to-wiki": "노트북 초안을 위키로 승격 검토",
  "fix-bug": "리뷰와 메모리 기록을 포함한 버그 수정 흐름",
  "deploy-simulation": "Claude 또는 Codex 모드 배포 리허설",
};

function commandDescription(
  name: string,
  fallback: string,
  language: Language,
): string {
  if (language === "ko") {
    return COMMAND_DESCRIPTIONS_KO[name] ?? fallback;
  }
  return fallback;
}

function localizeCommands(
  commands: SlashCommand[],
  language: Language,
): SlashCommand[] {
  if (language !== "ko") return commands;
  return commands.map((command) => {
    const name = command.name.replace(/^\//, "");
    return {
      ...command,
      desc: commandDescription(name, command.desc, language),
    };
  });
}

function fallbackCommands(language: Language): SlashCommand[] {
  return localizeCommands(HOSTED_FALLBACK_SLASH_COMMANDS, language);
}

/**
 * Convert the hosted registry payload into the shape the autocomplete renderer
 * expects. Filters to webSupported=true and only keeps commands the web
 * actually knows how to execute.
 */
function toAutocomplete(
  commands: SlashCommandDescriptor[],
  language: Language = "en",
): SlashCommand[] {
  return commands
    .filter((c) => {
      if (!c.webSupported || DEFERRED_WEB_COMMANDS.has(c.name)) return false;
      return HOSTED_COMMAND_NAMES.has(`/${c.name}`);
    })
    .map((c) => ({
      name: `/${c.name}`,
      desc: commandDescription(c.name, c.description, language),
      icon: COMMAND_ICONS[c.name] ?? DEFAULT_ICON,
    }));
}

/**
 * Read the canonical slash-command registry. Returns the hosted API view when
 * available, or the hardcoded fallback if the registry is unreachable. The
 * hook never throws — a missing registry is a recoverable degradation, not
 * an error state the UI needs to render.
 *
 * The autocomplete UX does not change between the two modes; only the set
 * of commands shown might.
 */
export function useCommands(): SlashCommand[] {
  const { language } = useI18n();
  const { data, isError } = useQuery({
    queryKey: ["commands"],
    queryFn: fetchCommands,
    // Registry only changes on rebuild. Five minutes is enough to absorb a
    // dev loop without hammering the hosted API.
    staleTime: 5 * 60_000,
    // Failures fall through to the fallback — don't retry aggressively.
    retry: 1,
  });

  // Memoize the derived view so consumers relying on the returned array as
  // a dependency (e.g. the autocomplete effect) don't see a fresh reference
  // on every render. Without this, every Composer render rebuilt `commands`,
  // which rebuilt the autocomplete `items` array, which re-fired the effect
  // that calls `onItems(items)` — looping setState until React bailed with
  // "Maximum update depth exceeded."
  return useMemo(() => {
    if (isError || !data) {
      return fallbackCommands(language);
    }
    const mapped = toAutocomplete(data, language);
    // Defensive: if the registry returns an empty webSupported set, prefer the
    // cloud-safe fallback
    // rather than an empty autocomplete.
    return mapped.length > 0
      ? mapped
      : fallbackCommands(language);
  }, [data, isError, language]);
}

// Exported for tests.
export const __test__ = {
  toAutocomplete,
  fallbackCommands,
  COMMAND_ICONS,
  DEFAULT_ICON,
};
