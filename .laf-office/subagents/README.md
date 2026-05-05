# LAF-Office Development Subagents

This directory is the provider-neutral source of truth for development
subagents. Claude-powered mode can load `.claude/agents/*`; Codex-powered mode
uses these same role contracts through `CLAUDE.md`, `AGENTS.md`, and task
prompts.

The runtime LAF company roles still live in operation blueprints and agent
packs. These development subagents maintain and extend that runtime.

## Role Set

- Architect Agent: broker, worktree, provider, MCP, and memory architecture.
- Coder Agent: implementation in Go, TypeScript, React, and scripts.
- Reviewer Agent: Office Rule, security, quality, and wiki consistency review.
- Tester Agent: TDD, regression tests, evals, and verification notes.
- Ops Agent: lefthook, deployment, tmux/zellij, provider setup, and wiki sync.

## Shared Contract

Every subagent must:

- Preserve push-driven broker operation.
- Preserve fresh sessions per turn.
- Preserve per-agent git worktree isolation.
- Preserve Notebook-to-Wiki manual promotion.
- Preserve Claude-powered and Codex-powered runtime selection.
- Use scoped MCP tools only.
- Leave durable lessons in Notebook before suggesting Wiki promotion.

