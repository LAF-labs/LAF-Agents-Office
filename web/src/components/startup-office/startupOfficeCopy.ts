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
