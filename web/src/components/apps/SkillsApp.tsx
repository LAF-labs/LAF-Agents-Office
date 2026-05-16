import {
  type FormEvent,
  type KeyboardEvent,
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { Flash } from "iconoir-react";

import {
  createSkill,
  deleteSkill,
  getSkills,
  getUsage,
  invokeSkill,
  type Skill,
  type UsageData,
  updateSkill,
} from "../../api/client";
import {
  fetchCatalog as fetchNotebookCatalog,
  fetchReviews,
  type NotebookCatalogSummary,
  type ReviewItem,
} from "../../api/notebook";
import {
  fetchPlaybooks,
  fetchSynthesisStatus,
  type PlaybookSummary,
  type PlaybookSynthesisStatus,
} from "../../api/playbook";
import { fetchCatalog as fetchWikiCatalog } from "../../api/wiki";
import { formatTokens, formatUSD } from "../../lib/format";
import { useI18n } from "../../lib/i18n";
import { type Language, useAppStore } from "../../stores/app";
import { showNotice } from "../ui/Toast";

const SYNTHESIS_STATUS_LIMIT = 20;
const PENDING_REVIEW_STATES = new Set([
  "pending",
  "in-review",
  "changes-requested",
]);

type GrowthInboxItem = {
  id: string;
  label: string;
  detail: string;
  tone?: "warning" | "neutral";
};

type GrowthModel = {
  metrics: Array<{ label: string; value: string; detail?: string }>;
  inbox: GrowthInboxItem[];
  playbooks: PlaybookMaturityRow[];
};

type PlaybookMaturityRow = {
  playbook: PlaybookSummary;
  status: PlaybookSynthesisStatus | null;
};

type SkillPublishMode = "propose" | "create";

type SkillFormState = {
  name: string;
  title: string;
  description: string;
  content: string;
  trigger: string;
  tags: string;
  requiredPermissions: string;
  action: SkillPublishMode;
};

const EMPTY_SKILL_FORM: SkillFormState = {
  name: "",
  title: "",
  description: "",
  content: "",
  trigger: "",
  tags: "",
  requiredPermissions: "",
  action: "propose",
};

interface SkillsCopy {
  growthAria: string;
  growthKicker: string;
  growthTitle: string;
  growthDescription: string;
  growthLoopAria: string;
  growthSteps: string[];
  growthInboxTitle: string;
  growthInboxDescription: string;
  growthInboxEmpty: string;
  tokenBudgetTitle: string;
  tokenBudgetDescription: string;
  sessionTokens: string;
  totalCost: string;
  avgPromptChars: string;
  maxPromptChars: string;
  avgPacketChars: string;
  maxPacketChars: string;
  memoryInOut: string;
  broadReads: string;
  largestPromptSections: string;
  largestPacketSections: string;
  playbookMaturityTitle: string;
  playbookMaturityDescription: string;
  playbookEmpty: string;
  playbook: string;
  compiled: string;
  executions: string;
  lastSynthesis: string;
  pending: string;
  source: string;
  compiledStatus: string;
  pendingStatus: string;
  openWiki: string;
  sharedSkills: string;
  sharedSkillsMetricDetail: (count: string) => string;
  proposedSkills: string;
  proposedSkillsDetail: string;
  playbooks: string;
  playbooksMetricDetail: (count: string) => string;
  executionLogs: string;
  executionLogsDetail: string;
  pendingPromotion: string;
  pendingPromotionDetail: (count: string) => string;
  learnedUpdates: string;
  learnedUpdatesDetail: (count: string) => string;
  proposedSkillLabel: (name: string) => string;
  activationReviewNeeded: string;
  reviewLabel: (name: string) => string;
  notebookPromotionReviewNeeded: string;
  compilePendingLabel: (name: string) => string;
  learningPendingLabel: (name: string) => string;
  executionsSinceSynthesis: (count: number) => string;
  skillAria: string;
  skillKicker: string;
  skillTitle: string;
  skillDescription: string;
  skillLoading: string;
  skillLoadError: string;
  newSkill: string;
  requiredField: string;
  recommendedField: string;
  editorCreateTitle: string;
  editorEditTitle: string;
  editorDescription: string;
  editorRequiredDescription: string;
  editorRecommendedDescription: string;
  skillName: string;
  skillNamePlaceholder: string;
  title: string;
  titlePlaceholder: string;
  shortSummary: string;
  shortSummaryPlaceholder: string;
  triggerHint: string;
  triggerPlaceholder: string;
  tags: string;
  tagsPlaceholder: string;
  permissions: string;
  permissionsPlaceholder: string;
  registrationMode: string;
  needsApproval: string;
  useImmediately: string;
  instructions: string;
  instructionsPlaceholder: string;
  updateSkill: string;
  submitForApproval: string;
  registerSkill: string;
  saving: string;
  cancelEdit: string;
  closeEditor: string;
  sharedTeamSkillsTitle: string;
  sharedTeamSkillsDescription: string;
  noSkills: string;
  skillColumn: string;
  descriptionColumn: string;
  statusColumn: string;
  updatedColumn: string;
  usageColumn: string;
  lastRunColumn: string;
  actionsColumn: string;
  untitled: string;
  approve: string;
  reject: string;
  edit: string;
  delete: string;
  deleting: string;
  invoke: string;
  invoking: string;
  invoked: string;
  skillApproved: string;
  skillRejected: string;
  skillUpdateFailed: (message: string) => string;
  invokeFailed: (message: string) => string;
  archiveConfirm: (name: string) => string;
  skillArchived: string;
  skillArchiveFailed: (message: string) => string;
  skillUpdated: string;
  skillSubmitted: string;
  skillRegistered: string;
  skillSaveFailed: (message: string) => string;
  skillNameRequired: string;
  instructionsRequired: string;
  dashboardSkillsError: string;
  dashboardNotebookError: string;
  dashboardUsageError: string;
  status: Record<string, string>;
}

const SKILLS_COPY = {
  en: {
    growthAria: "Growth Center",
    growthKicker: "Local-first agent learning",
    growthTitle: "Growth Center",
    growthDescription:
      "Notebook drafts become reviewed wiki memory, playbooks compile into skills, and execution logs feed the next version of the workspace.",
    growthLoopAria: "Workspace growth loop",
    growthSteps: [
      "Notebook drafts",
      "Review queue",
      "Wiki playbooks",
      "Compiled skills",
      "Invocations",
      "Learned updates",
    ],
    growthInboxTitle: "Growth inbox",
    growthInboxDescription:
      "Signals that need curation before the workspace can compound.",
    growthInboxEmpty: "No growth actions waiting.",
    tokenBudgetTitle: "Token/context budget",
    tokenBudgetDescription:
      "Actual usage plus char-based diagnostics from the broker.",
    sessionTokens: "Session tokens",
    totalCost: "Total cost",
    avgPromptChars: "Avg prompt chars",
    maxPromptChars: "Max prompt chars",
    avgPacketChars: "Avg packet chars",
    maxPacketChars: "Max packet chars",
    memoryInOut: "Memory in/out",
    broadReads: "Broad reads",
    largestPromptSections: "Largest prompt sections",
    largestPacketSections: "Largest packet sections",
    playbookMaturityTitle: "Playbook maturity",
    playbookMaturityDescription:
      "Source playbooks, compiled skill status, executions, and synthesis lag.",
    playbookEmpty:
      "No playbooks yet. Promote a reusable workflow into the wiki to start the loop.",
    playbook: "Playbook",
    compiled: "Compiled",
    executions: "Executions",
    lastSynthesis: "Last synthesis",
    pending: "Pending",
    source: "Source",
    compiledStatus: "compiled",
    pendingStatus: "pending",
    openWiki: "Open wiki",
    sharedSkills: "Shared skills",
    sharedSkillsMetricDetail: (count) => `${count} active`,
    proposedSkills: "Proposed skills",
    proposedSkillsDetail: "awaiting activation",
    playbooks: "Playbooks",
    playbooksMetricDetail: (count) => `${count} compiled`,
    executionLogs: "Execution logs",
    executionLogsDetail: "recorded outcomes",
    pendingPromotion: "Pending promotion",
    pendingPromotionDetail: (count) => `${count} notebook entries`,
    learnedUpdates: "Learned updates",
    learnedUpdatesDetail: (count) => `${count} wiki articles`,
    proposedSkillLabel: (name) => `Proposed skill: ${name}`,
    activationReviewNeeded: "Needs activation review.",
    reviewLabel: (name) => `Review: ${name}`,
    notebookPromotionReviewNeeded: "Notebook promotion needs review.",
    compilePendingLabel: (name) => `Compile pending: ${name}`,
    learningPendingLabel: (name) => `Learning pending: ${name}`,
    executionsSinceSynthesis: (count) =>
      `${count} execution${count === 1 ? "" : "s"} since last synthesis.`,
    skillAria: "Skills",
    skillKicker: "Team skill registry",
    skillTitle: "Skills",
    skillDescription:
      "Register reusable instructions, approve agent proposals, and keep the team skill list up to date without leaving this screen.",
    skillLoading: "Loading skills...",
    skillLoadError: "Could not load skills.",
    newSkill: "New skill",
    requiredField: "Required",
    recommendedField: "Recommended",
    editorCreateTitle: "Register a skill manually",
    editorEditTitle: "Edit skill",
    editorDescription:
      "A skill is a reusable instruction the team can call with / in chat. Keep the name short and write the steps clearly.",
    editorRequiredDescription:
      "These fields are required so the skill can be found and executed reliably.",
    editorRecommendedDescription:
      "Recommended fields help teammates understand when and why to use the skill.",
    skillName: "Skill name",
    skillNamePlaceholder: "daily-standup",
    title: "Title",
    titlePlaceholder: "Daily standup",
    shortSummary: "Short summary",
    shortSummaryPlaceholder: "Collect blockers and next actions from the team",
    triggerHint: "Trigger hint",
    triggerPlaceholder: "/daily-standup",
    tags: "Tags",
    tagsPlaceholder: "ops, review",
    permissions: "Permissions",
    permissionsPlaceholder: "optional, comma separated",
    registrationMode: "Registration mode",
    needsApproval: "Needs approval",
    useImmediately: "Use immediately",
    instructions: "Instructions",
    instructionsPlaceholder:
      "Write the steps the agent should follow when this skill is used.",
    updateSkill: "Update skill",
    submitForApproval: "Submit for approval",
    registerSkill: "Register skill",
    saving: "Saving...",
    cancelEdit: "Cancel edit",
    closeEditor: "Close skill editor",
    sharedTeamSkillsTitle: "Shared team skills",
    sharedTeamSkillsDescription:
      "Skills that agents can use in this workspace. Proposed skills stay inactive until someone approves them.",
    noSkills: "No skills registered yet.",
    skillColumn: "Skill",
    descriptionColumn: "Description",
    statusColumn: "Status",
    updatedColumn: "Updated",
    usageColumn: "Usage",
    lastRunColumn: "Last run",
    actionsColumn: "Actions",
    untitled: "Untitled",
    approve: "Approve",
    reject: "Reject",
    edit: "Edit",
    delete: "Delete",
    deleting: "Deleting...",
    invoke: "Invoke",
    invoking: "Invoking...",
    invoked: "Invoked",
    skillApproved: "Skill approved.",
    skillRejected: "Skill rejected.",
    skillUpdateFailed: (message) => `Skill update failed: ${message}`,
    invokeFailed: (message) => `Invoke failed: ${message}`,
    archiveConfirm: (name) =>
      `Archive skill "${name}"? Agents will no longer see it in the skill list.`,
    skillArchived: "Skill archived.",
    skillArchiveFailed: (message) => `Skill archive failed: ${message}`,
    skillUpdated: "Skill updated.",
    skillSubmitted: "Skill submitted for approval.",
    skillRegistered: "Skill registered.",
    skillSaveFailed: (message) => `Skill save failed: ${message}`,
    skillNameRequired: "Skill name is required.",
    instructionsRequired: "Instructions are required.",
    dashboardSkillsError: "Could not load shared skills for dashboard counts.",
    dashboardNotebookError: "Could not load notebook growth signals.",
    dashboardUsageError: "Could not load token and context budget diagnostics.",
    status: {
      active: "active",
      proposed: "proposed",
      rejected: "rejected",
      archived: "archived",
    },
  },
  ko: {
    growthAria: "성장 센터",
    growthKicker: "팀 지식이 쌓이는 흐름",
    growthTitle: "성장 센터",
    growthDescription:
      "노트북 초안은 검토된 위키 지식이 되고, 플레이북은 스킬로 정리되며, 실행 기록은 다음 개선에 쓰입니다.",
    growthLoopAria: "워크스페이스 성장 흐름",
    growthSteps: [
      "노트북 초안",
      "검토 대기열",
      "위키 플레이북",
      "컴파일된 스킬",
      "실행 기록",
      "학습된 업데이트",
    ],
    growthInboxTitle: "처리할 성장 항목",
    growthInboxDescription:
      "팀 지식으로 쌓이기 전에 사람이 확인하거나 정리해야 하는 항목입니다.",
    growthInboxEmpty: "지금 처리할 성장 항목이 없습니다.",
    tokenBudgetTitle: "토큰/컨텍스트 사용량",
    tokenBudgetDescription:
      "브로커가 실제 사용량과 프롬프트 크기 진단을 보여줍니다.",
    sessionTokens: "세션 토큰",
    totalCost: "전체 비용",
    avgPromptChars: "평균 프롬프트 글자 수",
    maxPromptChars: "최대 프롬프트 글자 수",
    avgPacketChars: "평균 패킷 글자 수",
    maxPacketChars: "최대 패킷 글자 수",
    memoryInOut: "메모리 포함/제외",
    broadReads: "넓은 범위 읽기",
    largestPromptSections: "가장 큰 프롬프트 구간",
    largestPacketSections: "가장 큰 패킷 구간",
    playbookMaturityTitle: "플레이북 성숙도",
    playbookMaturityDescription:
      "원본 플레이북, 스킬화 여부, 실행 횟수, 학습 반영 상태를 봅니다.",
    playbookEmpty:
      "아직 플레이북이 없습니다. 반복되는 작업을 위키로 승격하면 흐름이 시작됩니다.",
    playbook: "플레이북",
    compiled: "스킬화",
    executions: "실행",
    lastSynthesis: "마지막 반영",
    pending: "대기",
    source: "원본",
    compiledStatus: "완료",
    pendingStatus: "대기",
    openWiki: "위키 열기",
    sharedSkills: "공유 스킬",
    sharedSkillsMetricDetail: (count) => `활성 ${count}개`,
    proposedSkills: "승인 대기 스킬",
    proposedSkillsDetail: "활성화 대기 중",
    playbooks: "플레이북",
    playbooksMetricDetail: (count) => `스킬화 ${count}개`,
    executionLogs: "실행 기록",
    executionLogsDetail: "기록된 실행 결과",
    pendingPromotion: "승격 대기",
    pendingPromotionDetail: (count) => `노트북 항목 ${count}개`,
    learnedUpdates: "학습 반영",
    learnedUpdatesDetail: (count) => `위키 문서 ${count}개`,
    proposedSkillLabel: (name) => `승인 대기 스킬: ${name}`,
    activationReviewNeeded: "활성화 검토가 필요합니다.",
    reviewLabel: (name) => `검토: ${name}`,
    notebookPromotionReviewNeeded: "노트북 승격 검토가 필요합니다.",
    compilePendingLabel: (name) => `스킬화 대기: ${name}`,
    learningPendingLabel: (name) => `학습 반영 대기: ${name}`,
    executionsSinceSynthesis: (count) => `마지막 반영 이후 실행 ${count}회`,
    skillAria: "스킬",
    skillKicker: "팀 스킬 관리",
    skillTitle: "스킬",
    skillDescription:
      "반복해서 쓸 지시문을 등록하고, 에이전트가 제안한 스킬을 승인하거나 수정합니다.",
    skillLoading: "스킬을 불러오는 중...",
    skillLoadError: "스킬을 불러오지 못했습니다.",
    newSkill: "새 스킬",
    requiredField: "필수",
    recommendedField: "권장",
    editorCreateTitle: "스킬 직접 등록",
    editorEditTitle: "스킬 수정",
    editorDescription:
      "스킬은 채팅에서 /로 불러 쓸 수 있는 재사용 지시문입니다. 이름은 짧게, 실행 단계는 명확하게 적어주세요.",
    editorRequiredDescription:
      "스킬을 안정적으로 찾고 실행하려면 아래 항목이 필요합니다.",
    editorRecommendedDescription:
      "권장 항목을 채우면 팀원이 언제 왜 이 스킬을 써야 하는지 이해하기 쉬워집니다.",
    skillName: "스킬 이름",
    skillNamePlaceholder: "daily-standup",
    title: "제목",
    titlePlaceholder: "데일리 스탠드업",
    shortSummary: "한 줄 설명",
    shortSummaryPlaceholder: "팀의 막힌 점과 다음 행동을 정리합니다",
    triggerHint: "호출 힌트",
    triggerPlaceholder: "/daily-standup",
    tags: "태그",
    tagsPlaceholder: "운영, 검토",
    permissions: "권한",
    permissionsPlaceholder: "선택 사항, 쉼표로 구분",
    registrationMode: "등록 방식",
    needsApproval: "승인 후 사용",
    useImmediately: "바로 사용",
    instructions: "실행 지시문",
    instructionsPlaceholder:
      "이 스킬을 사용할 때 에이전트가 따라야 할 단계를 적어주세요.",
    updateSkill: "스킬 수정",
    submitForApproval: "승인 요청",
    registerSkill: "스킬 등록",
    saving: "저장 중...",
    cancelEdit: "수정 취소",
    closeEditor: "스킬 편집기 닫기",
    sharedTeamSkillsTitle: "팀 공유 스킬",
    sharedTeamSkillsDescription:
      "이 워크스페이스의 에이전트가 사용할 수 있는 스킬입니다. 승인 대기 스킬은 승인 전까지 비활성 상태입니다.",
    noSkills: "등록된 스킬이 없습니다.",
    skillColumn: "스킬",
    descriptionColumn: "설명",
    statusColumn: "상태",
    updatedColumn: "수정일",
    usageColumn: "사용",
    lastRunColumn: "마지막 실행",
    actionsColumn: "작업",
    untitled: "제목 없음",
    approve: "승인",
    reject: "거절",
    edit: "수정",
    delete: "삭제",
    deleting: "삭제 중...",
    invoke: "실행",
    invoking: "실행 중...",
    invoked: "실행됨",
    skillApproved: "스킬을 승인했습니다.",
    skillRejected: "스킬을 거절했습니다.",
    skillUpdateFailed: (message) => `스킬 업데이트 실패: ${message}`,
    invokeFailed: (message) => `스킬 실행 실패: ${message}`,
    archiveConfirm: (name) =>
      `"${name}" 스킬을 삭제할까요? 삭제하면 에이전트 스킬 목록에서 보이지 않습니다.`,
    skillArchived: "스킬을 삭제했습니다.",
    skillArchiveFailed: (message) => `스킬 삭제 실패: ${message}`,
    skillUpdated: "스킬을 수정했습니다.",
    skillSubmitted: "스킬 승인 요청을 보냈습니다.",
    skillRegistered: "스킬을 등록했습니다.",
    skillSaveFailed: (message) => `스킬 저장 실패: ${message}`,
    skillNameRequired: "스킬 이름을 입력해주세요.",
    instructionsRequired: "실행 지시문을 입력해주세요.",
    dashboardSkillsError: "성장 센터의 스킬 수를 불러오지 못했습니다.",
    dashboardNotebookError: "노트북 성장 신호를 불러오지 못했습니다.",
    dashboardUsageError: "토큰과 컨텍스트 사용량 진단을 불러오지 못했습니다.",
    status: {
      active: "활성",
      proposed: "승인 대기",
      rejected: "거절됨",
      archived: "삭제됨",
    },
  },
} satisfies Record<Language, SkillsCopy>;

function useSkillsCopy(): SkillsCopy {
  const { language } = useI18n();
  return SKILLS_COPY[language] ?? SKILLS_COPY.en;
}

export function GrowthCenterApp() {
  const copy = useSkillsCopy();
  return (
    <section className="skills-growth" aria-label={copy.growthAria}>
      <GrowthCenterHeader copy={copy} />
      <SkillsDashboard />
    </section>
  );
}

export function SkillsApp() {
  const copy = useSkillsCopy();
  return (
    <section className="skills-growth" aria-label={copy.skillAria}>
      <SkillManager />
    </section>
  );
}

function GrowthCenterHeader({ copy }: { copy: SkillsCopy }) {
  return (
    <div className="skills-hero">
      <div>
        <p className="skills-kicker">{copy.growthKicker}</p>
        <h2>{copy.growthTitle}</h2>
        <p>{copy.growthDescription}</p>
      </div>
    </div>
  );
}

function SkillsDashboard() {
  const copy = useSkillsCopy();
  const skillsQuery = useQuery({
    queryKey: ["skills"],
    queryFn: () => getSkills(),
    refetchInterval: 30_000,
  });
  const playbooksQuery = useQuery({
    queryKey: ["playbooks"],
    queryFn: fetchPlaybooks,
    refetchInterval: 30_000,
  });
  const wikiQuery = useQuery({
    queryKey: ["wiki-catalog"],
    queryFn: fetchWikiCatalog,
    refetchInterval: 60_000,
  });
  const notebookQuery = useQuery({
    queryKey: ["notebook-catalog"],
    queryFn: fetchNotebookCatalog,
    refetchInterval: 60_000,
  });
  const reviewsQuery = useQuery({
    queryKey: ["reviews-growth-center"],
    queryFn: fetchReviews,
    refetchInterval: 30_000,
  });
  const usageQuery = useQuery({
    queryKey: ["usage"],
    queryFn: getUsage,
    refetchInterval: 15_000,
  });

  const skills = skillsQuery.data?.skills ?? [];
  const playbooks = playbooksQuery.data ?? [];
  const statusTargets = useMemo(
    () =>
      sortPlaybooksForStatusFetch(playbooks).slice(0, SYNTHESIS_STATUS_LIMIT),
    [playbooks],
  );
  const statusQueries = useQueries({
    queries: statusTargets.map((playbook) => ({
      queryKey: ["playbook-synthesis-status", playbook.slug],
      queryFn: () => fetchSynthesisStatus(playbook.slug),
      staleTime: 30_000,
    })),
  });

  const synthesisStatuses = useMemo(() => {
    const map = new Map<string, PlaybookSynthesisStatus | null>();
    statusTargets.forEach((playbook, index) => {
      map.set(playbook.slug, statusQueries[index]?.data ?? null);
    });
    return map;
  }, [statusTargets, statusQueries]);

  const model = buildGrowthModel({
    skills,
    playbooks,
    statuses: synthesisStatuses,
    wikiArticleCount: wikiQuery.data?.length ?? 0,
    notebook: notebookQuery.data,
    reviews: reviewsQuery.data ?? [],
    copy,
  });

  return (
    <>
      <GrowthLoop copy={copy} />
      <MetricStrip metrics={model.metrics} />
      <div className="skills-dashboard-grid">
        <GrowthInbox copy={copy} items={model.inbox} />
        <TokenBudgetPanel copy={copy} usage={usageQuery.data} />
      </div>
      <PlaybookMaturity copy={copy} rows={model.playbooks} />
      {skillsQuery.error ? (
        <InlineError message={copy.dashboardSkillsError} />
      ) : null}
      {notebookQuery.error ? (
        <InlineError message={copy.dashboardNotebookError} />
      ) : null}
      {usageQuery.error ? (
        <InlineError message={copy.dashboardUsageError} />
      ) : null}
    </>
  );
}

function GrowthLoop({ copy }: { copy: SkillsCopy }) {
  return (
    <div className="skills-loop" role="list" aria-label={copy.growthLoopAria}>
      {copy.growthSteps.map((step, index) => (
        <div className="skills-loop-step" key={step} role="listitem">
          <span className="skills-loop-index">{index + 1}</span>
          <span>{step}</span>
        </div>
      ))}
    </div>
  );
}

function MetricStrip({
  metrics,
}: {
  metrics: Array<{ label: string; value: string; detail?: string }>;
}) {
  return (
    <div className="skills-metric-strip">
      {metrics.map((metric) => (
        <div className="skills-metric" key={metric.label}>
          <span>{metric.label}</span>
          <strong>{metric.value}</strong>
          {metric.detail ? <small>{metric.detail}</small> : null}
        </div>
      ))}
    </div>
  );
}

function GrowthInbox({
  copy,
  items,
}: {
  copy: SkillsCopy;
  items: GrowthInboxItem[];
}) {
  return (
    <section className="skills-panel">
      <div className="skills-section-head">
        <h3>{copy.growthInboxTitle}</h3>
        <p>{copy.growthInboxDescription}</p>
      </div>
      {items.length === 0 ? (
        <div className="skills-empty-inline">{copy.growthInboxEmpty}</div>
      ) : (
        <div className="skills-inbox-list">
          {items.map((item) => (
            <div
              className={`skills-inbox-item${
                item.tone === "warning" ? " is-warning" : ""
              }`}
              key={item.id}
            >
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TokenBudgetPanel({
  copy,
  usage,
}: {
  copy: SkillsCopy;
  usage?: UsageData;
}) {
  const opt = usage?.optimization;
  const promptAvg =
    opt?.prompt_builds && opt.prompt_builds > 0 && opt.prompt_chars
      ? Math.round(opt.prompt_chars / opt.prompt_builds)
      : 0;
  const packetAvg =
    opt?.packet_builds && opt.packet_builds > 0 && opt.packet_chars
      ? Math.round(opt.packet_chars / opt.packet_builds)
      : 0;
  const promptSections = (opt?.last_prompt_sections ?? [])
    .slice()
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 4);
  const packetSections = (opt?.last_packet_sections ?? [])
    .slice()
    .sort((a, b) => b.chars - a.chars)
    .slice(0, 4);

  return (
    <section className="skills-panel">
      <div className="skills-section-head">
        <h3>{copy.tokenBudgetTitle}</h3>
        <p>{copy.tokenBudgetDescription}</p>
      </div>
      <div className="skills-budget-grid">
        <BudgetDatum
          label={copy.sessionTokens}
          value={formatTokens(usage?.session?.total_tokens ?? 0)}
        />
        <BudgetDatum
          label={copy.totalCost}
          value={formatUSD(usage?.total?.cost_usd ?? 0)}
        />
        <BudgetDatum
          label={copy.avgPromptChars}
          value={formatCount(promptAvg)}
        />
        <BudgetDatum
          label={copy.maxPromptChars}
          value={formatCount(opt?.max_prompt_chars)}
        />
        <BudgetDatum
          label={copy.avgPacketChars}
          value={formatCount(packetAvg)}
        />
        <BudgetDatum
          label={copy.maxPacketChars}
          value={formatCount(opt?.max_packet_chars)}
        />
        <BudgetDatum
          label={copy.memoryInOut}
          value={`${formatCount(opt?.memory_items_included)} / ${formatCount(
            opt?.memory_items_omitted,
          )}`}
        />
        <BudgetDatum
          label={copy.broadReads}
          value={`${formatCount(opt?.broad_poll_reads)} poll / ${formatCount(
            opt?.broad_task_reads,
          )} task`}
        />
      </div>
      <ContextSections
        title={copy.largestPromptSections}
        sections={promptSections}
      />
      <ContextSections
        title={copy.largestPacketSections}
        sections={packetSections}
      />
    </section>
  );
}

function BudgetDatum({ label, value }: { label: string; value: string }) {
  return (
    <div className="skills-budget-datum">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function ContextSections({
  title,
  sections,
}: {
  title: string;
  sections: Array<{ id: string; chars: number; required?: boolean }>;
}) {
  if (sections.length === 0) return null;
  return (
    <div className="skills-context-sections">
      <h4>{title}</h4>
      {sections.map((section) => (
        <div className="skills-context-section" key={section.id}>
          <span>
            {section.id}
            {section.required ? " *" : ""}
          </span>
          <strong>{formatCount(section.chars)}</strong>
        </div>
      ))}
    </div>
  );
}

function PlaybookMaturity({
  copy,
  rows,
}: {
  copy: SkillsCopy;
  rows: PlaybookMaturityRow[];
}) {
  const setCurrentApp = useAppStore((s) => s.setCurrentApp);
  const setWikiPath = useAppStore((s) => s.setWikiPath);
  const openWiki = useCallback(
    (path: string) => {
      setWikiPath(path);
      setCurrentApp("wiki");
    },
    [setCurrentApp, setWikiPath],
  );

  return (
    <section className="skills-panel is-wide">
      <div className="skills-section-head">
        <h3>{copy.playbookMaturityTitle}</h3>
        <p>{copy.playbookMaturityDescription}</p>
      </div>
      {rows.length === 0 ? (
        <div className="skills-empty-inline">{copy.playbookEmpty}</div>
      ) : (
        <div className="skills-table-wrap">
          <table className="skills-table">
            <thead>
              <tr>
                <th>{copy.playbook}</th>
                <th>{copy.compiled}</th>
                <th>{copy.executions}</th>
                <th>{copy.lastSynthesis}</th>
                <th>{copy.pending}</th>
                <th>{copy.source}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ playbook, status }) => (
                <tr key={playbook.slug}>
                  <td>
                    <strong>{playbook.title || playbook.slug}</strong>
                    <span>{playbook.slug}</span>
                  </td>
                  <td>
                    <StatusPill active={playbook.skill_exists}>
                      {playbook.skill_exists
                        ? copy.compiledStatus
                        : copy.pendingStatus}
                    </StatusPill>
                  </td>
                  <td>{formatCount(playbook.execution_count)}</td>
                  <td>{formatDateTime(status?.last_synthesized_ts)}</td>
                  <td>
                    {status?.executions_since_last_synthesis
                      ? copy.executionsSinceSynthesis(
                          status.executions_since_last_synthesis,
                        )
                      : "-"}
                  </td>
                  <td>
                    <button
                      type="button"
                      className="skills-link-button"
                      onClick={() => openWiki(playbook.source_path)}
                    >
                      {copy.openWiki}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SkillManager() {
  const copy = useSkillsCopy();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SkillFormState>(EMPTY_SKILL_FORM);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [submitState, setSubmitState] = useState<"idle" | "saving">("idle");
  const { data, isLoading, error } = useQuery({
    queryKey: ["skills"],
    queryFn: () => getSkills(),
    refetchInterval: 30_000,
  });
  const skills = useMemo(
    () => sortSkillsByUpdated(data?.skills ?? []),
    [data?.skills],
  );

  const updateForm = useCallback(
    (field: keyof SkillFormState, value: string) => {
      setForm((current) => ({ ...current, [field]: value }));
    },
    [],
  );

  const resetForm = useCallback(() => {
    setForm(EMPTY_SKILL_FORM);
    setEditingName(null);
    setEditorOpen(false);
  }, []);

  const startCreate = useCallback(() => {
    setForm(EMPTY_SKILL_FORM);
    setEditingName(null);
    setEditorOpen(true);
  }, []);

  const startEdit = useCallback((skill: Skill) => {
    if (!skill.name) return;
    setEditingName(skill.name);
    setForm(skillToForm(skill));
    setEditorOpen(true);
  }, []);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const validation = validateSkillForm(form, copy);
      if (validation) {
        showNotice(validation, "error");
        return;
      }
      setSubmitState("saving");
      const payload = skillPayloadFromForm(form);
      const request = editingName
        ? updateSkill({
            ...payload,
            name: editingName,
            status: form.action === "propose" ? "proposed" : "active",
          })
        : createSkill({
            ...payload,
            action: form.action,
            created_by: "human",
          });

      request
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ["skills"] });
          resetForm();
          showNotice(
            editingName
              ? copy.skillUpdated
              : form.action === "propose"
                ? copy.skillSubmitted
                : copy.skillRegistered,
            "success",
          );
        })
        .catch((e: Error) => {
          showNotice(copy.skillSaveFailed(e.message), "error");
        })
        .finally(() => setSubmitState("idle"));
    },
    [copy, editingName, form, queryClient, resetForm],
  );

  return (
    <>
      <SkillsManagementHeader copy={copy} onCreate={startCreate} />
      {editorOpen ? (
        <SkillEditor
          copy={copy}
          form={form}
          isEditing={!!editingName}
          isSaving={submitState !== "idle"}
          onCancel={resetForm}
          onChange={updateForm}
          onSubmit={handleSubmit}
        />
      ) : null}
      {isLoading ? (
        <div className="app-loading-state">{copy.skillLoading}</div>
      ) : error ? (
        <div className="app-empty-state">{copy.skillLoadError}</div>
      ) : (
        <SkillTable copy={copy} skills={skills} onEdit={startEdit} />
      )}
    </>
  );
}

function SkillsManagementHeader({
  copy,
  onCreate,
}: {
  copy: SkillsCopy;
  onCreate: () => void;
}) {
  return (
    <div className="skills-hero">
      <div>
        <p className="skills-kicker">{copy.skillKicker}</p>
        <h2>{copy.skillTitle}</h2>
        <p>{copy.skillDescription}</p>
      </div>
      <button type="button" className="skills-create-button" onClick={onCreate}>
        <span aria-hidden="true">+</span>
        {copy.newSkill}
      </button>
    </div>
  );
}

function SkillEditor({
  copy,
  form,
  isEditing,
  isSaving,
  onCancel,
  onChange,
  onSubmit,
}: {
  copy: SkillsCopy;
  form: SkillFormState;
  isEditing: boolean;
  isSaving: boolean;
  onCancel: () => void;
  onChange: (field: keyof SkillFormState, value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const nameRef = useRef<HTMLInputElement>(null);
  const primaryLabel = isEditing
    ? copy.updateSkill
    : form.action === "propose"
      ? copy.submitForApproval
      : copy.registerSkill;
  const closeIfIdle = useCallback(() => {
    if (!isSaving) onCancel();
  }, [isSaving, onCancel]);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget) closeIfIdle();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") closeIfIdle();
  }

  return (
    <div
      className="creation-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-editor-title"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <form className="creation-modal skill-editor-modal" onSubmit={onSubmit}>
        <header className="creation-modal-header">
          <div>
            <p className="creation-modal-kicker">{copy.skillKicker}</p>
            <h2 id="skill-editor-title">
              {isEditing ? copy.editorEditTitle : copy.editorCreateTitle}
            </h2>
            <p>{copy.editorDescription}</p>
          </div>
          <button
            type="button"
            className="creation-modal-close"
            onClick={closeIfIdle}
            aria-label={copy.closeEditor}
            disabled={isSaving}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="creation-modal-body">
          <section className="creation-modal-section">
            <div className="creation-modal-section-head">
              <div>
                <h3>{copy.requiredField}</h3>
                <p>{copy.editorRequiredDescription}</p>
              </div>
              <span className="creation-field-badge is-required">
                {copy.requiredField}
              </span>
            </div>
            <label className="skills-field" htmlFor="skill-editor-name">
              <span>{copy.skillName}</span>
              <input
                ref={nameRef}
                id="skill-editor-name"
                value={form.name}
                disabled={isEditing || isSaving}
                onChange={(event) => onChange("name", event.target.value)}
                placeholder={copy.skillNamePlaceholder}
                required
              />
            </label>
            <label
              className="skills-field skills-field-full"
              htmlFor="skill-editor-instructions"
            >
              <span>{copy.instructions}</span>
              <textarea
                id="skill-editor-instructions"
                value={form.content}
                onChange={(event) => onChange("content", event.target.value)}
                placeholder={copy.instructionsPlaceholder}
                rows={14}
                disabled={isSaving}
                required
              />
            </label>
          </section>

          <section className="creation-modal-section">
            <div className="creation-modal-section-head">
              <div>
                <h3>{copy.recommendedField}</h3>
                <p>{copy.editorRecommendedDescription}</p>
              </div>
              <span className="creation-field-badge">
                {copy.recommendedField}
              </span>
            </div>
            <div className="skills-editor-grid">
              <label className="skills-field">
                <span>{copy.title}</span>
                <input
                  value={form.title}
                  onChange={(event) => onChange("title", event.target.value)}
                  placeholder={copy.titlePlaceholder}
                  disabled={isSaving}
                />
              </label>
              <label className="skills-field">
                <span>{copy.shortSummary}</span>
                <input
                  value={form.description}
                  onChange={(event) =>
                    onChange("description", event.target.value)
                  }
                  placeholder={copy.shortSummaryPlaceholder}
                  disabled={isSaving}
                />
              </label>
              <label className="skills-field">
                <span>{copy.triggerHint}</span>
                <input
                  value={form.trigger}
                  onChange={(event) => onChange("trigger", event.target.value)}
                  placeholder={copy.triggerPlaceholder}
                  disabled={isSaving}
                />
              </label>
              <label className="skills-field">
                <span>{copy.tags}</span>
                <input
                  value={form.tags}
                  onChange={(event) => onChange("tags", event.target.value)}
                  placeholder={copy.tagsPlaceholder}
                  disabled={isSaving}
                />
              </label>
              <label className="skills-field">
                <span>{copy.permissions}</span>
                <input
                  value={form.requiredPermissions}
                  onChange={(event) =>
                    onChange("requiredPermissions", event.target.value)
                  }
                  placeholder={copy.permissionsPlaceholder}
                  disabled={isSaving}
                />
              </label>
              <label className="skills-field">
                <span>{copy.registrationMode}</span>
                <select
                  value={form.action}
                  onChange={(event) =>
                    onChange("action", event.target.value as SkillPublishMode)
                  }
                  disabled={isSaving}
                >
                  <option value="propose">{copy.needsApproval}</option>
                  <option value="create">{copy.useImmediately}</option>
                </select>
              </label>
            </div>
          </section>
        </div>
        <footer className="creation-modal-footer">
          <button
            type="button"
            className="skills-link-button"
            onClick={closeIfIdle}
            disabled={isSaving}
          >
            {isEditing ? copy.cancelEdit : copy.closeEditor}
          </button>
          <button type="submit" className="skills-invoke" disabled={isSaving}>
            {isSaving ? copy.saving : primaryLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}

function SkillTable({
  copy,
  skills,
  onEdit,
}: {
  copy: SkillsCopy;
  skills: Skill[];
  onEdit: (skill: Skill) => void;
}) {
  return (
    <section className="skills-panel is-wide">
      <div className="skills-section-head">
        <h3>{copy.sharedTeamSkillsTitle}</h3>
        <p>{copy.sharedTeamSkillsDescription}</p>
      </div>
      {skills.length === 0 ? (
        <div className="skills-empty-inline">{copy.noSkills}</div>
      ) : (
        <div className="skills-table-wrap">
          <table className="skills-table">
            <thead>
              <tr>
                <th>{copy.skillColumn}</th>
                <th>{copy.descriptionColumn}</th>
                <th>{copy.statusColumn}</th>
                <th>{copy.updatedColumn}</th>
                <th>{copy.usageColumn}</th>
                <th>{copy.lastRunColumn}</th>
                <th>{copy.source}</th>
                <th>{copy.actionsColumn}</th>
              </tr>
            </thead>
            <tbody>
              {skills.map((skill) => (
                <SkillRow
                  key={skill.id || skill.name}
                  copy={copy}
                  skill={skill}
                  onEdit={onEdit}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function SkillRow({
  copy,
  skill,
  onEdit,
}: {
  copy: SkillsCopy;
  skill: Skill;
  onEdit: (skill: Skill) => void;
}) {
  const source = skill.source || skill.channel || skill.created_by || "-";
  const isProposed = (skill.status || "active") === "proposed";
  return (
    <tr>
      <td>
        <strong>{skill.title || skill.name || copy.untitled}</strong>
        {skill.name ? <span>{skill.name}</span> : null}
        {skill.tags && skill.tags.length > 0 ? (
          <div className="skills-tag-row">
            {skill.tags.slice(0, 3).map((tag) => (
              <span className="skills-tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}
      </td>
      <td>{skill.description || skill.trigger || "-"}</td>
      <td>
        <StatusPill active={(skill.status || "active") === "active"}>
          {formatSkillStatus(skill.status, copy)}
        </StatusPill>
      </td>
      <td>{formatDateTime(skill.updated_at || skill.created_at)}</td>
      <td>{formatCount(skill.usage_count)}</td>
      <td>
        {formatDateTime(skill.last_execution_at)}
        {skill.last_execution_status ? (
          <span className="skills-run-status">
            {skill.last_execution_status}
          </span>
        ) : null}
      </td>
      <td>{source}</td>
      <td>
        <div className="skills-action-stack">
          {isProposed ? (
            <SkillApprovalActions copy={copy} skill={skill} />
          ) : (
            <InvokeSkillButton copy={copy} skill={skill} />
          )}
          <div className="skills-action-row">
            <button
              type="button"
              className="skills-link-button"
              disabled={!skill.name}
              onClick={() => onEdit(skill)}
            >
              {copy.edit}
            </button>
            <SkillDeleteButton copy={copy} skill={skill} />
          </div>
        </div>
      </td>
    </tr>
  );
}

function SkillApprovalActions({
  copy,
  skill,
}: {
  copy: SkillsCopy;
  skill: Skill;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "approving" | "rejecting">(
    "idle",
  );

  const updateStatus = useCallback(
    (status: "active" | "rejected") => {
      if (!skill.name) return;
      setState(status === "active" ? "approving" : "rejecting");
      updateSkill({ name: skill.name, status })
        .then(() => {
          void queryClient.invalidateQueries({ queryKey: ["skills"] });
          showNotice(
            status === "active" ? copy.skillApproved : copy.skillRejected,
            "success",
          );
        })
        .catch((e: Error) => {
          showNotice(copy.skillUpdateFailed(e.message), "error");
        })
        .finally(() => setState("idle"));
    },
    [copy, queryClient, skill.name],
  );

  return (
    <div className="skills-action-row">
      <button
        type="button"
        className="skills-invoke"
        disabled={state !== "idle" || !skill.name}
        onClick={() => updateStatus("active")}
      >
        {copy.approve}
      </button>
      <button
        type="button"
        className="skills-invoke is-danger"
        disabled={state !== "idle" || !skill.name}
        onClick={() => updateStatus("rejected")}
      >
        {copy.reject}
      </button>
    </div>
  );
}

function InvokeSkillButton({
  copy,
  skill,
}: {
  copy: SkillsCopy;
  skill: Skill;
}) {
  const [invokeState, setInvokeState] = useState<"idle" | "invoking" | "done">(
    "idle",
  );

  const handleInvoke = useCallback(() => {
    if (!skill.name) return;
    setInvokeState("invoking");
    invokeSkill(skill.name, {})
      .then(() => {
        setInvokeState("done");
        setTimeout(() => setInvokeState("idle"), 1500);
      })
      .catch((e: Error) => {
        setInvokeState("idle");
        showNotice(copy.invokeFailed(e.message), "error");
      });
  }, [copy, skill.name]);

  const buttonLabel =
    invokeState === "invoking"
      ? copy.invoking
      : invokeState === "done"
        ? copy.invoked
        : copy.invoke;

  return (
    <button
      type="button"
      className="skills-invoke"
      disabled={invokeState !== "idle" || !skill.name}
      onClick={handleInvoke}
    >
      <Flash aria-hidden={true} height={13} width={13} />
      {buttonLabel}
    </button>
  );
}

function SkillDeleteButton({
  copy,
  skill,
}: {
  copy: SkillsCopy;
  skill: Skill;
}) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<"idle" | "deleting">("idle");

  const handleDelete = useCallback(() => {
    if (!skill.name) return;
    const confirmed = window.confirm(
      copy.archiveConfirm(skill.title || skill.name),
    );
    if (!confirmed) return;
    setState("deleting");
    deleteSkill(skill.name)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: ["skills"] });
        showNotice(copy.skillArchived, "success");
      })
      .catch((e: Error) => {
        showNotice(copy.skillArchiveFailed(e.message), "error");
      })
      .finally(() => setState("idle"));
  }, [copy, queryClient, skill.name, skill.title]);

  return (
    <button
      type="button"
      className="skills-link-button is-danger"
      disabled={state !== "idle" || !skill.name}
      onClick={handleDelete}
    >
      {state === "deleting" ? copy.deleting : copy.delete}
    </button>
  );
}

function StatusPill({
  active,
  children,
}: {
  active: boolean;
  children: string;
}) {
  return (
    <span className={`skills-status${active ? " is-active" : ""}`}>
      {children}
    </span>
  );
}

function formatSkillStatus(status: string | undefined, copy: SkillsCopy) {
  const normalized = status || "active";
  return copy.status[normalized] ?? normalized;
}

function InlineError({ message }: { message: string }) {
  return <div className="skills-inline-error">{message}</div>;
}

function skillToForm(skill: Skill): SkillFormState {
  return {
    name: skill.name || "",
    title: skill.title || "",
    description: skill.description || "",
    content: skill.content || "",
    trigger: skill.trigger || "",
    tags: (skill.tags ?? []).join(", "),
    requiredPermissions: (skill.required_permissions ?? []).join(", "),
    action: skill.status === "proposed" ? "propose" : "create",
  };
}

function skillPayloadFromForm(form: SkillFormState) {
  const name = form.name.trim();
  const title = form.title.trim() || name;
  return {
    name,
    title,
    description: form.description.trim(),
    content: form.content.trim(),
    trigger: form.trigger.trim(),
    tags: splitCommaList(form.tags),
    required_permissions: splitCommaList(form.requiredPermissions),
    channel: "general",
  };
}

function validateSkillForm(
  form: SkillFormState,
  copy: SkillsCopy,
): string | null {
  if (!form.name.trim()) return copy.skillNameRequired;
  if (!form.content.trim()) return copy.instructionsRequired;
  return null;
}

function splitCommaList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildGrowthModel({
  skills,
  playbooks,
  statuses,
  wikiArticleCount,
  notebook,
  reviews,
  copy = SKILLS_COPY.en,
}: {
  skills: Skill[];
  playbooks: PlaybookSummary[];
  statuses: Map<string, PlaybookSynthesisStatus | null>;
  wikiArticleCount: number;
  notebook?: NotebookCatalogSummary;
  reviews: ReviewItem[];
  copy?: SkillsCopy;
}): GrowthModel {
  const proposedSkills = skills.filter((skill) => skill.status === "proposed");
  const activeSkills = skills.filter(
    (skill) => !skill.status || skill.status === "active",
  );
  const compiledPlaybooks = playbooks.filter(
    (playbook) => playbook.skill_exists,
  );
  const pendingReviews = reviews.filter((review) =>
    PENDING_REVIEW_STATES.has(review.state),
  );
  const synthesisPending = playbooks.filter((playbook) => {
    const status = statuses.get(playbook.slug);
    return (status?.executions_since_last_synthesis ?? 0) > 0;
  });
  const learnedUpdates = Array.from(statuses.values()).filter(
    (status) => !!status?.last_synthesized_ts,
  ).length;
  const totalExecutions = playbooks.reduce(
    (sum, playbook) => sum + (playbook.execution_count || 0),
    0,
  );
  const inbox: GrowthInboxItem[] = [
    ...proposedSkills.slice(0, 4).map((skill) => ({
      id: `skill-${skill.id || skill.name}`,
      label: copy.proposedSkillLabel(skill.title || skill.name),
      detail: skill.description || skill.trigger || copy.activationReviewNeeded,
      tone: "neutral" as const,
    })),
    ...pendingReviews.slice(0, 4).map((review) => ({
      id: `review-${review.id}`,
      label: copy.reviewLabel(review.entry_title || review.entry_slug),
      detail: review.proposed_wiki_path || copy.notebookPromotionReviewNeeded,
      tone: "neutral" as const,
    })),
    ...playbooks
      .filter((playbook) => !playbook.skill_exists)
      .slice(0, 4)
      .map((playbook) => ({
        id: `uncompiled-${playbook.slug}`,
        label: copy.compilePendingLabel(playbook.title || playbook.slug),
        detail: playbook.source_path,
        tone: "warning" as const,
      })),
    ...synthesisPending.slice(0, 4).map((playbook) => {
      const status = statuses.get(playbook.slug);
      const pending = status?.executions_since_last_synthesis ?? 0;
      return {
        id: `synthesis-${playbook.slug}`,
        label: copy.learningPendingLabel(playbook.title || playbook.slug),
        detail: copy.executionsSinceSynthesis(pending),
        tone: "warning" as const,
      };
    }),
  ].slice(0, 8);

  return {
    metrics: [
      {
        label: copy.sharedSkills,
        value: formatCount(skills.length),
        detail: copy.sharedSkillsMetricDetail(formatCount(activeSkills.length)),
      },
      {
        label: copy.proposedSkills,
        value: formatCount(proposedSkills.length),
        detail: copy.proposedSkillsDetail,
      },
      {
        label: copy.playbooks,
        value: formatCount(playbooks.length),
        detail: copy.playbooksMetricDetail(
          formatCount(compiledPlaybooks.length),
        ),
      },
      {
        label: copy.executionLogs,
        value: formatCount(totalExecutions),
        detail: copy.executionLogsDetail,
      },
      {
        label: copy.pendingPromotion,
        value: formatCount(
          notebook?.pending_promotion ?? pendingReviews.length,
        ),
        detail: copy.pendingPromotionDetail(
          formatCount(notebook?.total_entries),
        ),
      },
      {
        label: copy.learnedUpdates,
        value: formatCount(learnedUpdates),
        detail: copy.learnedUpdatesDetail(formatCount(wikiArticleCount)),
      },
    ],
    inbox,
    playbooks: sortPlaybookMaturityRows(
      playbooks.map((playbook) => ({
        playbook,
        status: statuses.get(playbook.slug) ?? null,
      })),
    ),
  };
}

function sortPlaybooksForStatusFetch(
  playbooks: PlaybookSummary[],
): PlaybookSummary[] {
  return [...playbooks].sort((a, b) => {
    if (a.skill_exists !== b.skill_exists) return a.skill_exists ? 1 : -1;
    if (b.execution_count !== a.execution_count) {
      return b.execution_count - a.execution_count;
    }
    return (a.title || a.slug).localeCompare(b.title || b.slug);
  });
}

function sortPlaybookMaturityRows(
  rows: PlaybookMaturityRow[],
): PlaybookMaturityRow[] {
  return [...rows].sort((a, b) => {
    return (
      comparePlaybookSkillState(a.playbook, b.playbook) ||
      comparePendingExecutions(a, b) ||
      comparePlaybookExecutionCount(a.playbook, b.playbook) ||
      comparePlaybookTitle(a.playbook, b.playbook)
    );
  });
}

function comparePlaybookSkillState(
  a: PlaybookSummary,
  b: PlaybookSummary,
): number {
  if (a.skill_exists === b.skill_exists) return 0;
  return a.skill_exists ? 1 : -1;
}

function comparePendingExecutions(
  a: PlaybookMaturityRow,
  b: PlaybookMaturityRow,
): number {
  const aPending = a.status?.executions_since_last_synthesis ?? 0;
  const bPending = b.status?.executions_since_last_synthesis ?? 0;
  if (aPending > 0 !== bPending > 0) return aPending > 0 ? -1 : 1;
  return bPending - aPending;
}

function comparePlaybookExecutionCount(
  a: PlaybookSummary,
  b: PlaybookSummary,
): number {
  return b.execution_count - a.execution_count;
}

function comparePlaybookTitle(a: PlaybookSummary, b: PlaybookSummary): number {
  return (a.title || a.slug).localeCompare(b.title || b.slug);
}

function sortSkillsByUpdated(skills: Skill[]): Skill[] {
  return [...skills].sort((a, b) => {
    const aTime = skillUpdatedTime(a);
    const bTime = skillUpdatedTime(b);
    if (aTime !== bTime) return bTime - aTime;
    return (a.title || a.name || "").localeCompare(b.title || b.name || "");
  });
}

function skillUpdatedTime(skill: Skill): number {
  const parsed = Date.parse(
    skill.updated_at || skill.created_at || skill.last_execution_at || "",
  );
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatDateTime(iso?: string): string {
  if (!iso) return "-";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "-";
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

function formatCount(value?: number): string {
  if (!value) return "0";
  return value.toLocaleString();
}

export const __test__ = {
  buildGrowthModel,
  skillPayloadFromForm,
  skillToForm,
  splitCommaList,
  sortPlaybookMaturityRows,
  sortSkillsByUpdated,
  formatDateTime,
};
