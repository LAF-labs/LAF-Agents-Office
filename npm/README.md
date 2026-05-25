# LAF-Office

Hosted AI Startup Office for founders and operators.

LAF-Office gives one account one company workspace: team members, AI operators,
skills, wiki, growth center, channels, approvals, and auditable company memory
in a pure cloud workflow.

This npm package is a contributor bootstrap for running the development web
workspace from a local checkout. Production users should start in the hosted
web app and invite teammates into the company workspace.

## Local Developer Bootstrap

```bash
npx laf-office
```

Prefer a global install?

```bash
npm install -g laf-office && laf-office
```

Supported platforms: macOS and Linux on x64 or arm64. The native binary is
lazy-downloaded from GitHub releases on first run and cached under
`node_modules/laf-office/bin/`.

## Options

| Flag | What it does |
|------|-------------|
| `--tui` | Use the tmux TUI instead of the web UI |
| `--no-open` | Do not auto-open the browser |
| `--opus-ceo` | Upgrade CEO from Sonnet to Opus |
| `--provider <name>` | LLM provider override (`claude-code`, `codex`) |
| `--collab` | Start in collaborative mode |
| `--unsafe` | Bypass agent permission checks for local development |
| `--web-port <n>` | Change the web UI port, default `7891` |

## Product Model

- One account starts with one company workspace.
- Workspace owners can invite teammates.
- AI teammates work inside the cloud office surface.
- Skills, wiki, and growth center are first-class company systems.
- Human approvals, logs, and memory make AI work inspectable.

## Links

- Website: https://laf-office.team
- Source: https://github.com/LAF-labs/LAF-Agents-Office
- Issues: https://github.com/LAF-labs/LAF-Agents-Office/issues
