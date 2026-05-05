---
description: List agent skills, view a skill, compile, or sync to local folder
---
Handle skill requests based on $ARGUMENTS:

**No arguments -> list all skills:**
Use the `list_skills` MCP tool. Display results as a table with Name (slug), Trigger, Confidence, and Last Updated.

**Skill slug -> show skill:**
Use `get_skill_by_slug` with the slug. Display the full markdown content including action steps, required integrations, and workspace context.

**"sync" -> sync all skills to local .office/ folder:**
Use `sync_skills`. This downloads all skills as .md files to .office/skills/ for fast local access by any AI agent.

**"compile" -> trigger skill compilation:**
Use `compile_skills`. This scans playbook rules and generates executable skills grounded to the workspace's tools, team, and CRM schema.

**"read <slug>" -> read from local cache:**
Use `read_skill` with the slug. Reads from .office/skills/ first, falls back to API.

**LAF Superworkflow skills:**
Before compiling or applying skills, read the repo-native rules:

- `CLAUDE.md` for provider-selectable operating rules.
- `.laf-office/subagents/` for Architect/Coder/Reviewer/Tester/Ops roles.
- `Superpowers.md` for the complete development workflow.
- `Security.md` for security review.
- `TDD-Guard.md` for test-first verification.
- `Office-Rules.md` for LAF office behavior.
- `LAF-Specific-Rules.md` for broker, worktree, provider, MCP, and memory invariants.

Any generated skill must preserve Claude-powered and Codex-powered operation and
must write durable learnings to Notebook before suggesting Wiki promotion.
