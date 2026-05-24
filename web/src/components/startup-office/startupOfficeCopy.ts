export const STARTUP_OFFICE_WEDGE_COPY = {
  en: {
    kicker: "Founder-controlled paid beta office",
    title: "Startup Office",
    description:
      "Validate and launch a paid beta from one controlled office: company memory, operating loops, approval gates, artifacts, and receipts.",
    authDescription:
      "Sign in or create a company workspace to validate and launch a paid beta.",
    onboardingSubhead:
      "Start with one company workspace for paid beta validation, offer packaging, customer discovery, approvals, and company memory.",
    loopsDescription:
      "The first paid demo is a controlled beta validation office, not a generic agent builder.",
    nextAction:
      "Run Idea Validation, approve the artifact, then use Offer Package or Customer Discovery to start selling the beta.",
    outcomeLabel: "Paid beta validation package",
  },
  ko: {
    kicker: "창업자가 통제하는 유료 베타 오피스",
    title: "스타트업 오피스",
    description:
      "회사 메모리, 운영 루프, 승인 게이트, 산출물, 영수증을 한 곳에서 관리하며 유료 베타를 검증하고 출시합니다.",
    authDescription:
      "로그인하거나 회사 워크스페이스를 만들어 유료 베타를 검증하고 출시합니다.",
    onboardingSubhead:
      "유료 베타 검증, 오퍼 패키징, 고객 인터뷰, 승인, 회사 메모리를 담는 하나의 회사 워크스페이스로 시작합니다.",
    loopsDescription:
      "첫 유료 데모는 범용 에이전트 빌더가 아니라 통제되는 베타 검증 오피스입니다.",
    nextAction:
      "아이디어 검증을 실행하고 산출물을 승인한 뒤, 오퍼 패키지나 고객 인터뷰 루프로 베타 판매를 시작합니다.",
    outcomeLabel: "유료 베타 검증 패키지",
  },
} as const;

export type StartupOfficeCopyLanguage = keyof typeof STARTUP_OFFICE_WEDGE_COPY;

export const STARTUP_OFFICE_APP_COPY = {
  en: {
    aria: "Startup Office",
    kicker: STARTUP_OFFICE_WEDGE_COPY.en.kicker,
    title: STARTUP_OFFICE_WEDGE_COPY.en.title,
    description: STARTUP_OFFICE_WEDGE_COPY.en.description,
    pulseTitle: "Company pulse",
    pulseDescription:
      "The workspace starts with a clear company state before operators run.",
    companyLabel: "Company",
    companyFallback: "New company",
    stageLabel: "Stage",
    stageFallback: "Idea validation",
    goalLabel: "Primary goal",
    goalFallback: "Find paid demand before building more.",
    nextDecisionLabel: "Next decision",
    nextDecisionFallback: "Approve the first validation loop.",
    officeStatusLabel: "Office status",
    officeOnline: "Cloud office online",
    officeFallback: "Draft mode",
    recentRunsLabel: "Recent runs",
    pendingApprovalsLabel: "Pending approvals",
    receiptsCountLabel: "Receipts",
    loopsTitle: "Operating loops",
    loopsDescription: STARTUP_OFFICE_WEDGE_COPY.en.loopsDescription,
    defaultLoops: [
      {
        name: "Idea Validation",
        detail: "Find the first paid beta buyer segment before building more.",
      },
      {
        name: "Offer Package",
        detail: "Turn the current positioning into a sellable beta package.",
      },
      {
        name: "Customer Discovery",
        detail: "Draft founder-approved interview targets, scripts, and notes.",
      },
      {
        name: "Weekly Operator Review",
        detail: "Summarize signals, decisions, receipts, and next loops.",
      },
    ],
    loopStatus: {
      active: "Active",
      paused: "Paused",
      archived: "Archived",
    },
    loopCadence: {
      manual: "Manual",
      daily: "Daily",
      weekly: "Weekly",
      monthly: "Monthly",
    },
    runLoop: "Run loop",
    runningLoop: "Running",
    approvalsTitle: "Approval Desk",
    approvalsDescription:
      "Autonomy stops before public claims, spend, outbound messages, and customer promises.",
    defaultApprovals: [
      {
        label: "Public publishing",
        detail: "Landing pages and posts require founder approval.",
      },
      {
        label: "Customer promises",
        detail: "Sales/support language stays draft-only until reviewed.",
      },
      {
        label: "Spend controls",
        detail: "No ad spend or off-session usage in the MVP.",
      },
    ],
    noPendingApprovals:
      "No decisions waiting. Run a loop to create the next founder approval.",
    approvalRiskLabel: "Risk",
    approvalRisk: {
      low: "Low",
      medium: "Medium",
      high: "High",
      critical: "Critical",
    },
    approve: "Approve",
    reject: "Reject",
    approving: "Approving",
    rejecting: "Rejecting",
    receiptsTitle: "Receipts and trace",
    receiptsDescription:
      "Every run should leave proof the founder can inspect or export.",
    defaultReceipts: [
      "Sources used",
      "Drafts created",
      "Approval status",
      "Estimated and actual usage",
      "Wiki memory changes",
    ],
    noRecentReceipts:
      "No run receipts yet. The first loop will write the initial trace.",
    artifactsTitle: "Artifacts",
    artifactsDescription:
      "Drafts, reports, messages, and memory updates produced by operating loops.",
    noArtifacts:
      "Run Idea Validation or seed a demo workspace to create the first artifact.",
    viewArtifact: "View artifact",
    viewRun: "View run",
    runDetailTitle: "Run detail",
    artifactViewerTitle: "Artifact",
    closePanel: "Close panel",
    companyMemoryTitle: "Company memory",
    companyMemoryDescription:
      "The office uses this profile as the first memory layer for every loop.",
    profileTitle: "Company profile",
    profileDescription:
      "Edit the operating facts every loop should obey: ICP, offer, positioning, stage, and priority.",
    editProfile: "Edit profile",
    saveProfile: "Save profile",
    savingProfile: "Saving",
    profileSaved: "Company profile updated.",
    profileSaveFailed: (message: string) =>
      `Company profile update failed: ${message}`,
    profileFields: {
      name: "Company name",
      stage: "Stage",
      priority: "Priority",
      icp: "ICP",
      offer: "Offer",
      positioning: "Positioning",
    },
    nextActionTitle: "Recommended next action",
    nextActionDescription: STARTUP_OFFICE_WEDGE_COPY.en.nextAction,
    runQueued: "Loop drafted and queued for founder approval.",
    approvalApproved: "Approval recorded and receipt written.",
    approvalRejected: "Rejection recorded and receipt written.",
    actionFailed: (message: string) =>
      `Startup Office action failed: ${message}`,
  },
  ko: {
    aria: "스타트업 오피스",
    kicker: STARTUP_OFFICE_WEDGE_COPY.ko.kicker,
    title: STARTUP_OFFICE_WEDGE_COPY.ko.title,
    description: STARTUP_OFFICE_WEDGE_COPY.ko.description,
    pulseTitle: "회사 펄스",
    pulseDescription:
      "오퍼레이터가 움직이기 전에 회사 상태와 다음 결정을 먼저 고정합니다.",
    companyLabel: "회사",
    companyFallback: "새 회사",
    stageLabel: "단계",
    stageFallback: "아이디어 검증",
    goalLabel: "핵심 목표",
    goalFallback: "더 만들기 전에 유료 수요를 확인합니다.",
    nextDecisionLabel: "다음 결정",
    nextDecisionFallback: "첫 검증 루프 실행을 승인합니다.",
    officeStatusLabel: "오피스 상태",
    officeOnline: "클라우드 오피스 온라인",
    officeFallback: "초안 모드",
    recentRunsLabel: "최근 실행",
    pendingApprovalsLabel: "대기 승인",
    receiptsCountLabel: "영수증",
    loopsTitle: "운영 루프",
    loopsDescription: STARTUP_OFFICE_WEDGE_COPY.ko.loopsDescription,
    defaultLoops: [
      {
        name: "아이디어 검증",
        detail: "더 만들기 전에 첫 유료 베타 구매자 세그먼트를 찾습니다.",
      },
      {
        name: "오퍼 패키지",
        detail: "현재 포지셔닝을 판매 가능한 베타 패키지로 바꿉니다.",
      },
      {
        name: "고객 인터뷰",
        detail: "창업자가 승인한 인터뷰 대상, 스크립트, 메모를 작성합니다.",
      },
      {
        name: "주간 운영 리뷰",
        detail: "신호, 결정, 영수증, 다음 루프를 요약합니다.",
      },
    ],
    loopStatus: {
      active: "활성",
      paused: "일시정지",
      archived: "보관됨",
    },
    loopCadence: {
      manual: "수동",
      daily: "매일",
      weekly: "매주",
      monthly: "매월",
    },
    runLoop: "루프 실행",
    runningLoop: "실행 중",
    approvalsTitle: "승인 데스크",
    approvalsDescription:
      "공개 주장, 비용 지출, 외부 메시지, 고객 약속 앞에서 자동 실행을 멈춥니다.",
    defaultApprovals: [
      {
        label: "공개 발행",
        detail: "랜딩 페이지와 게시물은 창업자 승인 후 발행됩니다.",
      },
      {
        label: "고객 약속",
        detail: "세일즈/지원 문구는 검토 전까지 초안으로 남습니다.",
      },
      {
        label: "비용 통제",
        detail: "MVP에서는 광고비 지출이나 오프세션 사용량 과금이 없습니다.",
      },
    ],
    noPendingApprovals:
      "대기 중인 결정이 없습니다. 루프를 실행하면 다음 창업자 승인이 생성됩니다.",
    approvalRiskLabel: "위험도",
    approvalRisk: {
      low: "낮음",
      medium: "중간",
      high: "높음",
      critical: "매우 높음",
    },
    approve: "승인",
    reject: "거절",
    approving: "승인 중",
    rejecting: "거절 중",
    receiptsTitle: "영수증과 추적",
    receiptsDescription:
      "모든 실행은 창업자가 확인하고 내보낼 수 있는 증거를 남겨야 합니다.",
    defaultReceipts: [
      "사용한 출처",
      "생성된 초안",
      "승인 상태",
      "예상/실제 사용량",
      "위키 메모리 변경",
    ],
    noRecentReceipts:
      "아직 실행 영수증이 없습니다. 첫 루프가 초기 추적 기록을 남깁니다.",
    artifactsTitle: "산출물",
    artifactsDescription:
      "운영 루프가 만든 초안, 리포트, 메시지, 메모리 업데이트입니다.",
    noArtifacts:
      "아이디어 검증을 실행하거나 데모 워크스페이스를 seed해 첫 산출물을 만드세요.",
    viewArtifact: "산출물 보기",
    viewRun: "실행 보기",
    runDetailTitle: "실행 상세",
    artifactViewerTitle: "산출물",
    closePanel: "패널 닫기",
    companyMemoryTitle: "회사 메모리",
    companyMemoryDescription:
      "오피스는 이 프로필을 모든 루프의 첫 메모리 레이어로 사용합니다.",
    profileTitle: "회사 프로필",
    profileDescription:
      "모든 루프가 따라야 할 ICP, 오퍼, 포지셔닝, 단계, 우선순위를 수정합니다.",
    editProfile: "프로필 수정",
    saveProfile: "프로필 저장",
    savingProfile: "저장 중",
    profileSaved: "회사 프로필을 업데이트했습니다.",
    profileSaveFailed: (message: string) =>
      `회사 프로필 업데이트에 실패했습니다: ${message}`,
    profileFields: {
      name: "회사명",
      stage: "단계",
      priority: "우선순위",
      icp: "ICP",
      offer: "오퍼",
      positioning: "포지셔닝",
    },
    nextActionTitle: "추천 다음 행동",
    nextActionDescription: STARTUP_OFFICE_WEDGE_COPY.ko.nextAction,
    runQueued: "루프 초안이 생성되어 창업자 승인 대기열에 들어갔습니다.",
    approvalApproved: "승인이 기록되고 영수증이 작성되었습니다.",
    approvalRejected: "거절이 기록되고 영수증이 작성되었습니다.",
    actionFailed: (message: string) =>
      `스타트업 오피스 실행에 실패했습니다: ${message}`,
  },
} as const;

export type StartupOfficeAppCopy =
  (typeof STARTUP_OFFICE_APP_COPY)[StartupOfficeCopyLanguage];
