---
description: LAF-specific architecture invariants for all agents
---

Do not violate these invariants:

- Broker is push-driven; do not add agent-turn polling.
- Each turn uses a fresh headless provider session.
- Each agent works in an isolated git worktree.
- MCP tools are scoped by role, surface, and mode.
- Notebook is draft memory; Wiki is canonical shared memory.
- Notebook-to-Wiki promotion is manual and reviewed.
- Runtime must stay selectable between Claude-powered and Codex-powered.
- Hooks must be deterministic and local-first.

When changing architecture, ask Architect to produce an invariant/risk note and
ask Reviewer to check the final diff.

