// Wiki unifies three surfaces behind one sidebar entry: the canonical
// team wiki, per-agent notebooks (drafts), and the promotion review queue.
// Each surface gets its own tab inside the Wiki app; notebooks/reviews
// have no top-level sidebar entries of their own.
export const SIDEBAR_APPS = [
  { id: "home", icon: "\u2302", name: "Home" },
  { id: "tasks", icon: "\u2705", name: "Projects" },
  { id: "wiki", icon: "\uD83D\uDCD6", name: "Wiki" },
  { id: "settings", icon: "\u2699", name: "Settings" },
] as const;

export const DISCONNECT_THRESHOLD = 3;
export const MESSAGE_POLL_INTERVAL = 2000;
export const MEMBER_POLL_INTERVAL = 5000;
export const REQUEST_POLL_INTERVAL = 3000;
