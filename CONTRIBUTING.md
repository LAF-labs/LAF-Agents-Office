# Contributing

Thanks for helping improve Startup Office. This repo is public MIT-licensed source for the hosted Startup Office web app, API facade, Supabase migrations, workers, and release checks.

## Before You Start

- Open an issue for larger behavior changes or security-sensitive work.
- Keep pull requests small and focused.
- Do not commit secrets, customer data, local `.env` files, screenshots with private data, or generated evidence that contains private text.
- Follow the existing code style and avoid unrelated refactors.

## Local Setup

```bash
bun install
cd web && bun install
```

Copy `.env.example` to `.env.local` only when you need local hosted API work. Use local/test credentials; never commit real credentials.

## Useful Checks

Run the narrowest checks that cover your change:

```bash
npm run startup-office:surface
npm run hosted-env:preflight:test
node --test api/hosted-api.test.js
cd web && bun run typecheck && bun run build
```

If a check is blocked by missing local credentials or unrelated existing issues, note that clearly in the pull request.

## Pull Requests

Include:

- what changed
- why it changed
- checks run
- any known limitations or follow-up work

Security fixes should follow [SECURITY.md](SECURITY.md) instead of public issue discussion when the details could help an attacker.
