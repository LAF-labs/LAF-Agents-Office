// Wiki unifies three surfaces behind one sidebar entry: the canonical
// team wiki, per-agent notebooks (drafts), and the promotion review queue.
// Each surface gets its own tab inside the Wiki app; notebooks/reviews
// have no top-level sidebar entries of their own.
export const SIDEBAR_APPS = [
  { id: "wiki", icon: "\uD83D\uDCD6", name: "Wiki" },
  { id: "tasks", icon: "\u2705", name: "Tasks" },
  { id: "requests", icon: "\uD83D\uDCCB", name: "Requests" },
  { id: "skills", icon: "\u26A1", name: "Skills" },
  { id: "activity", icon: "\uD83D\uDCE6", name: "Activity" },
  { id: "receipts", icon: "\uD83E\uDDFE", name: "Receipts" },
  { id: "settings", icon: "\u2699", name: "Settings" },
] as const;

export const ONBOARDING_COPY = {
  step1_headline: "AI startup team workspace with a shared wiki.",
  step1_subhead:
    "Plan product work with AI agents, keep decisions in a local LLM wiki, and hand real development tasks to connected coding runtimes.",
  step1_cta: "Open the office",
  step2_prereqs_title: "First, make sure you have the tools",
  step2_keys_title: "Connect your AI providers",
  step2_cta: "Ready",
  step3_title: "What should the team work on first?",
  step3_placeholder:
    "e.g. Sign our first three pilot customers in the next two weeks.",
  step3_skip: "Skip for now",
  step3_cta: "Get started",
} as const;

export const DISCONNECT_THRESHOLD = 3;
export const MESSAGE_POLL_INTERVAL = 2000;
export const MEMBER_POLL_INTERVAL = 5000;
export const REQUEST_POLL_INTERVAL = 3000;
