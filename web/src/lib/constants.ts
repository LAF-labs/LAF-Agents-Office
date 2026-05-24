// Wiki unifies three surfaces behind one sidebar entry: the canonical
// team wiki, per-agent notebooks (drafts), and the promotion review queue.
// Each surface gets its own tab inside the Wiki app; notebooks/reviews
// have no top-level sidebar entries of their own.
export const SIDEBAR_APPS = [
  { id: "growth", icon: "\u2197", name: "Startup Office" },
  { id: "home", icon: "\u2302", name: "Home" },
  { id: "skills", icon: "\u26A1", name: "Skills" },
  { id: "wiki", icon: "\uD83D\uDCD6", name: "Wiki" },
  { id: "activity", icon: "\u25A3", name: "Assets" },
  { id: "receipts", icon: "\u25A4", name: "Receipts" },
  { id: "settings", icon: "\u2699", name: "Settings" },
] as const;

export const DISCONNECT_THRESHOLD = 3;
export const MESSAGE_POLL_INTERVAL = 2000;
export const MEMBER_POLL_INTERVAL = 5000;
export const REQUEST_POLL_INTERVAL = 3000;
