# FORKING LAF-Office

Honest instructions for making LAF-Office yours in about 45 minutes. This file
is maintained; if any step breaks, file an issue.

Before you fork, read [`ARCHITECTURE.md`](ARCHITECTURE.md). It's one page.

## 0. Pin to a release tag, not `main`

`main` moves daily. Fork from a tag.

```bash
git clone https://github.com/LAF-labs/LAF-Agents-Office.git
cd laf-office
git checkout "$(git describe --tags --abbrev=0)"
git checkout -b your-fork
```

## 1. Keep the Wiki Local

LAF-Office currently uses the local markdown team wiki as its default project
memory surface. CRM, email, calendar, notification, and hosted action
integrations are intentionally unavailable in this build.

Use:

```bash
./laf-office --memory-backend markdown
```

## 2. Strip the Office Branding

LAF-Office uses Office-themed copy throughout the UI and prompts. If you're
shipping this to customers, a non-English market, or a different internal
audience, start here:

| File | What to change |
|---|---|
| `README.md` | Product positioning and setup copy |
| `website/index.html` | Public website copy |
| `web/src/` | Web app labels and settings copy |
| `cmd/laf-office/channel.go` | TUI welcome messages and slash command copy |
| `cmd/laf-office/channel_render.go` | TUI status lines |
| `internal/team/launcher.go` | Agent prompt guidance |
| `internal/agent/packs.go` | Default team packs and skills |

Rename the binary in `cmd/laf-office/` plus `go.mod` if you want a different
command name.

## 3. Add Your Own Agent Pack

Packs live in Go (`internal/agent/packs.go`) as a static slice. Recompile after
editing.

```go
{
    Slug:        "my-team",
    Name:        "My Team",
    Description: "What this pack is for",
    LeadSlug:    "lead",
    Agents: []AgentConfig{
        {
            Slug:           "lead",
            Name:           "Team Lead",
            Expertise:      []string{"your", "domains"},
            Personality:    "One-sentence persona",
            PermissionMode: "plan",
        },
    },
}
```

Rebuild and launch:

```bash
go build -o laf-office ./cmd/laf-office
./laf-office --pack my-team
```

## 4. Cut a Release of Your Fork

`.goreleaser.yml` is already configured. Edit the `release.github.owner/name`
to point at your repo, then:

```bash
git tag v0.1.0
goreleaser release --clean
```

## What's Intentionally Hard To Change

- **Broker push model.** It's the architectural spine.
- **Per-turn fresh sessions.** This is the reason for the benchmark win.
- **Git worktree isolation.** Each agent works in its own branch.

Fork anything above the broker freely. Fork the broker and you're building a
different project.
