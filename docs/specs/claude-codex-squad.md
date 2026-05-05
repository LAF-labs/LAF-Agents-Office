# Claude/Codex Squad Operations

This spec defines the 24/7 development squad layer for LAF-Office.

The squad layer supervises work. It does not replace the broker, fresh-session
turns, agent worktrees, scoped MCP, or Notebook-to-Wiki promotion.

## Providers

Start Claude-powered squad:

```bash
./scripts/laf-squad-tmux.sh claude-code
```

Start Codex-powered squad:

```bash
./scripts/laf-squad-tmux.sh codex
```

## Roles

The session opens one tab/window per role:

- architect
- coder
- reviewer
- tester
- ops

Each role reads `CLAUDE.md`, `.laf-office/subagents/{role}.md`, and the current
task. Overnight work should end with:

- PR-ready diff.
- Reviewer notes.
- Tester notes.
- Notebook capture.
- Wiki promotion candidates only, not automatic Wiki writes.

## zellij

Use `ops/laf-squad.zellij.kdl` as a starting layout:

```bash
zellij --layout ops/laf-squad.zellij.kdl
```

## Safety

- Keep external actions approval-gated.
- Do not use long-running panes as hidden source-of-truth memory.
- Keep provider choice visible in session names.
- Prefer LAF task board and broker mentions for runtime agent work.

