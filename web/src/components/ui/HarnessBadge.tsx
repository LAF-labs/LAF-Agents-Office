import type { HarnessKind } from "../../lib/harness";
import { harnessLabel } from "../../lib/harness";

interface HarnessBadgeProps {
  kind: HarnessKind;
  size?: number;
  className?: string;
}

const PALETTE: Record<HarnessKind, { bg: string; fg: string }> = {
  "claude-code": {
    bg: "var(--color-deep-slate, #161718)",
    fg: "var(--color-light-steel, #d0d6e0)",
  },
  codex: {
    bg: "var(--color-neon-lime, #e4f222)",
    fg: "var(--color-pitch-black, #08090a)",
  },
  opencode: {
    bg: "var(--color-graphite, #0f1011)",
    fg: "var(--color-storm-cloud, #8a8f98)",
  },
};

function Glyph({ kind, color }: { kind: HarnessKind; color: string }) {
  switch (kind) {
    case "claude-code":
      return (
        <path
          d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6L5.6 18.4"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
        />
      );
    case "codex":
      return (
        <path
          d="M6 8l5 4-5 4M13 16h6"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    case "opencode":
      return (
        <path
          d="M9 8l-4 4 4 4M15 8l4 4-4 4"
          stroke={color}
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
  }
}

export function HarnessBadge({
  kind,
  size = 12,
  className,
}: HarnessBadgeProps) {
  const { bg, fg } = PALETTE[kind];
  const classes = ["harness-badge", className].filter(Boolean).join(" ");
  return (
    <span
      className={classes}
      role="img"
      aria-label={`${harnessLabel(kind)} harness`}
      title={harnessLabel(kind)}
      style={{ width: size, height: size, background: bg }}
    >
      <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
        <Glyph kind={kind} color={fg} />
      </svg>
    </span>
  );
}
