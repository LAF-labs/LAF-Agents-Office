# Auth Sessions MVP

WUPHF now has a local identity layer for dogfooding team workspaces before the
full SaaS billing and tenant model.

## What ships

- `POST /auth/signup` creates a user, sets an HTTP-only session cookie, and
  either creates a new workspace team or joins an existing team by invite token.
- `POST /auth/login` verifies email/password credentials and creates a new
  session.
- `POST /auth/logout` clears the current session.
- `GET /auth/session` returns the current user and team when the session cookie
  is valid.
- `GET /auth/users` lists signed-in users for the current team.
- `PATCH /auth/users` lets an owner/admin update a teammate role.
- `GET /teams` lists local workspace teams for the auth screen.
- Protected broker routes accept either the existing broker bearer token or the
  new login session cookie, so local CLI/API workflows keep working.
- The web UI gates the office behind login/signup before showing onboarding or
  the main workspace.
- Settings → Team is the main UI for account status, member roles, and human
  teammate invites.

## Signup flows

Create a new team:

```bash
curl -X POST "$BROKER/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "founder@example.com",
    "name": "Founder",
    "password": "local-password",
    "team_action": "create",
    "team_name": "Founding Team"
  }'
```

Join with an invite:

```bash
curl -X POST "$BROKER/auth/signup" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teammate@example.com",
    "name": "Kim Teammate",
    "password": "local-password",
    "team_action": "join",
    "invite_token": "INVITE_TOKEN"
  }'
```

## Boundaries

- Password hashing is intentionally simple for this MVP and should be upgraded
  before internet-facing production use.
- Tenant isolation is minimal: users and invites carry `team_id`, but existing
  office data is not fully partitioned by team yet.
- There is no password reset, email verification, role editor, or billing.
- Role management is intentionally small: `owner`, `admin`, and `member`.
- The local broker bearer token still exists for developer tools and agents.
