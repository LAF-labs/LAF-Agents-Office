# LAF Memory Superworkflow

This spec connects claude-mem, claude-subconscious, Codex session summaries, the
agent Notebook, the shared Wiki, and the repo Obsidian vault config.

## Source of Truth

- Canonical team knowledge: hosted workspace Wiki.
- Draft agent memory: hosted agent Notebook.
- Optional repo mirror for browsing: `docs/wiki-mirror/`.

`docs/wiki-mirror/` is not canonical. It is kept only as historical browsing
scaffolding; production memory lives in Supabase-backed Wiki and Notebook
records.

## Capture Flow

1. Claude Code, Codex, claude-mem, or claude-subconscious observes something
   durable.
2. The observation is written to the active agent Notebook.
3. The note is tagged as draft, subconscious, decision, bug, test, or review.
4. The agent may propose promotion.
5. A human or review agent checks provenance and contradictions.
6. Only then does the normal `notebook_promote` flow create or update a Wiki
   page.

## Preferred Integration

When MCP is available, memory adapters should call:

- `notebook_write` for drafts.
- `notebook_search` and `notebook_read` for recall.
- `notebook_promote` for reviewed promotion.
- `team_wiki_search` and `laf_office_wiki_lookup` for canonical lookup.

## Hosted API Integration

If MCP is not available, use the hosted Startup Office API endpoints for
Notebook drafts and Wiki promotion. Do not add desktop scripts or file mirrors
as a required production path.

## Hard Rules

- Do not auto-promote subconscious notes.
- Do not treat Obsidian as a second memory backend.
- Do not bypass the wiki worker for canonical Wiki writes while LAF-Office is
  running.
- Do not store secrets in Notebook or Wiki.
- Do not sync hosted tool state into Wiki without an implemented, reviewed
  integration.
