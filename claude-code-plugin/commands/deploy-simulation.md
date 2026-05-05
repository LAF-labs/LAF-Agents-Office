---
description: Run a local deployment or simulation in Claude or Codex mode
---

Workflow:

1. Choose provider:
   `./laf-office --provider claude-code`
   `./laf-office --provider codex`
2. Start broker/web with explicit ports for smoke tests when needed.
3. Run `./scripts/laf-superworkflow-check.sh tester`.
4. Verify broker health, web health, provider readiness, and wiki sync.
5. Keep external mutating actions approval-gated.

