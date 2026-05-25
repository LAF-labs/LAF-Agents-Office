# LAF Agents Office

LAF Agents Office is a cloud AI Startup Office for founders and small teams. It gives one company workspace a CEO-style AI operating layer: company context, AI agents, skills, wiki memory, growth loops, requests, artifacts, decisions, and team collaboration.

## Product Direction

- One account starts with one company workspace.
- Workspace owners can invite teammates and assign roles.
- The app runs in the cloud through the hosted web UI and API.
- Skills, wiki, growth center, and operating loops are first-class product surfaces.
- Customer workflows stay inside the hosted workspace, API, and cloud workers.

## Development

```bash
npm run startup-office:surface
npm run hosted-env:preflight:test
node --test api/hosted-api.test.js
cd web && bun run typecheck && bun run build
```

For local frontend work:

```bash
cd web
bun install
bun run dev
```

## Deployment Environment

Copy `.env.example` to `.env.local` for local hosted API work, and mirror production values into the deployment platform:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LAF_OFFICE_PUBLIC_HOST`
- optional `LAF_OFFICE_PUBLIC_API_BASE_URL`
- optional `VITE_LAF_API_BASE_URL`
- optional `LAF_OFFICE_ALLOWED_ORIGINS`

Validate with:

```bash
npm run hosted-env:preflight
```

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md).
