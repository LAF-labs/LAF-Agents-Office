---
description: Test-first and verification guard for LAF-Office changes
---

Run this skill as Tester.

Process:

1. Define the failing behavior or verification target.
2. Add or update the smallest relevant test when practical.
3. Implement only enough to pass.
4. Run focused checks first.
5. Run broader checks when broker, provider, worktree, MCP, or memory behavior
   changes.
6. Record checks that could not run and why.

Recommended commands:

- Go focus: `go test ./internal/commands`
- Go full: `./scripts/test-go.sh`
- Web typecheck: `cd web && bun run typecheck`
- Web tests: `cd web && bun run test`
- Workflow gates: `./scripts/laf-superworkflow-check.sh tester`
