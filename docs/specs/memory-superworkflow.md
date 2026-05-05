# LAF Memory Superworkflow

This spec connects claude-mem, claude-subconscious, Codex session summaries, the
agent Notebook, the shared Wiki, and the repo Obsidian vault config.

## Source of Truth

- Canonical team knowledge: `~/.laf-office/wiki/`.
- Draft agent memory: `~/.laf-office/wiki/agents/{agent}/notebook/`.
- Repo mirror for Obsidian browsing: `docs/wiki-mirror/`.
- Obsidian config: `.obsidian/`.

`docs/wiki-mirror/` is not canonical. It is generated from the local wiki by
`scripts/sync-obsidian-wiki.sh pull` and is ignored by git except for its
README.

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

## Offline Integration

When MCP is not available, use:

```bash
printf '%s\n' "memory text" \
  | ./scripts/laf-memory-capture.sh --agent ceo --source claude-subconscious --title "Draft title"
```

The script writes only under the agent Notebook namespace. It does not promote
or commit canonical Wiki pages.

## Obsidian Mirror

Pull the local Wiki into the repo mirror:

```bash
./scripts/sync-obsidian-wiki.sh pull
```

Open the repository root as an Obsidian vault. The mirror appears under
`docs/wiki-mirror/`.

## Hard Rules

- Do not auto-promote subconscious notes.
- Do not treat Obsidian as a second memory backend.
- Do not bypass the wiki worker for canonical Wiki writes while LAF-Office is
  running.
- Do not store secrets in Notebook or Wiki.
- Do not sync hosted tool state into Wiki without an implemented, reviewed
  integration.

