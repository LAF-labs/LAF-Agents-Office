# LAF-Office

<p align="center">
  <img src="assets/hero.png" alt="LAF-Office onboarding — Your AI team, visible and working." width="720" />
</p>

[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/gjSySC3PzV)
[![License: MIT](https://img.shields.io/badge/License-MIT-A87B4F)](LICENSE)
[![Go](https://img.shields.io/badge/Go-1.25+-00ADD8?logo=go&logoColor=white)](go.mod)

### AI workspace for small startup teams.

LAF-Office is a local-first workspace where founder teams plan product work with AI agents, keep durable context in a markdown LLM wiki, and hand implementation tasks to connected coding runtimes.

One command. One shared office. Product, planning, engineering, and review agents are visible in channels, claiming tasks and producing work instead of disappearing behind an API.

> _30-second teaser — what the office feels like when the agents are actually working._

<video width="630" height="300" src="https://github.com/user-attachments/assets/36661391-a0ee-43d6-80d9-177776a53bc9"></video>

> _Full walkthrough — launch to first shipped task, end to end._

<video width="630" height="300" src="https://github.com/user-attachments/assets/f4cdffbf-4388-49bc-891d-6bd050ff8247"></video>

## Get Started

**Prerequisites:** one coding agent CLI — [Claude Code](https://docs.anthropic.com/en/docs/claude-code) by default, or [Codex CLI](https://github.com/openai/codex) when you pass `--provider codex`.

```bash
npx laf-office
```

That's it. The browser opens automatically and you're in the office.

Prefer a global install?

```bash
npm install -g laf-office && laf-office
```

Building from source (requires Go):

```bash
git clone https://github.com/LAF-labs/LAF-Agents-Office.git
cd laf-office
go build -o laf-office ./cmd/laf-office
./laf-office
```

> **Forking this?** See [FORKING.md](FORKING.md) for swapping branding and adding your own agent packs. For the internals, see [ARCHITECTURE.md](ARCHITECTURE.md).

> **Stability:** pre-1.0. `main` moves daily. Pin your fork to a release tag, not `main`.

## Setup prompt (for AI agents)

Paste this into Claude Code, Codex, or Cursor and let your agent drive the install:

```text
Set up https://github.com/LAF-labs/LAF-Agents-Office for me. Read `README.md` first, then run
`npx laf-office` to install and launch the office — the web UI opens at
http://localhost:7891 automatically.

Once it is running, confirm you can see #general, the team of agents, and the
composer. If anything looks off, re-read the "What You Should See" and "Other
Commands" sections of README.md before retrying — do not skip to flags.

For agent conventions and the MCP tools each teammate gets, read `AGENTS.md`.
For internals and how the broker, workspaces, and memory fit together, read
`ARCHITECTURE.md`. If I mention forking or rebranding, read `FORKING.md`.

After it is installed and running, open https://github.com/LAF-labs/LAF-Agents-Office in my
browser. If I am logged in to GitHub, ask me whether you should star the repo
for me as a quick demo that the browser interaction works — only click the star
if I say yes. If I am not logged in, just open https://laf-office.team.
```

## Options

| Flag | What it does |
|------|-------------|
| `--no-open` | Don't auto-open the browser |
| `--opus-ceo` | Upgrade CEO from Sonnet to Opus |
| `--provider <name>` | LLM provider override (`claude-code`, `codex`) |
| `--collab` | Start in collaborative mode — all agents see all messages (this is the default) |
| `--unsafe` | Bypass agent permission checks (local dev only) |
| `--web-port <n>` | Change the web UI port (default 7891) |

## Memory: Notebooks and the Wiki

Every agent gets its own **notebook**. The team shares a **wiki**. New installs get the wiki as a local git repo of markdown articles — file-over-app, readable, `git clone`-able.

**The promotion flow:**

1. Agent works on a task and writes raw context, observations, and tentative conclusions to its **notebook** (per-agent, scoped, local to LAF-Office).
2. When something in the notebook looks durable (a recurring playbook, a verified entity fact, a confirmed preference), the agent gets a promotion hint.
3. The agent promotes it to the **wiki** (workspace-wide markdown). Now every other agent can query it.
4. The wiki points other agents at whoever last recorded the context, so they know who to @mention for fresher working detail.

Nothing is promoted automatically. Agents decide what graduates from notebook to wiki.

**The wiki is local markdown.**

New installs use a git-backed markdown wiki at `~/.laf-office/wiki/`. It supports sourced facts, per-entity fact logs, LLM-synthesized briefs committed under the `archivist` identity, `/lookup` cited-answer retrieval, and `/lint` checks for contradictions, stale claims, and broken cross-references. It is readable with normal tools: `cat`, `rg`, `git log`, and `git clone` all work.

**Internal naming (for code spelunkers):** the notebook is `private` memory, the wiki is `shared` memory. On the team-wiki backend (`markdown`) the MCP tools are `notebook_write | notebook_read | notebook_list | notebook_search | notebook_promote | team_wiki_read | team_wiki_search | team_wiki_list | team_wiki_write | laf_office_wiki_lookup | run_lint | resolve_contradiction`. See `DESIGN-WIKI.md` for the reading view and `docs/specs/WIKI-SCHEMA.md` for the operational contract.

## Other Commands

The examples below assume `laf-office` is on your `PATH`. If you just built the binary and haven't moved it, prefix with `./` (as in Get Started above) or run `go install ./cmd/laf-office` to drop it in `$GOPATH/bin`.

```bash
laf-office init          # First-time setup
laf-office shred         # Kill a running session
laf-office --1o1         # 1:1 with the CEO
laf-office --1o1 cro     # 1:1 with a specific agent
```

## What You Should See

- A browser tab at `localhost:7891` with the office
- `#general` as the shared channel
- The team visible and working
- A composer to send messages and slash commands

If it feels like a hidden agent loop, something is wrong. The work should be visible in channels, tasks, receipts, and the wiki.

## Project Task Boards

The Tasks app includes a lightweight Jira-style project board. Create projects,
switch the board by project, and keep the existing LAF-Office task lifecycle
(`open`, `in_progress`, `review`, `blocked`, `done`, `canceled`) scoped to that
project. The same project tasks are available through `/projects` and
`/tasks?project_id=<id>` for local automation.

See [docs/specs/PROJECT-TASK-TRACKING-MVP.md](docs/specs/PROJECT-TASK-TRACKING-MVP.md).

## Login and Team Sessions

The web UI now starts with a local login/signup gate. A new user can create a
workspace team, or join an existing team with an invite token. Auth creates an
HTTP-only session cookie and attaches users/invites to a `team_id`; the broker
bearer token remains available for local agent and CLI workflows. Member roles
and invites live in Settings → Team.

See [docs/specs/AUTH-SESSIONS-MVP.md](docs/specs/AUTH-SESSIONS-MVP.md).

## Human Teammate Invites

The Team sidebar can invite human teammates by email. If SMTP is configured,
LAF-Office sends the invite directly; otherwise it creates a copyable invite link and
`mailto:` draft. Opening the invite link lets the teammate create an account and
join the inviter's team.

See [docs/specs/HUMAN-INVITES-MVP.md](docs/specs/HUMAN-INVITES-MVP.md).

## Why LAF-Office

| Feature | How it works |
|---|---|
| Sessions | Fresh per turn (no accumulated context) |
| Tools | Per-agent scoped (DM loads 4, full office loads 27) |
| Agent wakes | Push-driven (zero idle burn) |
| Live visibility | Stdout streaming |
| Mid-task steering | DM any agent, no restart |
| Runtimes | Use Claude Code, Codex, or Opencode-backed agents in one workspace |
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

Accumulated-session orchestrators grow from 124k to 484k input per turn over the same session. LAF-Office stays flat. 7x difference measured over 8 turns.

**Fresh sessions.** Each agent turn starts clean. No conversation history accumulates.

**Prompt caching.** Claude Code gets 97% cache read because identical prompt prefixes across fresh sessions align with Anthropic's prompt cache.

**Per-role tools.** DM mode loads 4 MCP tools instead of 27. Fewer tool schemas = smaller prompt = better cache hits.

**Zero idle burn.** Agents only spawn when the broker pushes a notification. No heartbeat polling.

### Reproduce it

```bash
laf-office --pack starter &
./scripts/benchmark.sh
```

All numbers are live-measured on your machine with your keys.

## Claim Status

Every claim in this README, grounded to the code that makes it true.

| Claim | Status | Where it lives |
|---|---|---|
| CEO on Sonnet by default, `--opus-ceo` to upgrade | ✅ shipped | `internal/team/headless_claude.go:203` |
| Collaborative mode default, `/focus` (in-app) to switch to CEO-routed delegation | ✅ shipped | `cmd/laf-office/channel.go` (`/collab`, `/focus`) |
| Per-agent MCP scoping (DM loads 4 tools, not 27) | ✅ shipped | `internal/teammcp/` |
| Fresh session per turn (no `--resume` accumulation) | ✅ shipped | `internal/team/headless_claude.go` |
| Push-driven agent wakes (no heartbeat) | ✅ shipped | `internal/team/broker.go` |
| Workspace isolation per agent | ✅ shipped | `internal/team/worktree.go` |
| `laf-office import` — migrate from external orchestrator state | ✅ shipped | `cmd/laf-office/import.go` |
| Live web-view agent streaming | 🟡 partial | `web/index.html` + broker stream |
| Prebuilt binary via goreleaser | 🟡 config ready | `.goreleaser.yml` — tags pending |
| Resume in-flight work on restart | ✅ shipped v0.0.2.0 | see `CHANGELOG.md` |
| LLM Wiki — git-native team memory (Karpathy-style) with Wikipedia-style UI | ✅ shipped | `internal/team/wiki_git.go`, `internal/team/wiki_worker.go`, `web/src/components/wiki/`, `DESIGN-WIKI.md` |
| Markdown team wiki as default shared memory | ✅ shipped | `internal/config/config.go` (`MemoryBackendMarkdown`) |

Legend: ✅ shipped · 🟡 partial · 🔜 planned. If a claim and a status disagree, the code wins — file an issue.

## Evaluate This Repo

Before you fork, run this prompt against the codebase with any AI coding assistant (Claude Code, Cursor, Codex, etc.). It tells the assistant to play a cynical senior engineer doing a fork-or-skip review — no marketing spin, just file paths, line numbers, and a verdict in under 500 words. Drop it in, read the answer, decide.

```
You are a cynical senior engineer evaluating whether to fork this repo as the
base for a multi-agent terminal office product. No prior context — explore it
as you naturally would. Tell me: should I fork this, and what's your honest
take? Be specific: file paths, line numbers, actual evidence. "The docs are
bad" is useless. Under 500 words.
```

We run this ourselves before every release. If the AI finds something we missed, [file an issue](https://github.com/LAF-labs/LAF-Agents-Office/issues).

## Watch the wiki write itself

5-minute terminal walkthrough of the Karpathy LLM-wiki loop: an agent records five facts, the synthesis threshold fires, the broker shells out to your own LLM CLI, the result commits to a git repo under the `archivist` identity, and the full author chain is visible in `git log`.

```bash
LAF_OFFICE_MEMORY_BACKEND=markdown HOME="$HOME/.laf-office-dev-home" \
  ./laf-office-dev --broker-port 7899 --web-port 7900 &
./scripts/demo-entity-synthesis.sh
```

Requirements: `curl`, `python3`, a running broker with the default markdown wiki, and any supported LLM CLI (`claude`, `codex`, or `opencode`) on PATH. Env vars `BROKER`, `ENTITY_KIND`, `ENTITY_SLUG`, `AGENT_SLUG`, `THRESHOLD` override the defaults — see the header of `scripts/demo-entity-synthesis.sh`.
