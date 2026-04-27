import { useCallback, useEffect, useState } from "react";

import { get, post } from "../../api/client";
import type { Language } from "../../stores/app";
import { useAppStore } from "../../stores/app";
import { Kbd, MOD_KEY } from "../ui/Kbd";
import "../../styles/onboarding.css";

/* ═══════════════════════════════════════════
   Types
   ═══════════════════════════════════════════ */

interface BlueprintTemplate {
  id: string;
  name: string;
  description: string;
  emoji?: string;
  agents?: BlueprintAgent[];
}

interface BlueprintAgent {
  slug: string;
  name: string;
  role: string;
  emoji?: string;
  checked?: boolean;
  // built_in marks the lead agent — always included, never removable.
  // The backend also refuses to disable or remove a BuiltIn member, so
  // even if someone bypassed this UI, the broker would reject the write.
  built_in?: boolean;
}

interface TaskTemplate {
  id: string;
  name: string;
  description: string;
  emoji?: string;
  prompt?: string;
}

type WizardStep =
  | "welcome"
  | "templates"
  | "identity"
  | "team"
  | "setup"
  | "task"
  | "ready";

// Step order: company info before blueprint. The blueprint picker is a
// decision about how the office starts; it makes more sense after the
// user has anchored who they are than as the very first question.
// `ready` is the final-step readiness summary matching the TUI's InitDone
// phase (see internal/tui/init_flow.go readinessChecks()) — shows the user
// exactly what's configured before we submit.
const STEP_ORDER: readonly WizardStep[] = [
  "welcome",
  "identity",
  "templates",
  "team",
  "setup",
  "task",
  "ready",
] as const;

// Each runtime has a display label, the binary name the broker's prereqs
// check looks for, a canonical install page to link to when missing, and
// — for the runtimes the broker can actually dispatch agents to — the
// provider id the broker expects on POST /config.
interface RuntimeSpec {
  label: string;
  binary: string;
  installUrl: string;
  provider: "claude-code" | "codex" | "opencode" | null;
}

const RUNTIMES: readonly RuntimeSpec[] = [
  {
    label: "Claude Code",
    binary: "claude",
    installUrl: "https://claude.ai/code",
    provider: "claude-code",
  },
  {
    label: "Codex",
    binary: "codex",
    installUrl: "https://github.com/openai/codex",
    provider: "codex",
  },
  {
    label: "Opencode",
    binary: "opencode",
    installUrl: "https://opencode.ai",
    provider: "opencode",
  },
  {
    label: "Cursor",
    binary: "cursor",
    installUrl: "https://cursor.com/",
    provider: null,
  },
  {
    label: "Windsurf",
    binary: "windsurf",
    installUrl: "https://codeium.com/windsurf",
    provider: null,
  },
] as const;

interface PrereqResult {
  name: string;
  required: boolean;
  found: boolean;
  ok?: boolean;
  version?: string;
  install_url?: string;
}

// "Start from scratch" starter roster. Mirrors scratchFoundingTeamBlueprint
// in internal/team/broker_onboarding.go — the broker seeds these exact slugs
// when the wizard POSTs blueprint:null. Kept in sync manually; backend is the
// source of truth, this is just the Team-step preview so users don't see an
// empty roster before confirming.
const SCRATCH_FOUNDING_TEAM: readonly BlueprintAgent[] = [
  { slug: "ceo", name: "CEO", role: "lead", checked: true, built_in: true },
  { slug: "gtm-lead", name: "GTM Lead", role: "go-to-market", checked: true },
  {
    slug: "founding-engineer",
    name: "Founding Engineer",
    role: "engineering",
    checked: true,
  },
  { slug: "pm", name: "Product Manager", role: "product", checked: true },
  { slug: "designer", name: "Designer", role: "design", checked: true },
];

// Only show onboarding presets that match the current startup product-work
// wedge. Older operation templates remain loadable by id for backwards
// compatibility, but they should not appear in the first-run picker.
const ONBOARDING_BLUEPRINT_ALLOWLIST = new Set<string>();

function visibleOnboardingBlueprints(
  templates: BlueprintTemplate[],
): BlueprintTemplate[] {
  return templates.filter((template) =>
    ONBOARDING_BLUEPRINT_ALLOWLIST.has(template.id),
  );
}

type BlueprintCategoryKey = "project";

interface BlueprintDisplay {
  category: BlueprintCategoryKey;
  shortDescription: string;
  icon: string;
}

const BLUEPRINT_CATEGORIES: ReadonlyArray<{
  key: BlueprintCategoryKey;
  label: string;
  hint: string;
}> = [
  {
    key: "project",
    label: "Startup Projects",
    hint: "Planning, development, and workflow automation",
  },
] as const;

const BLUEPRINT_DISPLAY: Record<string, BlueprintDisplay> = {};

const API_KEY_FIELDS = [
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic",
    hint: "Powers Claude-based agents",
  },
  { key: "OPENAI_API_KEY", label: "OpenAI", hint: "Powers GPT-based agents" },
  {
    key: "GOOGLE_API_KEY",
    label: "Google",
    hint: "Powers Gemini-based agents",
  },
] as const;

type MemoryBackend = "markdown";

interface WizardCopy {
  common: {
    back: string;
    continue: string;
    optional: string;
  };
  progress: Record<WizardStep, string>;
  welcome: {
    eyebrow: string;
    headline: string;
    subhead: string;
    cta: string;
  };
  templates: {
    eyebrow: string;
    headline: string;
    subhead: string;
    loading: string;
    other: string;
    scratchTitle: string;
    scratchSubhead: string;
    next: string;
    categories: Record<BlueprintCategoryKey, { label: string; hint: string }>;
    display: Record<string, { name: string; shortDescription: string }>;
  };
  identity: {
    title: string;
    companyLabel: string;
    companyPlaceholder: string;
    descriptionLabel: string;
    descriptionPlaceholder: string;
    priorityLabel: string;
    priorityPlaceholder: string;
    next: string;
  };
  team: {
    title: string;
    description: string;
    empty: string;
    leadTitle: string;
    leadBadge: string;
  };
  setup: {
    title: string;
    description: string;
    checkingRuntimes: string;
    installed: string;
    notInstalled: string;
    install: string;
    notInstalledTitle: (label: string) => string;
    priorityTitle: (priority: number) => string;
    fallbackOrder: string;
    fallbackHint: string;
    moveUp: (label: string) => string;
    moveDown: (label: string) => string;
    remove: (label: string) => string;
    apiKeysRequiredTitle: string;
    apiKeysOptionalHint: string;
    apiKeysRequiredHint: string;
    runtimeReadyTitle: (label: string) => string;
    runtimeReadyHint: string;
    apiKeysFallbackButton: string;
    apiKeysFallbackHide: string;
    apiKeyHints: Record<string, string>;
    memoryTitle: string;
    memoryDescription: string;
    memoryOptions: { markdown: { label: string; hint: string } };
    next: string;
  };
  task: {
    title: string;
    subhead: string;
    placeholder: string;
    newLineHint: string;
    reviewSetupHint: string;
    suggestions: string;
    skip: string;
    next: string;
  };
  ready: {
    title: string;
    subhead: string;
    cta: string;
    starting: string;
  };
  readiness: {
    sessionLabel: string;
    sessionReady: string;
    runtimeLabel: string;
    runtimeInstalled: (label: string) => string;
    runtimeSelectedMissing: (label: string) => string;
    runtimeKeyReady: string;
    runtimeMissing: string;
    memoryLabel: string;
    memoryMarkdown: string;
    githubLabel: string;
    githubConnectLater: string;
    blueprintLabel: string;
    blueprintScratch: string;
  };
}

const WIZARD_COPY: Record<Language, WizardCopy> = {
  en: {
    common: {
      back: "Back",
      continue: "Continue",
      optional: "optional",
    },
    progress: {
      welcome: "Start",
      identity: "Office",
      templates: "Starter",
      team: "Team",
      setup: "Run",
      task: "Task",
      ready: "Review",
    },
    welcome: {
      eyebrow: "Ready to set up",
      headline: "Plan, build, and automate with your startup agent team.",
      subhead:
        "A local workspace where agents coordinate in channels, keep a shared wiki, and turn product work into visible progress.",
      cta: "Open the office",
    },
    templates: {
      eyebrow: "Start with a focused project team",
      headline: "What should your office run?",
      subhead:
        "Start from a founding team built for planning, development, and automation. You can add custom specialists later.",
      loading: "Loading starters...",
      other: "Other",
      scratchTitle: "Start from scratch",
      scratchSubhead:
        "5-person founding team: CEO, GTM Lead, Founding Engineer, PM, Designer",
      next: "Review the team",
      categories: {
        project: {
          label: "Startup Projects",
          hint: "Planning, development, and workflow automation",
        },
      },
      display: {},
    },
    identity: {
      title: "Tell us about this office",
      companyLabel: "Company or project name",
      companyPlaceholder: "Acme Operations, or your real project name",
      descriptionLabel: "One-liner description",
      descriptionPlaceholder:
        "What real business or workflow should this office run?",
      priorityLabel: "Top priority right now",
      priorityPlaceholder: "Win the first real customer loop",
      next: "Choose a starter",
    },
    team: {
      title: "Your team",
      description:
        "These are the specialists your starter assembled. Toggle anyone you don't need.",
      empty:
        "No teammates yet. Go back and pick a starter, or open the office and add agents from the team panel.",
      leadTitle: "Lead agent — always included",
      leadBadge: "Lead",
    },
    setup: {
      title: "How should agents run?",
      description:
        "Use local coding CLIs first. API keys stay as a fallback for agents that need provider access.",
      checkingRuntimes: "Checking which CLIs are installed...",
      installed: "Installed",
      notInstalled: "Not installed",
      install: "install",
      notInstalledTitle: (label) => `${label} — not installed`,
      priorityTitle: (priority) => `Priority ${priority}`,
      fallbackOrder: "Fallback order",
      fallbackHint: "Agents try these in order. Use the arrows to reorder.",
      moveUp: (label) => `Move ${label} up`,
      moveDown: (label) => `Move ${label} down`,
      remove: (label) => `Remove ${label}`,
      apiKeysRequiredTitle: "API keys (required)",
      apiKeysOptionalHint:
        "Only used if every selected runtime fails. Leave blank to rely on local CLI auth.",
      apiKeysRequiredHint:
        "No installed CLI selected. Add at least one key so agents can reason.",
      runtimeReadyTitle: (label) => `${label} CLI detected`,
      runtimeReadyHint:
        "This runtime uses its own local login. Add provider API keys only when you want a fallback.",
      apiKeysFallbackButton: "API key fallback",
      apiKeysFallbackHide: "Hide API key fallback",
      apiKeyHints: {
        ANTHROPIC_API_KEY: "Powers Claude-based agents",
        OPENAI_API_KEY: "Powers GPT-based agents",
        GOOGLE_API_KEY: "Powers Gemini-based agents",
      },
      memoryTitle: "Team wiki",
      memoryDescription:
        "Shared context is stored in the local LLM wiki. Agents use it for durable project decisions, facts, and playbooks.",
      memoryOptions: {
        markdown: {
          label: "Team wiki (default)",
          hint: "Local git-backed wiki with sourced facts and /lookup. No API key.",
        },
      },
      next: "Ready",
    },
    task: {
      title: "What should the team work on first?",
      subhead:
        "Type your own first task, or pick from the starter's suggested sequence below.",
      placeholder: "e.g. Draft the launch plan for our first customer segment",
      newLineHint: "new line",
      reviewSetupHint: "review setup",
      suggestions: "Suggested starter sequence",
      skip: "Skip for now",
      next: "Review setup",
    },
    ready: {
      title: "You're set",
      subhead:
        "Here's what's configured. Anything with a ! or - can be fixed later from Settings.",
      cta: "Get started",
      starting: "Starting...",
    },
    readiness: {
      sessionLabel: "Session runtime",
      sessionReady: "Web session. No tmux required in the browser.",
      runtimeLabel: "LLM runtime",
      runtimeInstalled: (label) => `${label} installed`,
      runtimeSelectedMissing: (label) =>
        `${label} selected but not installed. Install before agents can reason.`,
      runtimeKeyReady: "Provider API key will drive agent runs.",
      runtimeMissing: "Pick a CLI or add a provider key on the Setup step.",
      memoryLabel: "Team wiki",
      memoryMarkdown: "Git-native team wiki in ~/.laf-office/wiki.",
      githubLabel: "GitHub repository",
      githubConnectLater:
        "Connect the project repo after deployment settings are ready. Agents will use it for implementation tasks.",
      blueprintLabel: "Starter",
      blueprintScratch: "Start from scratch (5-person founding team).",
    },
  },
  ko: {
    common: {
      back: "뒤로",
      continue: "계속",
      optional: "선택 사항",
    },
    progress: {
      welcome: "시작",
      identity: "오피스",
      templates: "시작 방식",
      team: "팀",
      setup: "실행",
      task: "첫 작업",
      ready: "검토",
    },
    welcome: {
      eyebrow: "설정 준비 완료",
      headline: "기획·개발 에이전트가 함께 일하는 팀 오피스.",
      subhead:
        "소규모 창업팀이 에이전트와 함께 제품을 기획하고, 팀 위키로 맥락을 이어가며, GitHub 기반 개발 작업까지 연결하는 로컬 오피스입니다.",
      cta: "오피스 열기",
    },
    templates: {
      eyebrow: "프로젝트 팀으로 시작하기",
      headline: "이 오피스는 어떤 일을 하게 할까요?",
      subhead:
        "기획, 개발, 자동화에 맞춘 창업팀 구성으로 시작합니다. 필요한 전문가는 나중에 추가할 수 있습니다.",
      loading: "시작 방식 불러오는 중...",
      other: "기타",
      scratchTitle: "처음부터 시작",
      scratchSubhead:
        "5명 창업팀: CEO, GTM 리드, 파운딩 엔지니어, PM, 디자이너",
      next: "팀 검토",
      categories: {
        project: {
          label: "창업팀 프로젝트",
          hint: "기획, 개발, 업무 자동화",
        },
      },
      display: {},
    },
    identity: {
      title: "이 오피스에 대해 알려주세요",
      companyLabel: "회사 또는 프로젝트 이름",
      companyPlaceholder: "Acme Operations 또는 실제 프로젝트 이름",
      descriptionLabel: "한 줄 설명",
      descriptionPlaceholder:
        "이 오피스가 맡을 실제 비즈니스나 워크플로는 무엇인가요?",
      priorityLabel: "지금 가장 중요한 목표",
      priorityPlaceholder: "첫 실제 고객 루프 만들기",
      next: "시작 방식 선택",
    },
    team: {
      title: "팀 구성",
      description:
        "선택한 시작 방식이 구성한 전문가들입니다. 필요 없는 구성원은 끌 수 있습니다.",
      empty:
        "아직 팀원이 없습니다. 뒤로 가서 시작 방식을 고르거나, 오피스를 연 뒤 팀 패널에서 에이전트를 추가하세요.",
      leadTitle: "리드 에이전트 - 항상 포함됨",
      leadBadge: "리드",
    },
    setup: {
      title: "에이전트를 어떻게 실행할까요?",
      description:
        "로컬 코딩 CLI를 우선 사용합니다. API 키는 제공자 접근이 필요할 때 쓰는 대체 수단입니다.",
      checkingRuntimes: "설치된 CLI 확인 중...",
      installed: "설치됨",
      notInstalled: "설치되지 않음",
      install: "설치",
      notInstalledTitle: (label) => `${label} - 설치되지 않음`,
      priorityTitle: (priority) => `우선순위 ${priority}`,
      fallbackOrder: "대체 실행 순서",
      fallbackHint:
        "에이전트는 이 순서대로 시도합니다. 화살표로 순서를 바꾸세요.",
      moveUp: (label) => `${label} 위로 이동`,
      moveDown: (label) => `${label} 아래로 이동`,
      remove: (label) => `${label} 제거`,
      apiKeysRequiredTitle: "API 키 (필수)",
      apiKeysOptionalHint:
        "선택한 런타임이 모두 실패할 때만 사용합니다. 로컬 CLI 인증을 사용할 거라면 비워두세요.",
      apiKeysRequiredHint:
        "설치된 CLI가 선택되지 않았습니다. 에이전트가 추론할 수 있도록 하나 이상의 키를 추가하세요.",
      runtimeReadyTitle: (label) => `${label} CLI 감지됨`,
      runtimeReadyHint:
        "이 런타임은 로컬 로그인 정보를 사용합니다. 제공자 API 키는 대체 실행이 필요할 때만 추가하세요.",
      apiKeysFallbackButton: "API 키 대체 실행",
      apiKeysFallbackHide: "API 키 대체 실행 숨기기",
      apiKeyHints: {
        ANTHROPIC_API_KEY: "Claude 기반 에이전트 실행",
        OPENAI_API_KEY: "GPT 기반 에이전트 실행",
        GOOGLE_API_KEY: "Gemini 기반 에이전트 실행",
      },
      memoryTitle: "팀 위키",
      memoryDescription:
        "공유 맥락은 로컬 LLM 위키에 저장합니다. 에이전트는 프로젝트 결정, 사실, 플레이북을 여기서 이어받습니다.",
      memoryOptions: {
        markdown: {
          label: "팀 위키 (기본값)",
          hint: "출처가 붙는 로컬 git 위키입니다. /lookup을 지원하며 API 키가 필요 없습니다.",
        },
      },
      next: "준비 완료",
    },
    task: {
      title: "팀이 가장 먼저 할 일은 무엇인가요?",
      subhead:
        "첫 작업을 직접 입력하거나 시작 방식이 제안한 순서에서 고르세요.",
      placeholder: "예: 첫 고객 세그먼트를 위한 출시 계획 초안 작성",
      newLineHint: "줄바꿈",
      reviewSetupHint: "설정 검토",
      suggestions: "추천 시작 작업 순서",
      skip: "지금은 건너뛰기",
      next: "설정 검토",
    },
    ready: {
      title: "설정이 끝났습니다",
      subhead:
        "현재 구성된 항목입니다. ! 또는 - 표시가 있는 항목은 나중에 설정에서 고칠 수 있습니다.",
      cta: "시작하기",
      starting: "시작 중...",
    },
    readiness: {
      sessionLabel: "세션 런타임",
      sessionReady: "웹 세션입니다. 브라우저에서는 tmux가 필요하지 않습니다.",
      runtimeLabel: "LLM 런타임",
      runtimeInstalled: (label) => `${label} 설치됨`,
      runtimeSelectedMissing: (label) =>
        `${label}을 선택했지만 설치되어 있지 않습니다. 에이전트가 추론하려면 먼저 설치해야 합니다.`,
      runtimeKeyReady: "제공자 API 키로 에이전트를 실행합니다.",
      runtimeMissing: "CLI를 선택하거나 설정 단계에서 제공자 키를 추가하세요.",
      memoryLabel: "팀 위키",
      memoryMarkdown: "git 기반 팀 위키를 ~/.laf-office/wiki에 저장합니다.",
      githubLabel: "GitHub 저장소",
      githubConnectLater:
        "배포 설정이 준비되면 프로젝트 저장소를 연결합니다. 에이전트는 실제 개발 작업에 이 저장소를 사용합니다.",
      blueprintLabel: "시작 방식",
      blueprintScratch: "처음부터 시작 (5명 창업팀).",
    },
  },
};

/* ═══════════════════════════════════════════
   Arrow icon reused across buttons
   ═══════════════════════════════════════════ */

function ArrowIcon() {
  return (
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
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

/**
 * Inline Enter-key hint for primary CTAs. Purely decorative — the real
 * Enter handling lives at the Wizard level so it works from anywhere on
 * the step, not just when the button has focus. Pass `modifier` (e.g.
 * ⌘/Ctrl) when the step binds ⌘+Enter instead of plain Enter.
 */
function EnterHint({ modifier }: { modifier?: string } = {}) {
  return (
    <span className="kbd-hint" aria-hidden="true">
      {modifier ? (
        <Kbd size="sm" variant="inverse">
          {modifier}
        </Kbd>
      ) : null}
      <Kbd size="sm" variant="inverse">
        ↵
      </Kbd>
    </span>
  );
}

/* ═══════════════════════════════════════════
   Sub-components
   ═══════════════════════════════════════════ */

function ProgressDots({
  copy,
  current,
}: {
  copy: WizardCopy;
  current: WizardStep;
}) {
  const currentIndex = STEP_ORDER.indexOf(current);
  return (
    <ol className="wizard-progress" aria-label="Onboarding progress">
      {STEP_ORDER.map((step, index) => (
        <li
          key={step}
          className={`wizard-progress-item ${step === current ? "active" : ""} ${index < currentIndex ? "complete" : ""}`}
          aria-current={step === current ? "step" : undefined}
        >
          <span className="wizard-progress-track" aria-hidden="true" />
          <span className="wizard-progress-label">{copy.progress[step]}</span>
        </li>
      ))}
    </ol>
  );
}

/* ─── Step 1: Welcome ─── */

interface WelcomeStepProps {
  copy: WizardCopy;
  onNext: () => void;
}

function WelcomeStep({ copy, onNext }: WelcomeStepProps) {
  return (
    <div className="wizard-step">
      <div className="wizard-hero">
        <div className="wizard-eyebrow">
          <span className="status-dot active pulse" />
          {copy.welcome.eyebrow}
        </div>
        <h1 className="wizard-headline">{copy.welcome.headline}</h1>
        <p className="wizard-subhead">{copy.welcome.subhead}</p>
      </div>
      <div style={{ display: "flex", justifyContent: "center" }}>
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {copy.welcome.cta}
          <ArrowIcon />
          <EnterHint />
        </button>
      </div>
    </div>
  );
}

/* ─── Step 2: Templates ─── */

interface TemplatesStepProps {
  copy: WizardCopy;
  templates: BlueprintTemplate[];
  loading: boolean;
  selected: string | null;
  onSelect: (id: string | null) => void;
  onNext: () => void;
  onBack: () => void;
}

function TemplatesStep({
  copy,
  templates,
  loading,
  selected,
  onSelect,
  onNext,
  onBack,
}: TemplatesStepProps) {
  // Group templates by display category. Unknown blueprint ids (not in the
  // frontend catalog) land in a catch-all "Other" bucket so new backend
  // templates still render, just without the short-description and icon
  // treatment.
  const grouped = new Map<
    BlueprintCategoryKey | "other",
    BlueprintTemplate[]
  >();
  for (const t of templates) {
    const display = BLUEPRINT_DISPLAY[t.id];
    const key: BlueprintCategoryKey | "other" = display?.category ?? "other";
    const list = grouped.get(key) ?? [];
    list.push(t);
    grouped.set(key, list);
  }

  const renderTile = (t: BlueprintTemplate) => {
    const display = BLUEPRINT_DISPLAY[t.id];
    const displayCopy = copy.templates.display[t.id];
    const icon = display?.icon ?? t.emoji;
    const name = displayCopy?.name ?? t.name;
    const desc =
      displayCopy?.shortDescription ??
      display?.shortDescription ??
      t.description;
    return (
      <button
        key={t.id}
        className={`template-card ${selected === t.id ? "selected" : ""}`}
        onClick={() => onSelect(t.id)}
        type="button"
      >
        {icon ? <div className="template-card-emoji">{icon}</div> : null}
        <div className="template-card-name">{name}</div>
        <div className="template-card-desc">{desc}</div>
      </button>
    );
  };

  return (
    <div className="wizard-step">
      <div className="wizard-hero">
        <div className="wizard-eyebrow">
          <span className="status-dot active pulse" />
          {copy.templates.eyebrow}
        </div>
        <h1 className="wizard-headline">{copy.templates.headline}</h1>
        <p className="wizard-subhead">{copy.templates.subhead}</p>
      </div>

      {loading ? (
        <div className="wizard-panel">
          <div
            style={{
              color: "var(--text-tertiary)",
              fontSize: 13,
              textAlign: "center",
              padding: 20,
            }}
          >
            {copy.templates.loading}
          </div>
        </div>
      ) : (
        <>
          {BLUEPRINT_CATEGORIES.map((cat) => {
            const items = grouped.get(cat.key) ?? [];
            if (items.length === 0) return null;
            const category = copy.templates.categories[cat.key];
            return (
              <div key={cat.key} className="wizard-panel template-group">
                <div className="template-group-head">
                  <p className="template-group-label">{category.label}</p>
                  <p className="template-group-hint">{category.hint}</p>
                </div>
                <div className="template-grid">{items.map(renderTile)}</div>
              </div>
            );
          })}

          {(grouped.get("other") ?? []).length > 0 && (
            <div className="wizard-panel template-group">
              <div className="template-group-head">
                <p className="template-group-label">{copy.templates.other}</p>
              </div>
              <div className="template-grid">
                {(grouped.get("other") ?? []).map(renderTile)}
              </div>
            </div>
          )}

          <div className="template-from-scratch">
            <button
              className={`template-from-scratch-btn ${selected === null ? "selected" : ""}`}
              onClick={() => onSelect(null)}
              type="button"
            >
              <span className="template-from-scratch-icon">+</span>
              {copy.templates.scratchTitle}
              <span className="template-from-scratch-sub">
                {copy.templates.scratchSubhead}
              </span>
            </button>
          </div>
        </>
      )}

      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack} type="button">
          {copy.common.back}
        </button>
        <button className="btn btn-primary" onClick={onNext} type="button">
          {copy.templates.next}
          <ArrowIcon />
          <EnterHint />
        </button>
      </div>
    </div>
  );
}

/* ─── Step 3: Identity ─── */

interface IdentityStepProps {
  copy: WizardCopy;
  company: string;
  description: string;
  priority: string;
  onChangeCompany: (v: string) => void;
  onChangeDescription: (v: string) => void;
  onChangePriority: (v: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function IdentityStep({
  copy,
  company,
  description,
  priority,
  onChangeCompany,
  onChangeDescription,
  onChangePriority,
  onNext,
  onBack,
}: IdentityStepProps) {
  const canContinue =
    company.trim().length > 0 && description.trim().length > 0;

  return (
    <div className="wizard-step">
      <div className="wizard-panel">
        <p className="wizard-panel-title">{copy.identity.title}</p>
        <div className="form-group">
          <label className="label" htmlFor="wiz-company">
            {copy.identity.companyLabel}{" "}
            <span style={{ color: "var(--red)" }}>*</span>
          </label>
          <input
            className="input"
            id="wiz-company"
            placeholder={copy.identity.companyPlaceholder}
            autoComplete="organization"
            value={company}
            onChange={(e) => onChangeCompany(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="label" htmlFor="wiz-description">
            {copy.identity.descriptionLabel}{" "}
            <span style={{ color: "var(--red)" }}>*</span>
          </label>
          <input
            className="input"
            id="wiz-description"
            placeholder={copy.identity.descriptionPlaceholder}
            value={description}
            onChange={(e) => onChangeDescription(e.target.value)}
          />
        </div>
        <div className="form-group">
          <label className="label" htmlFor="wiz-priority">
            {copy.identity.priorityLabel}
          </label>
          <input
            className="input"
            id="wiz-priority"
            placeholder={copy.identity.priorityPlaceholder}
            value={priority}
            onChange={(e) => onChangePriority(e.target.value)}
          />
        </div>
      </div>

      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack} type="button">
          {copy.common.back}
        </button>
        <button
          className="btn btn-primary"
          onClick={onNext}
          disabled={!canContinue}
          type="button"
        >
          {copy.identity.next}
          <ArrowIcon />
          <EnterHint />
        </button>
      </div>
    </div>
  );
}

/* ─── Step 4: Team Review ─── */

interface TeamStepProps {
  copy: WizardCopy;
  agents: BlueprintAgent[];
  onToggle: (slug: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function TeamStep({ copy, agents, onToggle, onNext, onBack }: TeamStepProps) {
  return (
    <div className="wizard-step">
      <div className="wizard-panel">
        <p className="wizard-panel-title">{copy.team.title}</p>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            margin: "-8px 0 12px 0",
          }}
        >
          {copy.team.description}
        </p>

        {agents.length === 0 ? (
          <div className="wiz-team-empty">{copy.team.empty}</div>
        ) : (
          <div className="wiz-team-grid">
            {agents.map((agent) => (
              <TeamAgentTile
                key={agent.slug}
                copy={copy}
                agent={agent}
                onToggle={onToggle}
              />
            ))}
          </div>
        )}
      </div>

      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack} type="button">
          {copy.common.back}
        </button>
        <button className="btn btn-primary" onClick={onNext} type="button">
          {copy.common.continue}
          <ArrowIcon />
          <EnterHint />
        </button>
      </div>
    </div>
  );
}

function TeamAgentTile({
  copy,
  agent,
  onToggle,
}: {
  copy: WizardCopy;
  agent: BlueprintAgent;
  onToggle: (slug: string) => void;
}) {
  // Lead agent is always included and cannot be unchecked here.
  // The backend also refuses to remove or disable any BuiltIn
  // member, so this is UI belt + server-side braces.
  const locked = agent.built_in === true;
  return (
    <button
      className={`wiz-team-tile ${agent.checked ? "selected" : ""} ${locked ? "locked" : ""}`}
      onClick={() => !locked && onToggle(agent.slug)}
      type="button"
      disabled={locked}
      aria-disabled={locked}
      title={locked ? copy.team.leadTitle : undefined}
    >
      <div className="wiz-team-check">
        {agent.checked ? <CheckIcon /> : null}
      </div>
      <div>
        {agent.emoji ? (
          <span style={{ marginRight: 6 }}>{agent.emoji}</span>
        ) : null}
        <span className="wiz-team-name">{agent.name}</span>
        {locked ? (
          <span className="wiz-team-lead-badge">{copy.team.leadBadge}</span>
        ) : null}
        {agent.role ? <div className="wiz-team-role">{agent.role}</div> : null}
      </div>
    </button>
  );
}

/* ─── Step 5: Setup ─── */

interface SetupStepProps {
  copy: WizardCopy;
  prereqs: PrereqResult[];
  prereqsLoading: boolean;
  runtimePriority: string[];
  onToggleRuntime: (label: string) => void;
  onReorderRuntime: (label: string, direction: -1 | 1) => void;
  apiKeys: Record<string, string>;
  onChangeApiKey: (key: string, value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function detectedBinary(
  prereqs: PrereqResult[],
  binary: string,
): PrereqResult | undefined {
  return prereqs.find((p) => p.name === binary);
}

function primaryInstalledRuntimeLabel(
  runtimePriority: string[],
  prereqs: PrereqResult[],
): string | undefined {
  return runtimePriority.find((label) => {
    const spec = RUNTIMES.find((runtime) => runtime.label === label);
    return Boolean(spec && detectedBinary(prereqs, spec.binary)?.found);
  });
}

function RuntimeGrid({
  copy,
  prereqsLoading,
  prereqs,
  runtimePriority,
  onToggleRuntime,
}: {
  copy: WizardCopy;
  prereqsLoading: boolean;
  prereqs: PrereqResult[];
  runtimePriority: string[];
  onToggleRuntime: (label: string) => void;
}) {
  if (prereqsLoading) {
    return (
      <div
        style={{
          color: "var(--text-tertiary)",
          fontSize: 13,
          padding: "8px 0",
        }}
      >
        {copy.setup.checkingRuntimes}
      </div>
    );
  }

  return (
    <div className="runtime-grid">
      {RUNTIMES.map((spec) => (
        <RuntimeTile
          key={spec.label}
          copy={copy}
          spec={spec}
          detection={detectedBinary(prereqs, spec.binary)}
          priorityIdx={runtimePriority.indexOf(spec.label)}
          onToggleRuntime={onToggleRuntime}
        />
      ))}
    </div>
  );
}

function RuntimeTile({
  copy,
  spec,
  detection,
  priorityIdx,
  onToggleRuntime,
}: {
  copy: WizardCopy;
  spec: RuntimeSpec;
  detection: PrereqResult | undefined;
  priorityIdx: number;
  onToggleRuntime: (label: string) => void;
}) {
  const installed = Boolean(detection?.found);
  const selected = priorityIdx >= 0;
  const classes = [
    "runtime-tile",
    selected ? "selected" : "",
    installed ? "" : "disabled",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      className={classes}
      onClick={() => {
        if (!installed) return;
        onToggleRuntime(spec.label);
      }}
      type="button"
      disabled={!installed}
      aria-disabled={!installed}
      aria-pressed={selected}
      title={runtimeTileTitle(spec, detection, installed, copy)}
    >
      {selected ? (
        <span
          className="runtime-priority-badge"
          title={copy.setup.priorityTitle(priorityIdx + 1)}
        >
          {priorityIdx + 1}
        </span>
      ) : null}
      <div className="runtime-tile-head">
        <span
          className={`runtime-tile-status ${installed ? "installed" : ""}`}
          aria-hidden="true"
        />
        {spec.label}
      </div>
      <RuntimeTileMeta
        copy={copy}
        spec={spec}
        detection={detection}
        installed={installed}
      />
    </button>
  );
}

function runtimeTileTitle(
  spec: RuntimeSpec,
  detection: PrereqResult | undefined,
  installed: boolean,
  copy: WizardCopy,
): string {
  if (!installed) return copy.setup.notInstalledTitle(spec.label);
  return detection?.version
    ? `${spec.label} — ${detection.version}`
    : spec.label;
}

function RuntimeTileMeta({
  copy,
  spec,
  detection,
  installed,
}: {
  copy: WizardCopy;
  spec: RuntimeSpec;
  detection: PrereqResult | undefined;
  installed: boolean;
}) {
  if (installed) {
    return (
      <div className="runtime-tile-meta">
        {detection?.version ? detection.version : copy.setup.installed}
      </div>
    );
  }

  return (
    <div className="runtime-tile-meta">
      {copy.setup.notInstalled}{" "}
      <a
        className="runtime-tile-install-link"
        href={spec.installUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
      >
        {copy.setup.install}
      </a>
    </div>
  );
}

function SetupStep({
  copy,
  prereqs,
  prereqsLoading,
  runtimePriority,
  onToggleRuntime,
  onReorderRuntime,
  apiKeys,
  onChangeApiKey,
  onNext,
  onBack,
}: SetupStepProps) {
  // A runtime is usable only when its binary is actually present on PATH.
  // "Selected and installed" drives whether we can continue without keys.
  const hasInstalledSelection = hasInstalledRuntimeSelection(
    runtimePriority,
    prereqs,
  );
  const hasAnyApiKey = Object.values(apiKeys).some((v) => v.trim().length > 0);
  const canContinue = hasInstalledSelection || hasAnyApiKey;
  const primaryRuntimeLabel =
    primaryInstalledRuntimeLabel(runtimePriority, prereqs) ??
    runtimePriority[0] ??
    "CLI";

  return (
    <div className="wizard-step">
      <div className="wizard-panel">
        <p className="wizard-panel-title">{copy.setup.title}</p>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            margin: "-8px 0 12px 0",
          }}
        >
          {copy.setup.description}
        </p>

        <RuntimeGrid
          copy={copy}
          prereqsLoading={prereqsLoading}
          prereqs={prereqs}
          runtimePriority={runtimePriority}
          onToggleRuntime={onToggleRuntime}
        />

        {runtimePriority.length > 1 && (
          <div className="runtime-priority-controls">
            <p className="runtime-priority-title">{copy.setup.fallbackOrder}</p>
            <p className="runtime-priority-hint">{copy.setup.fallbackHint}</p>
            {runtimePriority.map((label, idx) => (
              <div key={label} className="runtime-priority-row">
                <span className="runtime-priority-row-rank">#{idx + 1}</span>
                <span className="runtime-priority-row-label">{label}</span>
                <button
                  type="button"
                  className="runtime-priority-btn"
                  onClick={() => onReorderRuntime(label, -1)}
                  disabled={idx === 0}
                  aria-label={copy.setup.moveUp(label)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="runtime-priority-btn"
                  onClick={() => onReorderRuntime(label, 1)}
                  disabled={idx === runtimePriority.length - 1}
                  aria-label={copy.setup.moveDown(label)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="runtime-priority-btn"
                  onClick={() => onToggleRuntime(label)}
                  aria-label={copy.setup.remove(label)}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {hasInstalledSelection ? (
          <RuntimeReadyCard copy={copy} label={primaryRuntimeLabel} />
        ) : null}

        <ApiKeyFallbackPanel
          copy={copy}
          hasInstalledSelection={hasInstalledSelection}
          apiKeys={apiKeys}
          onChangeApiKey={onChangeApiKey}
        />
      </div>

      <div className="wizard-panel">
        <p className="wizard-panel-title">{copy.setup.memoryTitle}</p>
        <p
          style={{
            fontSize: 12,
            color: "var(--text-secondary)",
            margin: "-8px 0 12px 0",
          }}
        >
          {copy.setup.memoryDescription}
        </p>
        <div className="runtime-grid">
          <div
            className="runtime-tile selected"
            title={copy.setup.memoryOptions.markdown.hint}
          >
            <div style={{ fontWeight: 600 }}>
              {copy.setup.memoryOptions.markdown.label}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "var(--text-tertiary)",
                marginTop: 4,
                fontWeight: 400,
              }}
            >
              {copy.setup.memoryOptions.markdown.hint}
            </div>
          </div>
        </div>
      </div>

      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack} type="button">
          {copy.common.back}
        </button>
        <button
          className="btn btn-primary"
          onClick={onNext}
          disabled={!canContinue}
          type="button"
        >
          {copy.setup.next}
          <ArrowIcon />
          <EnterHint />
        </button>
      </div>
    </div>
  );
}

function RuntimeReadyCard({
  copy,
  label,
}: {
  copy: WizardCopy;
  label: string;
}) {
  return (
    <div className="runtime-ready-card">
      <span className="runtime-ready-glyph" aria-hidden="true">
        ✓
      </span>
      <div>
        <p className="runtime-ready-title">
          {copy.setup.runtimeReadyTitle(label)}
        </p>
        <p className="runtime-ready-hint">{copy.setup.runtimeReadyHint}</p>
      </div>
    </div>
  );
}

function ApiKeyFallbackPanel({
  copy,
  hasInstalledSelection,
  apiKeys,
  onChangeApiKey,
}: {
  copy: WizardCopy;
  hasInstalledSelection: boolean;
  apiKeys: Record<string, string>;
  onChangeApiKey: (key: string, value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const showFields = !hasInstalledSelection || open;

  return (
    <div className="setup-api-panel">
      {hasInstalledSelection ? (
        <button
          type="button"
          className="setup-disclosure"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
        >
          <span>
            {open
              ? copy.setup.apiKeysFallbackHide
              : copy.setup.apiKeysFallbackButton}
          </span>
          <span aria-hidden="true">{open ? "−" : "+"}</span>
        </button>
      ) : (
        <div className="setup-required-copy">
          <p className="setup-section-title">
            {copy.setup.apiKeysRequiredTitle}
          </p>
          <p className="setup-section-hint">{copy.setup.apiKeysRequiredHint}</p>
        </div>
      )}

      {showFields ? (
        <div className="setup-api-fields">
          {hasInstalledSelection ? (
            <p className="setup-section-hint">
              {copy.setup.apiKeysOptionalHint}
            </p>
          ) : null}
          {API_KEY_FIELDS.map((field) => (
            <div className="key-row" key={field.key}>
              <div className="key-label-wrap">
                <span className="key-label">{field.label}</span>
                <span className="key-hint">
                  {copy.setup.apiKeyHints[field.key] ?? field.hint}
                </span>
              </div>
              <div className="key-input-wrap">
                <input
                  className="input"
                  type="password"
                  placeholder={field.key}
                  value={apiKeys[field.key] ?? ""}
                  onChange={(e) => onChangeApiKey(field.key, e.target.value)}
                  autoComplete="off"
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/* ─── Step 6: First Task ─── */

interface TaskStepProps {
  copy: WizardCopy;
  taskTemplates: TaskTemplate[];
  selectedTaskTemplate: string | null;
  onSelectTaskTemplate: (id: string | null) => void;
  taskText: string;
  onChangeTaskText: (v: string) => void;
  onNext: () => void;
  onSkip: () => void;
  onBack: () => void;
  submitting: boolean;
}

function TaskStep({
  copy,
  taskTemplates,
  selectedTaskTemplate,
  onSelectTaskTemplate,
  taskText,
  onChangeTaskText,
  onNext,
  onSkip,
  onBack,
  submitting,
}: TaskStepProps) {
  return (
    <div className="wizard-step">
      <div className="wizard-hero">
        <h1 className="wizard-headline" style={{ fontSize: 28 }}>
          {copy.task.title}
        </h1>
        {taskTemplates.length > 0 && (
          <p className="wizard-subhead">{copy.task.subhead}</p>
        )}
      </div>

      <div>
        <textarea
          className="task-textarea task-textarea-primary"
          id="wiz-task-input"
          placeholder={copy.task.placeholder}
          value={taskText}
          onChange={(e) => onChangeTaskText(e.target.value)}
        />
        <p className="task-textarea-hint">
          <Kbd size="sm">↵</Kbd> {copy.task.newLineHint} ·{" "}
          <Kbd size="sm">{MOD_KEY}</Kbd>
          <Kbd size="sm">↵</Kbd> {copy.task.reviewSetupHint}
        </p>
      </div>

      {taskTemplates.length > 0 && (
        <div className="task-suggestions">
          <p className="task-suggestions-label">{copy.task.suggestions}</p>
          <div className="task-suggestions-list">
            {taskTemplates.map((t, idx) => {
              const isSelected = selectedTaskTemplate === t.id;
              return (
                <button
                  key={t.id}
                  className={`task-suggestion ${isSelected ? "selected" : ""}`}
                  onClick={() => {
                    const nextId = isSelected ? null : t.id;
                    onSelectTaskTemplate(nextId);
                    if (nextId) {
                      onChangeTaskText(t.prompt ?? t.name);
                    }
                  }}
                  type="button"
                >
                  <span className="task-suggestion-num">{idx + 1}</span>
                  <span className="task-suggestion-name">{t.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack} type="button">
          {copy.common.back}
        </button>
        <div className="wizard-nav-right">
          <button
            className="task-skip"
            onClick={onSkip}
            disabled={submitting}
            type="button"
          >
            {copy.task.skip}
          </button>
          <button className="btn btn-primary" onClick={onNext} type="button">
            {copy.task.next}
            <ArrowIcon />
            <EnterHint modifier={MOD_KEY} />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Step 7: Readiness Summary ─── */

// ReadinessStatus mirrors the TUI's three-state readiness color mapping
// (see internal/tui/init_flow.go readinessStatusColor): 'ready' = green
// check, 'next' = blue warning (follow-up needed), 'missing' = red.
type ReadinessStatus = "ready" | "next" | "missing";

interface ReadinessCheck {
  label: string;
  status: ReadinessStatus;
  detail: string;
}

interface ReadyStepProps {
  copy: WizardCopy;
  checks: ReadinessCheck[];
  taskText: string;
  submitting: boolean;
  onSkip: () => void;
  onSubmit: () => void;
  onBack: () => void;
}

// ReadyStep is the final review matching the TUI's InitDone readinessChecks()
// view.
function ReadyStep({
  copy,
  checks,
  taskText,
  submitting,
  onSkip,
  onSubmit,
  onBack,
}: ReadyStepProps) {
  return (
    <div className="wizard-step">
      <div className="wizard-hero">
        <h1 className="wizard-headline" style={{ fontSize: 28 }}>
          {copy.ready.title}
        </h1>
        <p className="wizard-subhead">{copy.ready.subhead}</p>
      </div>

      <div className="wizard-panel readiness-panel">
        <ul className="readiness-list">
          {checks.map((check) => (
            <li key={check.label} className="readiness-item">
              <span
                className={`readiness-glyph ${check.status}`}
                aria-hidden="true"
              >
                {check.status === "ready"
                  ? "✓"
                  : check.status === "next"
                    ? "—"
                    : "!"}
              </span>
              <div className="readiness-body">
                <div className="readiness-label">{check.label}</div>
                <div className="readiness-detail">{check.detail}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="wizard-nav">
        <button className="btn btn-ghost" onClick={onBack} type="button">
          {copy.common.back}
        </button>
        <div className="wizard-nav-right">
          <button
            className="btn btn-primary"
            onClick={taskText.trim().length === 0 ? onSkip : onSubmit}
            disabled={submitting}
            type="button"
          >
            {submitting ? copy.ready.starting : copy.ready.cta}
            {!submitting && taskText.trim().length > 0 && <EnterHint />}
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReadinessOptions {
  copy: WizardCopy;
  runtimePriority: string[];
  prereqs: PrereqResult[];
  apiKeys: Record<string, string>;
  memoryBackend: MemoryBackend;
  selectedBlueprint: string | null;
  blueprints: BlueprintTemplate[];
}

function buildReadinessChecks(options: ReadinessOptions): ReadinessCheck[] {
  return [
    {
      label: options.copy.readiness.sessionLabel,
      status: "ready",
      detail: options.copy.readiness.sessionReady,
    },
    runtimeReadinessCheck(options),
    memoryReadinessCheck(options.copy),
    githubReadinessCheck(options.copy),
    blueprintReadinessCheck(
      options.selectedBlueprint,
      options.blueprints,
      options.copy,
    ),
  ];
}

function runtimeReadinessCheck(options: ReadinessOptions): ReadinessCheck {
  const [primaryLabel] = options.runtimePriority;
  const primarySpec = primaryLabel
    ? RUNTIMES.find((runtime) => runtime.label === primaryLabel)
    : undefined;
  const primaryDetection = primarySpec
    ? detectedBinary(options.prereqs, primarySpec.binary)
    : undefined;

  if (primarySpec && primaryDetection?.found) {
    return {
      label: options.copy.readiness.runtimeLabel,
      status: "ready",
      detail: primaryDetection.version
        ? `${primarySpec.label} — ${primaryDetection.version}`
        : options.copy.readiness.runtimeInstalled(primarySpec.label),
    };
  }
  if (primarySpec) {
    return {
      label: options.copy.readiness.runtimeLabel,
      status: "next",
      detail: options.copy.readiness.runtimeSelectedMissing(primarySpec.label),
    };
  }
  return apiKeyRuntimeReadiness(options.apiKeys, options.copy);
}

function apiKeyRuntimeReadiness(
  apiKeys: Record<string, string>,
  copy: WizardCopy,
): ReadinessCheck {
  const hasAnyKey = Object.values(apiKeys).some(
    (value) => value.trim().length > 0,
  );
  return {
    label: copy.readiness.runtimeLabel,
    status: hasAnyKey ? "ready" : "missing",
    detail: hasAnyKey
      ? copy.readiness.runtimeKeyReady
      : copy.readiness.runtimeMissing,
  };
}

function memoryReadinessCheck(copy: WizardCopy): ReadinessCheck {
  return {
    label: copy.readiness.memoryLabel,
    status: "ready",
    detail: copy.readiness.memoryMarkdown,
  };
}

function githubReadinessCheck(copy: WizardCopy): ReadinessCheck {
  return {
    label: copy.readiness.githubLabel,
    status: "next",
    detail: copy.readiness.githubConnectLater,
  };
}

function blueprintReadinessCheck(
  selectedBlueprint: string | null,
  blueprints: BlueprintTemplate[],
  copy: WizardCopy,
): ReadinessCheck {
  if (selectedBlueprint === null) {
    return {
      label: copy.readiness.blueprintLabel,
      status: "ready",
      detail: copy.readiness.blueprintScratch,
    };
  }
  const blueprint = blueprints.find((item) => item.id === selectedBlueprint);
  return {
    label: copy.readiness.blueprintLabel,
    status: "ready",
    detail:
      copy.templates.display[selectedBlueprint]?.name ??
      blueprint?.name ??
      selectedBlueprint,
  };
}

type SupportedProvider = "claude-code" | "codex" | "opencode";

function providerPriorityFromLabels(
  runtimePriority: string[],
): SupportedProvider[] {
  return runtimePriority
    .map(
      (label) => RUNTIMES.find((runtime) => runtime.label === label)?.provider,
    )
    .filter((provider): provider is SupportedProvider => provider !== null);
}

interface ConfigPayloadOptions {
  memoryBackend: MemoryBackend;
  providerPriority: SupportedProvider[];
  apiKeys: Record<string, string>;
}

function buildOnboardingConfigPayload({
  memoryBackend,
  providerPriority,
  apiKeys,
}: ConfigPayloadOptions): Record<string, unknown> {
  const payload: Record<string, unknown> = { memory_backend: memoryBackend };
  addProviderConfig(payload, providerPriority);
  addGenericApiKeys(payload, apiKeys);
  return payload;
}

function addProviderConfig(
  payload: Record<string, unknown>,
  providerPriority: SupportedProvider[],
) {
  if (providerPriority.length === 0) return;
  payload.llm_provider = providerPriority[0];
  payload.llm_provider_priority = providerPriority;
}

function addTrimmedValue(
  payload: Record<string, unknown>,
  field: string,
  value: string,
) {
  const trimmed = value.trim();
  if (trimmed.length > 0) payload[field] = trimmed;
}

function addGenericApiKeys(
  payload: Record<string, unknown>,
  apiKeys: Record<string, string>,
) {
  addTrimmedValue(
    payload,
    "anthropic_api_key",
    apiKeys.ANTHROPIC_API_KEY ?? "",
  );
  addTrimmedValue(payload, "openai_api_key", apiKeys.OPENAI_API_KEY ?? "");
  addTrimmedValue(payload, "gemini_api_key", apiKeys.GOOGLE_API_KEY ?? "");
}

interface WizardKeyContext {
  step: WizardStep;
  company: string;
  description: string;
  runtimePriority: string[];
  prereqs: PrereqResult[];
  apiKeys: Record<string, string>;
  submitting: boolean;
  taskText: string;
  goTo: (step: WizardStep) => void;
  nextStep: () => void;
  finishOnboarding: (skipTask: boolean) => void | Promise<void>;
}

function handleWizardKey(e: KeyboardEvent, context: WizardKeyContext) {
  if (!shouldHandleWizardEnter(e)) return;

  const canIdentityContinue =
    context.company.trim().length > 0 && context.description.trim().length > 0;
  const canSetupContinue = canContinueSetup(context);
  advanceWizardFromKey(e, context, canIdentityContinue, canSetupContinue);
}

function shouldHandleWizardEnter(e: KeyboardEvent): boolean {
  if (e.key !== "Enter") return false;
  if (e.repeat) return false;
  const target = e.target as HTMLElement | null;
  const tag = target?.tagName;
  if (tag === "BUTTON" || tag === "A" || tag === "SELECT") return false;
  const inTextarea = tag === "TEXTAREA";
  const isSubmitCombo = e.metaKey || e.ctrlKey;
  return !(inTextarea && !isSubmitCombo);
}

function canContinueSetup(context: WizardKeyContext): boolean {
  const hasInstalledSelection = hasInstalledRuntimeSelection(
    context.runtimePriority,
    context.prereqs,
  );
  const hasAnyApiKey = Object.values(context.apiKeys).some(
    (value) => value.trim().length > 0,
  );
  return hasInstalledSelection || hasAnyApiKey;
}

function hasInstalledRuntimeSelection(
  runtimePriority: string[],
  prereqs: PrereqResult[],
): boolean {
  return runtimePriority.some((label) => {
    const spec = RUNTIMES.find((runtime) => runtime.label === label);
    if (!spec) return false;
    return Boolean(detectedBinary(prereqs, spec.binary)?.found);
  });
}

function advanceWizardFromKey(
  e: KeyboardEvent,
  context: WizardKeyContext,
  canIdentityContinue: boolean,
  canSetupContinue: boolean,
) {
  const isSubmitCombo = e.metaKey || e.ctrlKey;
  switch (context.step) {
    case "welcome":
      e.preventDefault();
      context.goTo("identity");
      return;
    case "templates":
    case "team":
      e.preventDefault();
      context.nextStep();
      return;
    case "identity":
      advanceIfAllowed(e, canIdentityContinue, context.nextStep);
      return;
    case "setup":
      advanceIfAllowed(e, canSetupContinue, context.nextStep);
      return;
    case "task":
      advanceIfAllowed(e, isSubmitCombo, context.nextStep);
      return;
    case "ready":
      submitReadyFromKey(e, context);
      return;
  }
}

function advanceIfAllowed(
  e: KeyboardEvent,
  allowed: boolean,
  nextStep: () => void,
) {
  if (!allowed) return;
  e.preventDefault();
  nextStep();
}

function submitReadyFromKey(e: KeyboardEvent, context: WizardKeyContext) {
  if (context.submitting || context.taskText.trim().length === 0) return;
  e.preventDefault();
  void context.finishOnboarding(false);
}

/* ═══════════════════════════════════════════
   Main Wizard
   ═══════════════════════════════════════════ */

interface WizardProps {
  onComplete?: () => void;
}

// biome-ignore lint/complexity/noExcessiveLinesPerFunction: This component owns the onboarding state machine; step UI is already split into subcomponents.
export function Wizard({ onComplete }: WizardProps) {
  const setOnboardingComplete = useAppStore((s) => s.setOnboardingComplete);
  const language = useAppStore((s) => s.language);
  const copy = WIZARD_COPY[language];

  // Navigation
  const [step, setStep] = useState<WizardStep>("welcome");

  // Step 2: templates
  const [blueprints, setBlueprints] = useState<BlueprintTemplate[]>([]);
  const [blueprintsLoading, setBlueprintsLoading] = useState(true);
  const [selectedBlueprint, setSelectedBlueprint] = useState<string | null>(
    null,
  );

  // Step 3: identity
  const [company, setCompany] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("");

  // Step 4: team
  const [agents, setAgents] = useState<BlueprintAgent[]>([]);

  // Step 5: setup
  const [prereqs, setPrereqs] = useState<PrereqResult[]>([]);
  const [prereqsLoading, setPrereqsLoading] = useState(true);
  // Ordered list of runtime labels (matches RUNTIMES[].label). Position in
  // the array is the fallback priority. Initially empty — we auto-populate
  // with the first installed CLI once prereqs land so the happy path still
  // works with zero clicks.
  const [runtimePriority, setRuntimePriority] = useState<string[]>([]);
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  // Matches the localized "Team wiki (default)" tile and the server-side
  // `config.ResolveMemoryBackend` default.
  const memoryBackend: MemoryBackend = "markdown";

  // Step 6: first task
  const [taskTemplates, setTaskTemplates] = useState<TaskTemplate[]>([]);
  const [selectedTaskTemplate, setSelectedTaskTemplate] = useState<
    string | null
  >(null);
  const [taskText, setTaskText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Fetch blueprints on mount
  useEffect(() => {
    let cancelled = false;
    setBlueprintsLoading(true);

    get<{ templates?: BlueprintTemplate[] }>("/onboarding/blueprints")
      .then((data) => {
        if (cancelled) return;
        const tpls = data.templates ?? [];
        setBlueprints(visibleOnboardingBlueprints(tpls));
      })
      .catch(() => {
        // Endpoint may not exist yet; continue with empty list
      })
      .finally(() => {
        if (!cancelled) setBlueprintsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch prereqs on mount so the runtime picker shows which CLIs are
  // actually installed. Auto-select the first detected runtime so users
  // with a single CLI installed don't have to click.
  useEffect(() => {
    let cancelled = false;
    setPrereqsLoading(true);

    get<{ prereqs?: PrereqResult[] } | PrereqResult[]>("/onboarding/prereqs")
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : (data.prereqs ?? []);
        setPrereqs(list);
        setRuntimePriority((current) => {
          if (current.length > 0) return current;
          const firstInstalled = RUNTIMES.find((spec) => {
            const det = list.find((p) => p.name === spec.binary);
            return Boolean(det?.found);
          });
          return firstInstalled ? [firstInstalled.label] : [];
        });
      })
      .catch(() => {
        // Broker may not expose the endpoint yet; leave prereqs empty and
        // the user can still add API keys to proceed.
      })
      .finally(() => {
        if (!cancelled) setPrereqsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const toggleRuntime = useCallback((label: string) => {
    setRuntimePriority((prev) => {
      if (prev.includes(label)) return prev.filter((l) => l !== label);
      return [...prev, label];
    });
  }, []);

  const reorderRuntime = useCallback((label: string, direction: -1 | 1) => {
    setRuntimePriority((prev) => {
      const idx = prev.indexOf(label);
      if (idx < 0) return prev;
      const next = idx + direction;
      if (next < 0 || next >= prev.length) return prev;
      const out = [...prev];
      const [item] = out.splice(idx, 1);
      out.splice(next, 0, item);
      return out;
    });
  }, []);

  // When a blueprint is selected, populate agents AND first tasks from that
  // blueprint only. Previously we flattened tasks across every blueprint, so
  // the task step showed ~26 tiles of unrelated work — including tasks from
  // blueprints the user never picked.
  useEffect(() => {
    if (selectedBlueprint === null) {
      // "Start from scratch" — preview the same 5-agent founding team the
      // broker seeds via scratchFoundingTeamBlueprint. Keep the slugs and
      // built_in flag in sync with internal/team/broker_onboarding.go.
      setAgents(SCRATCH_FOUNDING_TEAM.map((a) => ({ ...a })));
      setTaskTemplates([]);
      return;
    }
    const bp = blueprints.find((b) => b.id === selectedBlueprint);
    if (bp?.agents) {
      setAgents(
        bp.agents.map((a) => ({
          ...a,
          checked: a.checked !== false,
        })),
      );
    } else {
      setAgents([]);
    }
    const bpTasks = (bp as unknown as { tasks?: TaskTemplate[] } | undefined)
      ?.tasks;
    setTaskTemplates(Array.isArray(bpTasks) ? bpTasks : []);
    // Clear any task-template selection and suggestion-derived text when the
    // starter changes. Without this, switching presets leaves a suggestion
    // stuck in the textarea that no longer matches the new context. User-typed
    // custom text is preserved, since selectedTaskTemplate is null for that path.
    setSelectedTaskTemplate((prevSel) => {
      if (prevSel !== null) setTaskText("");
      return null;
    });
  }, [selectedBlueprint, blueprints]);

  // Navigation helpers
  const goTo = useCallback((target: WizardStep) => {
    setStep(target);
  }, []);

  const nextStep = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx < STEP_ORDER.length - 1) {
      setStep(STEP_ORDER[idx + 1]);
    }
  }, [step]);

  const prevStep = useCallback(() => {
    const idx = STEP_ORDER.indexOf(step);
    if (idx > 0) {
      setStep(STEP_ORDER[idx - 1]);
    }
  }, [step]);

  // Toggle agent selection. The lead agent (built_in) is locked: TeamStep
  // disables its button, and this guard prevents any programmatic path
  // (keyboard, devtools, future bulk toggle) from unchecking it.
  const toggleAgent = useCallback((slug: string) => {
    setAgents((prev) =>
      prev.map((a) => {
        if (a.slug !== slug) return a;
        if (a.built_in === true) return a;
        return { ...a, checked: !a.checked };
      }),
    );
  }, []);

  // API key handler
  const handleApiKeyChange = useCallback((key: string, value: string) => {
    setApiKeys((prev) => ({ ...prev, [key]: value }));
  }, []);

  const readinessChecks = buildReadinessChecks({
    copy,
    runtimePriority,
    prereqs,
    apiKeys,
    memoryBackend,
    selectedBlueprint,
    blueprints,
  });

  // Complete onboarding
  const finishOnboarding = useCallback(
    async (skipTask: boolean) => {
      setSubmitting(true);
      try {
        // Translate UI labels to the provider ids the broker validates. Only
        // labels that map to a supported provider ("claude-code", "codex",
        // "opencode") are persisted — aspirational runtimes (Cursor, Windsurf)
        // are shown in the UI but can't yet be dispatched, so we drop them
        // from the priority list we send to the server.
        const providerPriority = providerPriorityFromLabels(runtimePriority);

        // Persist memory backend + LLM provider choice + priority fallback
        // list + API keys so the broker reads them on next launch. Send as a
        // single POST — the broker's handleConfig does a non-atomic read-
        // mutate-write, so two parallel calls race and corrupt config.json.
        // Keys go through this path (not /onboarding/complete) because the
        // broker's /config endpoint is the canonical persistence surface
        // for config.APIKey, OpenAIAPIKey, AnthropicAPIKey, etc.
        const configPayload = buildOnboardingConfigPayload({
          memoryBackend,
          providerPriority,
          apiKeys,
        });
        await post("/config", configPayload).catch(() => {});

        // Primary runtime label for the onboarding payload (best-effort;
        // the broker only acts on {task, skip_task} today, but the extra
        // fields are forward-compatible).
        const primaryRuntime = runtimePriority[0] ?? "";

        await post("/onboarding/complete", {
          company,
          description,
          priority,
          runtime: primaryRuntime,
          runtime_priority: runtimePriority,
          memory_backend: memoryBackend,
          blueprint: selectedBlueprint,
          agents: agents.filter((a) => a.checked).map((a) => a.slug),
          api_keys: apiKeys,
          task: skipTask ? "" : taskText.trim(),
          skip_task: skipTask,
        });
      } catch {
        // Best-effort — the broker may not support this endpoint yet.
        // Continue to mark onboarding complete locally.
      }

      setOnboardingComplete(true);
      onComplete?.();
    },
    [
      company,
      description,
      priority,
      runtimePriority,
      selectedBlueprint,
      agents,
      apiKeys,
      taskText,
      setOnboardingComplete,
      onComplete,
    ],
  );

  // Keyboard: Enter advances each step when the step's own gate allows it,
  // so the whole wizard can be run without reaching for the mouse. Textarea
  // steps (TaskStep) keep Enter for newlines; ⌘/Ctrl+Enter advances there.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      handleWizardKey(e, {
        step,
        company,
        description,
        runtimePriority,
        prereqs,
        apiKeys,
        submitting,
        taskText,
        goTo,
        nextStep,
        finishOnboarding,
      });
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [
    step,
    company,
    description,
    runtimePriority,
    prereqs,
    apiKeys,
    submitting,
    taskText,
    goTo,
    nextStep,
    finishOnboarding,
  ]);

  return (
    <div className="wizard-container">
      <div className="wizard-body">
        <ProgressDots copy={copy} current={step} />

        {step === "welcome" && (
          <WelcomeStep copy={copy} onNext={() => goTo("identity")} />
        )}

        {step === "templates" && (
          <TemplatesStep
            copy={copy}
            templates={blueprints}
            loading={blueprintsLoading}
            selected={selectedBlueprint}
            onSelect={setSelectedBlueprint}
            onNext={nextStep}
            onBack={prevStep}
          />
        )}

        {step === "identity" && (
          <IdentityStep
            copy={copy}
            company={company}
            description={description}
            priority={priority}
            onChangeCompany={setCompany}
            onChangeDescription={setDescription}
            onChangePriority={setPriority}
            onNext={nextStep}
            onBack={prevStep}
          />
        )}

        {step === "team" && (
          <TeamStep
            copy={copy}
            agents={agents}
            onToggle={toggleAgent}
            onNext={nextStep}
            onBack={prevStep}
          />
        )}

        {step === "setup" && (
          <SetupStep
            copy={copy}
            prereqs={prereqs}
            prereqsLoading={prereqsLoading}
            runtimePriority={runtimePriority}
            onToggleRuntime={toggleRuntime}
            onReorderRuntime={reorderRuntime}
            apiKeys={apiKeys}
            onChangeApiKey={handleApiKeyChange}
            onNext={nextStep}
            onBack={prevStep}
          />
        )}

        {step === "task" && (
          <TaskStep
            copy={copy}
            taskTemplates={taskTemplates}
            selectedTaskTemplate={selectedTaskTemplate}
            onSelectTaskTemplate={setSelectedTaskTemplate}
            taskText={taskText}
            onChangeTaskText={setTaskText}
            onNext={nextStep}
            onSkip={() => {
              setTaskText("");
              setSelectedTaskTemplate(null);
              nextStep();
            }}
            onBack={prevStep}
            submitting={submitting}
          />
        )}

        {step === "ready" && (
          <ReadyStep
            copy={copy}
            checks={readinessChecks}
            taskText={taskText}
            submitting={submitting}
            onSkip={() => finishOnboarding(true)}
            onSubmit={() => finishOnboarding(false)}
            onBack={prevStep}
          />
        )}
      </div>
    </div>
  );
}
