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

type WizardStep = "welcome" | "templates" | "identity" | "task" | "ready";

// Step order: company info before blueprint. The blueprint picker is a
// decision about how the project workspace starts; it makes more sense after the
// user has anchored who they are than as the very first question.
// `ready` is the final-step readiness summary matching the TUI's InitDone
// phase (see internal/tui/init_flow.go readinessChecks()) — shows the user
// exactly what's configured before we submit.
const STEP_ORDER: readonly WizardStep[] = [
  "welcome",
  "identity",
  "templates",
  "task",
  "ready",
] as const;

// "Start from scratch" starter roster. Mirrors scratchProjectTeamBlueprint
// in internal/team/broker_onboarding.go — the broker seeds these exact slugs
// when the wizard POSTs blueprint:null. Kept in sync manually; backend is the
// source of truth, this is just the Team-step preview so users don't see an
// empty roster before confirming.
const SCRATCH_PROJECT_TEAM: readonly BlueprintAgent[] = [
  {
    slug: "ceo",
    name: "CEO",
    role: "orchestrator",
    checked: true,
    built_in: true,
  },
  { slug: "fe", name: "FE", role: "frontend", checked: true },
  { slug: "be", name: "BD", role: "backend", checked: true },
  { slug: "reviewer", name: "REV", role: "review", checked: true },
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
    agentNameLabel: string;
    agentDescriptions: Record<string, string>;
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
      identity: "Company",
      templates: "Departments",
      task: "Loop",
      ready: "Review",
    },
    welcome: {
      eyebrow: "Ready to set up",
      headline: "Create your AI Startup Office and keep control.",
      subhead:
        "Start with one company workspace for validation, marketing, sales, operations, approvals, and company memory.",
      cta: "Open company setup",
    },
    templates: {
      eyebrow: "Default AI departments",
      headline: "Name your operators.",
      subhead:
        "Start with strategy, growth, operations, and risk review. You can add specialists later.",
      loading: "Loading starters...",
      other: "Other",
      scratchTitle: "Start from scratch",
      scratchSubhead: "4-department office: CEO, Growth, Ops, Risk",
      next: "Continue",
      agentNameLabel: "Operator name",
      agentDescriptions: {
        ceo: "Orchestrates priorities, business decisions, and weekly reviews.",
        fe: "Drafts landing pages, customer-facing assets, and content.",
        be: "Maintains operating loops, records, metrics, and assets.",
        reviewer:
          "Checks claims, approvals, risks, and founder-control gates.",
      },
      categories: {
        project: {
          label: "Startup Office",
          hint: "Validation, growth, sales, operations, and review",
        },
      },
      display: {},
    },
    identity: {
      title: "Tell us about this company",
      companyLabel: "Company or workspace name",
      companyPlaceholder: "LAF-Office, or your company name",
      descriptionLabel: "One-liner description",
      descriptionPlaceholder:
        "What customer, problem, offer, or operating goal should this office own?",
      priorityLabel: "Top priority right now",
      priorityPlaceholder: "Validate paid demand and draft the first launch assets",
      next: "Name operators",
    },
    task: {
      title: "Which operating loop should run first?",
      subhead:
        "Type your own first loop, or pick from the starter's suggested sequence below.",
      placeholder:
        "e.g. Run idea validation and draft the first 100 customer plan",
      newLineHint: "new line",
      reviewSetupHint: "review setup",
      suggestions: "Suggested launch sequence",
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
      sessionLabel: "Browser session",
      sessionReady: "Cloud workspace session. No local runner required.",
      memoryLabel: "Company wiki",
      memoryMarkdown:
        "Company wiki stores goals, decisions, approvals, assets, and loop history.",
      githubLabel: "Publishing controls",
      githubConnectLater:
        "Public pages, outbound messages, spend, and customer promises stay approval-gated.",
      blueprintLabel: "Starter",
      blueprintScratch: "Start from scratch (4-department startup office).",
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
      identity: "회사",
      templates: "부서",
      task: "첫 루프",
      ready: "검토",
    },
    welcome: {
      eyebrow: "설정 준비 완료",
      headline: "창업자가 통제하는 AI Startup Office를 만듭니다.",
      subhead:
        "검증, 마케팅, 세일즈, 운영, 승인, 회사 메모리를 담는 하나의 회사 워크스페이스로 시작합니다.",
      cta: "회사 설정 열기",
    },
    templates: {
      eyebrow: "기본 AI 부서",
      headline: "오퍼레이터의 이름을 지어주세요.",
      subhead:
        "전략, 성장, 운영, 리스크 검토로 시작합니다. 필요한 전문가는 나중에 추가할 수 있습니다.",
      loading: "시작 방식 불러오는 중...",
      other: "기타",
      scratchTitle: "처음부터 시작",
      scratchSubhead: "4개 부서 오피스: CEO, Growth, Ops, Risk",
      next: "계속",
      agentNameLabel: "오퍼레이터 이름",
      agentDescriptions: {
        ceo: "우선순위, 사업 판단, 주간 리뷰를 조율합니다.",
        fe: "랜딩 페이지, 고객-facing 자산, 콘텐츠 초안을 만듭니다.",
        be: "운영 루프, 기록, 지표, 자산 관리를 맡습니다.",
        reviewer: "주장, 승인, 리스크, 창업자 통제 기준을 확인합니다.",
      },
      categories: {
        project: {
          label: "Startup Office",
          hint: "검증, 성장, 세일즈, 운영, 검토",
        },
      },
      display: {},
    },
    identity: {
      title: "이 회사에 대해 알려주세요",
      companyLabel: "회사 또는 워크스페이스 이름",
      companyPlaceholder: "LAF-Office 또는 실제 회사 이름",
      descriptionLabel: "한 줄 설명",
      descriptionPlaceholder:
        "이 오피스가 맡을 고객, 문제, 오퍼, 운영 목표는 무엇인가요?",
      priorityLabel: "지금 가장 중요한 목표",
      priorityPlaceholder: "유료 수요를 검증하고 첫 출시 자산 초안 만들기",
      next: "오퍼레이터 이름 설정",
    },
    task: {
      title: "어떤 운영 루프를 먼저 실행할까요?",
      subhead:
        "첫 루프를 직접 입력하거나 시작 방식이 제안한 순서에서 고르세요.",
      placeholder: "예: 아이디어 검증을 실행하고 첫 100명 고객 계획 초안 만들기",
      newLineHint: "줄바꿈",
      reviewSetupHint: "설정 검토",
      suggestions: "추천 런치 순서",
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
      sessionLabel: "브라우저 세션",
      sessionReady: "클라우드 워크스페이스 세션입니다. 로컬 실행기가 필요하지 않습니다.",
      memoryLabel: "회사 위키",
      memoryMarkdown:
        "회사 목표, 결정, 승인, 자산, 루프 기록을 위키에 저장합니다.",
      githubLabel: "발행 통제",
      githubConnectLater:
        "공개 페이지, 외부 메시지, 지출, 고객 약속은 승인 게이트를 거칩니다.",
      blueprintLabel: "시작 방식",
      blueprintScratch: "처음부터 시작 (4개 부서 스타트업 오피스).",
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
      <div className="wizard-actions">
        <button type="button" className="btn btn-primary" onClick={onNext}>
          {copy.welcome.cta}
          <ArrowIcon />
        </button>
      </div>
    </div>
  );
}

/* ─── Step 2: Templates ─── */

interface TemplatesStepProps {
  copy: WizardCopy;
  agents: BlueprintAgent[];
  onChangeAgentName: (slug: string, value: string) => void;
  onNext: () => void;
  onBack: () => void;
}

function TemplatesStep({
  copy,
  agents,
  onChangeAgentName,
  onNext,
  onBack,
}: TemplatesStepProps) {
  const canContinue = hasCompleteAgentNames(agents);

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

      <div className="agent-name-grid">
        {agents.map((agent) => (
          <label className="agent-name-card" key={agent.slug}>
            <span className="agent-name-role">{agent.role}</span>
            <span className="sr-only">{copy.templates.agentNameLabel}</span>
            <input
              className="input agent-name-input"
              value={agent.name}
              onChange={(e) => onChangeAgentName(agent.slug, e.target.value)}
              required={true}
            />
            <span className="agent-name-desc">
              {agentDescription(copy, agent)}
            </span>
          </label>
        ))}
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
          {copy.templates.next}
          <ArrowIcon />
        </button>
      </div>
    </div>
  );
}

function hasCompleteAgentNames(agents: BlueprintAgent[]): boolean {
  return agents.length > 0 && agents.every((agent) => agent.name.trim() !== "");
}

function agentDescription(copy: WizardCopy, agent: BlueprintAgent): string {
  return copy.templates.agentDescriptions[agent.slug] ?? agent.role;
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
        </button>
      </div>
    </div>
  );
}

/* ─── Step 4: First Task ─── */

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
          </button>
        </div>
      </div>
    </div>
  );
}

interface ReadinessOptions {
  copy: WizardCopy;
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
    memoryReadinessCheck(options.copy),
    githubReadinessCheck(options.copy),
    blueprintReadinessCheck(
      options.selectedBlueprint,
      options.blueprints,
      options.copy,
    ),
  ];
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

interface ConfigPayloadOptions {
  memoryBackend: MemoryBackend;
}

function buildOnboardingConfigPayload({
  memoryBackend,
}: ConfigPayloadOptions): Record<string, unknown> {
  const payload: Record<string, unknown> = { memory_backend: memoryBackend };
  return payload;
}

function agentNamePayload(agents: BlueprintAgent[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const agent of agents) {
    const slug = agent.slug.trim();
    const name = agent.name.trim();
    if (slug !== "" && name !== "") out[slug] = name;
  }
  return out;
}

interface WizardKeyContext {
  step: WizardStep;
  company: string;
  description: string;
  agents: BlueprintAgent[];
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
  const canAgentsContinue = hasCompleteAgentNames(context.agents);
  advanceWizardFromKey(e, context, canIdentityContinue, canAgentsContinue);
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

function advanceWizardFromKey(
  e: KeyboardEvent,
  context: WizardKeyContext,
  canIdentityContinue: boolean,
  canAgentsContinue: boolean,
) {
  const isSubmitCombo = e.metaKey || e.ctrlKey;
  switch (context.step) {
    case "welcome":
      e.preventDefault();
      context.goTo("identity");
      return;
    case "templates":
      advanceIfAllowed(e, canAgentsContinue, context.nextStep);
      return;
    case "identity":
      advanceIfAllowed(e, canIdentityContinue, context.nextStep);
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

  // Step 4: agent names
  const [agents, setAgents] = useState<BlueprintAgent[]>(() =>
    SCRATCH_PROJECT_TEAM.map((agent) => ({ ...agent })),
  );

  // Project wiki is the only memory backend exposed in onboarding; keep it as
  // an internal fixed value instead of rendering a one-choice selector.
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

  // When a blueprint is selected, populate agents AND first tasks from that
  // blueprint only. Previously we flattened tasks across every blueprint, so
  // the task step showed ~26 tiles of unrelated work — including tasks from
  // blueprints the user never picked.
  useEffect(() => {
    if (selectedBlueprint === null) {
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

  const changeAgentName = useCallback((slug: string, name: string) => {
    setAgents((prev) =>
      prev.map((agent) => (agent.slug === slug ? { ...agent, name } : agent)),
    );
  }, []);

  const readinessChecks = buildReadinessChecks({
    copy,
    memoryBackend,
    selectedBlueprint,
    blueprints,
  });

  // Complete onboarding
  const finishOnboarding = useCallback(
    async (skipTask: boolean) => {
      setSubmitting(true);
      try {
        // Persist memory backend so the broker reads it on next launch. Send as a
        // single POST — the broker's handleConfig does a non-atomic read-
        // mutate-write, so two parallel calls race and corrupt config.json.
        const configPayload = buildOnboardingConfigPayload({
          memoryBackend,
        });
        await post("/config", configPayload).catch(() => {});

        await post("/onboarding/complete", {
          company,
          description,
          priority,
          memory_backend: memoryBackend,
          blueprint: selectedBlueprint,
          agents: agents.filter((a) => a.checked).map((a) => a.slug),
          agent_names: agentNamePayload(agents),
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
      selectedBlueprint,
      agents,
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
        agents,
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
    agents,
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
            agents={agents}
            onChangeAgentName={changeAgentName}
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
