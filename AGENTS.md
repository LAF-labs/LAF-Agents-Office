# --- LLM Wiki Context & Memory ---

# LLM Wiki — Project Context & Memory

This project uses the local markdown team wiki as the only project memory
surface. Store durable project knowledge in the wiki/notebook files that live
under the LAF-Office runtime home. Prefer file-backed, reviewable knowledge over
hosted CRM, email, calendar, notification, or integration state.

## Memory Defaults

- Use the markdown team wiki for shared organizational memory.
- Use per-agent notebooks for private working notes.
- Do not rely on hosted integration context for CRM, email, calendar, or alerts.
- Treat managed integration providers as unavailable until this project ships
  its own implementation.

# --- End LLM Wiki ---

# --- Karpathy Guidelines ---

For coding, review, refactoring, debugging, planning, design, and operations work
in this repository, apply the globally installed Codex skill
`karpathy-guidelines` from:

`~/.codex/skills/karpathy-guidelines/SKILL.md`

Use these project-level defaults:

- State assumptions before changing code when requirements are ambiguous.
- Prefer the smallest implementation that solves the requested behavior.
- Keep edits surgical: touch only files needed for the current task and preserve
  existing style.
- Do not add speculative abstractions, configurability, or unrelated refactors.
- Define verifiable success criteria and run the narrowest useful checks.
- Remove only unused code introduced by the current change; mention unrelated
  dead code instead of deleting it.

# --- End Karpathy Guidelines ---

# --- LAF Three-Agent Runtime ---

The default runtime team is Architect, Builder, and Reviewer. Do not reintroduce
CEO/PM/Executor-style default agents. Agent Maker is a settings-only helper used
to generate new domain specialists; it must not appear in project chat, task
assignment, channel membership, or default rosters.

# --- End LAF Three-Agent Runtime ---
