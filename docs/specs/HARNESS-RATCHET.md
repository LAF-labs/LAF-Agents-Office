# LAF-Office Harness Ratchet

This project treats the agent harness as a living product surface. When a
human, agent, hook, test, or review finds a repeatable agent-workflow failure,
the fix is not complete until the failure has a durable prevention point.

The goal is not to add rules for every concern. The goal is to convert observed
failures into the smallest permanent guard that would have caught that exact
failure.

## Scope

The harness includes:

- `AGENTS.md`, `CLAUDE.md`, role files, and command files.
- Agent memory packets, task receipts, Notebook and Wiki flows.
- Tools, MCP scopes, provider selection, worktree isolation, and approval
  gates.
- `lefthook.yml`, CI, `scripts/laf-superworkflow-check.sh`, tests, and evals.
- Reviewer and Tester roles used by project tasks.

## Ratchet Rule

Every durable agent-workflow failure should leave one of these artifacts:

| Failure type | Preferred permanent guard |
| --- | --- |
| Prompt or extraction regression | Minimal `evals/` case |
| Code behavior regression | Focused unit or integration test |
| Unsafe shell, secret, polling, or provider drift | Hook or CI gate |
| Role confusion or bad handoff | Role contract or slash command update |
| Memory contamination or missing provenance | Notebook/Wiki workflow update |
| Task marked done without evidence | Task lifecycle, receipt, or review gate |

If none of those are warranted, record the reason in the review note. Do not add
a broad rule unless there is a concrete failure signature behind it.

## Failure Record

Use this shape in Notebook, a review note, or a project Wiki decision before
promoting it into a shared rule:

```markdown
## Harness ratchet: <short failure name>

- Date:
- Reporter:
- Failure signature:
- Reproduction:
- Impact:
- Permanent guard:
- Verification:
- Owner:
- Revisit when:
```

## Operating Loop

1. Reproduce or describe the smallest failure signature.
2. Pick the narrowest guard from the table above.
3. Implement that guard near the failing surface.
4. Run the focused check that proves the guard works.
5. Capture the lesson in Notebook; promote to Wiki only after review.

## What Not To Do

- Do not grow `AGENTS.md` or `CLAUDE.md` with speculative rules.
- Do not give every agent every tool to avoid a handoff bug.
- Do not turn long-running hidden conversations into source-of-truth memory.
- Do not auto-promote draft notes into the shared Wiki.
- Do not add expensive local hooks when a focused test or eval is enough.

## Current Baseline

The current baseline already includes worktree isolation, fresh sessions,
scoped MCP, markdown memory, reviewer/tester gates, prompt evals, and local
hooks. New ratchets should strengthen those surfaces rather than bypass them.
