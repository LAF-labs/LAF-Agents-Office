package commands

import "strings"

func cmdHireAgent(ctx *SlashContext, args string) error {
	ctx.AddMessage("system", strings.TrimSpace(`
Hire Agent workflow:

1. Choose runtime: Claude-powered or Codex-powered.
2. Pick role: CEO, Product, Engineering, Review, Tester, Ops, or blueprint specialist.
3. Create with existing command:
   /agent create <slug> --name "<name>" --provider <claude-code|codex> --role "<role>"
4. Add first task with /assign-task or /task create.
5. Capture durable hiring rationale in the agent Notebook; promote only after review.
`))
	return nil
}

func cmdAssignTask(ctx *SlashContext, args string) error {
	ctx.AddMessage("system", strings.TrimSpace(`
Assign Task workflow:

1. Define expected outcome, owner, reviewer, and verification.
2. Prefer existing project board command:
   /task create --title "<title>" --description "<scope, acceptance, checks>" --assignees <agent-slug>
3. Mention the owner in chat to wake the broker-driven agent turn.
4. Reviewer checks Office Rule, security, tests, and memory consistency.
`))
	return nil
}

func cmdDailyStandup(ctx *SlashContext, args string) error {
	ctx.AddMessage("system", strings.TrimSpace(`
Daily Standup workflow:

1. CEO asks each active agent for: yesterday, today, blockers, checks, memory updates.
2. Product reconciles priorities against the task board.
3. Reviewer flags unresolved risk.
4. Tester reports failing or missing verification.
5. Ops reports provider, hook, wiki, and deployment health.
6. Durable lessons go to Notebooks; only reviewed lessons are promoted to Wiki.
`))
	return nil
}

func cmdReviewOffice(ctx *SlashContext, args string) error {
	ctx.AddMessage("system", strings.TrimSpace(`
Review Office workflow:

Run:
  ./scripts/laf-superworkflow-check.sh reviewer

Review:
1. No polling drift in broker/launcher paths.
2. Fresh-session and per-agent worktree rules remain intact.
3. Claude-powered and Codex-powered modes remain selectable.
4. Notebook-to-Wiki promotion is manual.
5. Security and destructive actions are approval-scoped.
6. Tests or residual risk are documented.
`))
	return nil
}

func cmdPromoteToWiki(ctx *SlashContext, args string) error {
	ctx.AddMessage("system", strings.TrimSpace(`
Promote to Wiki workflow:

1. Read the source Notebook entry.
2. Check provenance, date, owner, and verification status.
3. Search the Wiki for contradictions or duplicate canonical pages.
4. Resolve contradictions before promotion.
5. Use notebook_promote or the existing Wiki promotion UI.
6. Add sources and keep the Notebook draft linked.

Never auto-promote claude-subconscious or Codex session notes.
`))
	return nil
}

func cmdFixBug(ctx *SlashContext, args string) error {
	ctx.AddMessage("system", strings.TrimSpace(`
Fix Bug workflow:

1. Reproduce the bug or write the smallest failing test.
2. Assign Architect only if broker, provider, worktree, MCP, or memory invariants are touched.
3. Coder implements the smallest fix.
4. Tester runs the focused regression and broader checks when risk warrants.
5. Reviewer checks security, Office Rule, provider neutrality, and Wiki consistency.
6. Capture the bug signature and fix note in Notebook.
`))
	return nil
}

func cmdDeploySimulation(ctx *SlashContext, args string) error {
	ctx.AddMessage("system", strings.TrimSpace(`
Deploy Simulation workflow:

1. Start local runtime with explicit provider:
   ./laf-office --provider claude-code
   ./laf-office --provider codex
2. Use isolated ports for scripted smoke tests when needed.
3. Run:
   ./scripts/laf-superworkflow-check.sh tester
4. Ops records provider readiness, broker health, web health, and wiki sync status.
5. No external mutating action runs without approval.
`))
	return nil
}
