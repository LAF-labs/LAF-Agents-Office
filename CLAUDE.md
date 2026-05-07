# LAF-Office AI Runtime Operating Rules

LAF-Office is a local-first, 24/7 meta AI agent company. It can run in
Claude-powered mode or Codex-powered mode, selected by the user at runtime.
This file is named `CLAUDE.md` for Claude Code compatibility, but its rules are
binding for every development/runtime assistant that works on this repository.

## Mission

LAF-Office turns a founder workspace into an AI agent company:

- Human operators set intent, approve risky actions, and own final decisions.
- LAF agents run as company teammates with scoped roles, scoped tools, and
  isolated workspaces.
- Claude or Codex can operate as the development meta layer that improves the
  LAF agent company itself.
- Project memory is local, markdown, reviewable, and git-backed.

## Runtime Selection

The project must remain provider-selectable:

- `laf-office --provider claude-code` starts Claude-powered operation.
- `laf-office --provider codex` starts Codex-powered operation.
- The web `/provider` command, Settings app, and onboarding runtime picker must
  preserve the same choice.
- New workflow files may mention Claude Code where required by tool
  compatibility, but the operating model must also work for Codex.
- Do not hard-code a Claude-only assumption into broker, memory, skills,
  hooks, or slash-command designs.

## Non-Negotiable Architecture

Respect the current LAF-Office architecture before adding features:

- Broker is push-driven. Agents wake from broker notifications and office
  events. Do not add polling loops for agent turns.
- Each agent turn uses a fresh headless session. Do not build long-lived hidden
  LLM conversations as the source of truth.
- Each agent works in its own git worktree. Do not let agents mutate the human
  checkout directly unless an explicit local command is doing a controlled repo
  maintenance task.
- MCP tools are scoped per agent and per surface. Do not give every agent every
  tool by default.
- The local markdown wiki is the canonical shared memory surface.
- Notebook entries are private draft memory. Wiki pages are shared company
  knowledge.
- Mutating external actions require human approval unless the runtime is
  explicitly started in an unsafe test mode.

## Office Rule

Treat the workspace as a company, not a chatbot:

- Runtime LAF has exactly three default active agents: Architect, Builder, and
  Reviewer.
- Architect owns prioritization, scope, architecture, task briefs, handoffs,
  and conflict resolution.
- Builder executes the smallest useful slice across software or non-software
  work, handles errors, and reports verifiable evidence.
- Reviewer checks correctness, security, quality, Office Rule compliance, and
  memory consistency before work is treated as done.
- Agent Maker is settings-only. It can help generate a new domain specialist
  when the human adds an agent, but it cannot be mentioned in chat, assigned to
  tickets, or added to projects/channels.
- When in doubt, route durable decisions to the lead and durable knowledge to
  the Notebook-to-Wiki promotion flow.

## Development Subagents

The Claude/Codex development layer uses five provider-neutral subagent roles:

- Architect Agent: broker, worktree, MCP, wiki, provider, and data-flow design.
- Coder Agent: Go, TypeScript, React, scripts, and CLI implementation.
- Reviewer Agent: code quality, security, Office Rule, and wiki consistency.
- Tester Agent: TDD, regression tests, evals, smoke tests, and reproduction
  notes.
- Ops Agent: lefthook, deployment, tmux/zellij, provider setup, and wiki sync.

These development subagents improve the LAF agents. They do not replace the
runtime LAF company roles. Map them to LAF roles as follows:

- Architect Agent maps to the runtime Architect.
- Coder Agent maps to the runtime Builder.
- Reviewer Agent maps to the runtime Reviewer and the default reviewer in
  blueprints.
- Tester Agent maps to QA/Test agents and `evals/`.
- Ops Agent maps to Builder-led operations, deployment, and local runtime
  support, with Architect owning scope.

## Memory Policy

LAF memory is local and reviewable:

- Agent Notebook: private draft notes under the agent namespace.
- Team Wiki: shared canonical markdown under `~/.laf-office/wiki/`.
- Promotion: Notebook to Wiki is manual and intentional. Nothing is promoted
  automatically.
- Every durable decision should have provenance: source task, agent, date, and
  verification status.
- Contradictions must be resolved with `resolve_contradiction` or an explicit
  wiki edit that cites the superseded page.
- Hosted systems such as CRM, email, calendar, Slack, or Notion are not project
  memory unless LAF-Office has implemented and approved that integration.

### claude-mem and claude-subconscious Integration

When claude-mem or claude-subconscious is installed, it must follow LAF memory:

- Session summaries are written first to the active agent Notebook.
- Background observations are tagged as subconscious drafts.
- Subconscious drafts may suggest Wiki promotion, but must not write canonical
  Wiki pages directly.
- Promotion requires an agent or human to review, cite, and call the normal
  Notebook-to-Wiki flow.
- Codex-powered operation follows the same rule with Codex session summaries.
- The repo `.obsidian/` vault config is a mirror/navigation layer, not a second
  canonical memory store.

## MCP Tool Scoping

Use the smallest sufficient tool surface:

- Draft memory: `notebook_write`, `notebook_read`, `notebook_list`,
  `notebook_search`.
- Promotion: `notebook_promote`.
- Canonical memory: `team_wiki_write`, `team_wiki_read`, `team_wiki_search`,
  `team_wiki_list`, `laf_office_wiki_lookup`.
- Verification: `run_lint`, repo tests, web typecheck, targeted smoke tests.
- Conflict handling: `resolve_contradiction`.
- External mutating tools stay approval-gated and role-scoped.

## Development Workflow

Every substantial change follows this loop:

1. Recon: read the relevant docs, code, tests, and existing patterns first.
2. Plan: identify the smallest safe implementation path and test surface.
3. Test first when practical: add or update focused tests before broad edits.
4. Implement: keep changes local to the responsible modules.
5. Review: run Reviewer checks for security, architecture drift, and memory
   consistency.
6. Verify: run Tester checks and record what passed or what could not run.
7. Capture: write durable findings to Notebook; promote to Wiki only after
   review.

## Coding Standards

- Prefer existing project patterns over new abstractions.
- Keep Go code formatted with `gofmt` and covered by focused tests.
- Keep TypeScript/React code typed, accessible, and consistent with the current
  web design system.
- Do not introduce one-off global state, hidden background polling, or provider
  lock-in.
- Do not bypass git worktree isolation for agent execution.
- Do not write secrets, credentials, or provider tokens into markdown, tests, or
  fixture files.
- Keep slash commands checked into the repo when they encode repeated work.
- Keep hooks deterministic and explainable; expensive checks belong in
  pre-push or CI unless the user explicitly asks for stricter local gates.

## Security and TDD Gates

Reviewer and Tester gates must check:

- No secrets or credential-shaped values in diffs.
- No new destructive actions without approval and clear scoping.
- No direct writes to canonical Wiki from subconscious/background memory.
- No new polling agent loop.
- Go changes have targeted `go test` coverage where practical.
- Web changes pass typecheck and relevant unit/e2e tests where practical.
- Runtime/provider changes preserve both Claude-powered and Codex-powered
  operation.

## Slash Commands and Skills

The `claude-code-plugin/commands/` folder is the checked-in command surface for
repeated AI workflows. New commands must:

- State the role that should run the workflow.
- State the expected inputs and outputs.
- Respect Notebook-to-Wiki promotion.
- Prefer provider-neutral language unless the command requires Claude Code.
- Mention the equivalent `laf-office` command or web command where one exists.

Skills are operating constraints, not inspiration notes. Security, TDD,
Office Rules, and LAF-specific architecture rules apply automatically during
task execution.

## 24/7 Claude Squad Mode

tmux or zellij may keep multiple provider sessions alive for supervision, but
agent turns still flow through the broker:

- Long-running multiplexers are orchestration shells, not hidden source-of-truth
  conversations.
- Overnight work must end with tests, review notes, a PR-ready diff, and
  Notebook entries.
- Wiki updates from overnight work still require manual promotion.
- Sessions should be named by role and provider, for example
  `laf-architect-codex` or `laf-reviewer-claude`.

## Completion Contract

A task is done only when:

- The implementation is complete for the requested scope.
- Relevant checks have run or the reason they could not run is documented.
- Architecture invariants remain intact.
- Claude-powered and Codex-powered paths are not accidentally broken.
- Durable lessons are captured in Notebook and promoted only when reviewed.
