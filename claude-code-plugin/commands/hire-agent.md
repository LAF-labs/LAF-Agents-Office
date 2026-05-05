---
description: Hire a new LAF agent with Claude or Codex provider selection
---

Inputs: desired role, slug, provider, model if needed, first task.

Workflow:

1. Confirm provider: `claude-code` or `codex`.
2. Choose existing runtime role or blueprint specialist.
3. Use LAF CLI/web equivalent:
   `/agent create <slug> --name "<name>" --provider <claude-code|codex> --role "<role>"`
4. Assign a first task with `/assign-task` or `/task create`.
5. Capture the hiring rationale in the agent Notebook.

Do not create broad MCP access by default.

