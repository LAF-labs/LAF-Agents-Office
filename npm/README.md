# LAF-Office

### Project workspace for startup AI agents.

A local-first project workspace where startup teams plan work with agents, keep shared memory in markdown, and connect implementation tasks to coding runtimes.

<p align="center">
  <img src="https://raw.githubusercontent.com/LAF-labs/LAF-Agents-Office/main/assets/hero.png" alt="LAF-Office onboarding — Your AI team, visible and working." width="720" />
</p>

[![npm](https://img.shields.io/npm/v/laf-office?color=A87B4F)](https://www.npmjs.com/package/laf-office)
[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/gjSySC3PzV)
[![License: MIT](https://img.shields.io/badge/License-MIT-A87B4F)](https://github.com/LAF-labs/LAF-Agents-Office/blob/main/LICENSE)

One command. One shared project workspace. CEO, PM, engineers, AI engineer, and designer — all visible, claiming tasks, updating the wiki, and shipping work instead of disappearing behind an API.

[▶ 30-second teaser and full walkthrough on GitHub](https://github.com/LAF-labs/LAF-Agents-Office#readme)

## Get Started

**Prerequisites:** one agent CLI — [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by default, or [Codex CLI](https://github.com/openai/codex) when you pass `--provider codex`. [tmux](https://github.com/tmux/tmux/wiki/Installing) is only required for `--tui` mode.

```bash
npx laf-office
```

That's it. The browser opens automatically and you're in the project workspace.

Prefer a global install?

```bash
npm install -g laf-office && laf-office
```

Supported platforms: macOS and Linux on x64 or arm64. The native binary is lazy-downloaded from [GitHub releases](https://github.com/LAF-labs/LAF-Agents-Office/releases) on first run and cached under `node_modules/laf-office/bin/`.

> **Stability:** pre-1.0. `main` moves daily. Pin to a release tag, not `main`.

## Options

| Flag | What it does |
|------|-------------|
| `--memory-backend <name>` | Pick the organizational memory backend (`markdown`, `gbrain`, `none`) |
| `--tui` | Use the tmux TUI instead of the web UI |
| `--no-open` | Don't auto-open the browser |
| `--pack <name>` | Pick a legacy project agent pack (`starter`, `founding-team`, `coding-team`) |
| `--opus-ceo` | Upgrade CEO from Sonnet to Opus |
| `--provider <name>` | LLM provider override (`claude-code`, `codex`) |
| `--collab` | Start in collaborative mode — all agents see all messages (this is the default) |
| `--unsafe` | Bypass agent permission checks (local dev only) |
| `--web-port <n>` | Change the web UI port (default 7891) |

## Memory: Notebooks and the Wiki

Every agent gets its own **notebook**. The team shares a local markdown **wiki**. When a conclusion in an agent's notebook holds up, it gets promoted to the wiki so the whole office benefits.

**Backends for the wiki:**

- `markdown` is the default local team wiki.
- `gbrain` mounts `gbrain serve` as the wiki backend.
- `none` disables the external wiki entirely. Notebooks still work locally.

```bash
laf-office --memory-backend markdown
laf-office --memory-backend gbrain
laf-office --memory-backend none
```

Internal naming for code spelunkers: notebook = `private` memory, wiki = `shared` memory.

## Other Commands

```bash
laf-office init          # First-time setup
laf-office shred         # Kill a running session
laf-office --1o1         # 1:1 with the CEO
laf-office --1o1 pm      # 1:1 with a specific agent
```

## What You Should See

- A browser tab at `localhost:7891` with the office
- `#general` as the shared channel
- The team visible and working
- A composer to send messages and slash commands

If it feels like a hidden agent loop, something is wrong. The work should be visible in channels, tasks, and the project wiki.

## Bridges

- **Telegram:** `/connect` → pick Telegram → paste bot token from [@BotFather](https://t.me/BotFather).
- **OpenClaw:** `/connect openclaw` → paste your gateway URL and `gateway.auth.token` from `~/.openclaw/openclaw.json`. Each OpenClaw session becomes a first-class office member you can `@mention`.

## External Actions

Managed CRM, calendar, notification, email-automation, and hosted action
integrations are not available in this build yet.

## Why LAF-Office

| Feature | How it works |
|---|---|
| Sessions | Fresh per turn (no accumulated context) |
| Tools | Per-agent scoped (DM loads 4, full office loads 27) |
| Agent wakes | Push-driven (zero idle burn) |
| Live visibility | Stdout streaming |
| Mid-task steering | DM any agent, no restart |
| Runtimes | Mix Claude Code, Codex, and OpenClaw in one channel |
| Memory | Per-agent notebook + shared markdown workspace wiki |
| Price | Free and open source (MIT, self-hosted, your API keys) |

## Benchmark

10-turn CEO session on Codex. All numbers measured from live runs.

| Metric | LAF-Office |
|---|---|
| Input per turn | Flat ~87k tokens |
| Billed per turn (after cache) | ~40k tokens |
| 10-turn total | ~286k tokens |
| Cache hit rate | 97% (Claude API prompt cache) |
| Claude Code cost (5-turn) | $0.06 |
| Idle token burn | Zero (push-driven, no polling) |

Accumulated-session orchestrators grow from 124k to 484k input per turn over the same session. LAF-Office stays flat.

## Links

- **Website:** https://laf-office.team
- **Source:** https://github.com/LAF-labs/LAF-Agents-Office
- **Issues:** https://github.com/LAF-labs/LAF-Agents-Office/issues
- **Discord:** https://discord.gg/gjSySC3PzV
- **Architecture:** https://github.com/LAF-labs/LAF-Agents-Office/blob/main/ARCHITECTURE.md
- **Forking guide:** https://github.com/LAF-labs/LAF-Agents-Office/blob/main/FORKING.md

## Dev override

To point the wrapper at a locally-built binary, set `LAF_OFFICE_BINARY`:

```bash
LAF_OFFICE_BINARY=./laf-office npx laf-office --version
```

## Auto-upgrade

`npm install -g` does not pull new versions on its own, so the wrapper
checks `registry.npmjs.org` once per 24h (cached at
`~/.laf-office/cache/latest-version.json`). If a newer release is available it
downloads the matching binary into `~/.laf-office/cache/binaries/` and runs it
instead — same SHA256 verification as `postinstall`. A one-line hint points
you at `npm install -g laf-office@latest` for a permanent upgrade.

Set `LAF_OFFICE_SKIP_VERSION_CHECK=1` to disable the check entirely.

MIT licensed. Free, open source, self-hosted, your API keys.
