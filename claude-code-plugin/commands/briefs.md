---
description: List entity briefs and workspace playbooks, or view a specific brief
---
Handle brief/playbook requests based on $ARGUMENTS:

**No arguments → list all briefs:**
Use the `list_briefs` MCP tool. Display results as a table with Title, Type (Entity Brief / Workspace Playbook), and Last Updated.

**Entity name → find and show brief:**
First use `search_entities` to find the entity by name. Then use `get_entity_brief` with the context_id. Display the full markdown content.

**"workspace" or "playbooks" → list workspace playbooks only:**
Use `list_briefs` with scope_type=2.

**"sync" → sync all briefs to local .office/ folder:**
Use `sync_briefs`. This downloads all briefs as .md files for fast local access.

**"compile <entity>" → trigger compilation:**
Search for the entity, then use `compile_brief` with the context_id.

**"history <id>" → show version history:**
Use `get_brief_history` with the ID.

**LAF memory rule:**
Briefs may quote or summarize canonical Wiki pages, but new durable observations
must first go to the responsible agent Notebook. Promote to Wiki only through
the reviewed Notebook-to-Wiki flow.

**Provider rule:**
Brief generation must be provider-neutral. It may run in Claude-powered or
Codex-powered mode, and must not assume Claude-only runtime state.
