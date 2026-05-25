# LAF Agents Office Architecture

LAF Agents Office is a pure cloud AI Startup Office. One account belongs to one company workspace, and every workspace can invite teammates, configure company memory, run operating loops, and coordinate AI agents from the hosted web app.

## System Boundary

```
Browser UI
  -> Vercel API facade
  -> Supabase auth, workspace data, wiki, skills, growth center, loop jobs
  -> Cloud AI providers
```

The product does not require local device pairing or user-side execution services. Local developer tooling remains only for contributors building the app.

## Key Modules

| Path | Responsibility |
| --- | --- |
| `api/[...path].js` | Hosted API facade for auth, workspaces, company profile, wiki, skills, messages, projects, tasks, and Startup Office loops. |
| `web/src/components/startup-office/` | Main Startup Office experience for founders and operators. |
| `web/src/components/apps/SettingsApp.tsx` | Notion-style workspace, profile, team, permissions, company, API-key, and danger-zone settings. |
| `workers/startup-office/loopEngine.js` | Cloud operating-loop worker logic and tests. |
| `supabase/migrations/` | Workspace schema and forward migrations, including removal of obsolete local execution state. |

## Principles

1. Hosted workspace state is the source of truth.
2. Users control the company workspace, team membership, permissions, memory, and approvals.
3. AI work is observable through messages, runs, artifacts, decisions, and wiki updates.
4. Local execution surfaces are outside the product boundary.
