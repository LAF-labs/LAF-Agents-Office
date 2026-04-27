# Human Invites MVP

LAF-Office can invite human teammates by email. This is a local MVP for dogfooding,
not a full SaaS identity system.

## What ships

- `POST /invites` creates a pending human invite.
- `GET /invites` lists pending invites and joined human members.
- `GET /invites/lookup?token=<token>` lets an invite page preview the invite.
- `/invite/<token>` signs the invited person up with a password and joins them
  to the invite's team.
- `POST /invites/accept` remains available as a legacy direct-accept endpoint
  for local automation.
- The sidebar Team section has an **Invite Person** modal.

## Email delivery

If SMTP is configured, LAF-Office sends the email immediately. Configure these
environment variables before starting LAF-Office:

```bash
export LAF_OFFICE_SMTP_HOST="smtp.example.com"
export LAF_OFFICE_SMTP_PORT="587"
export LAF_OFFICE_SMTP_USERNAME="smtp-user"
export LAF_OFFICE_SMTP_PASSWORD="smtp-password"
export LAF_OFFICE_SMTP_FROM="LAF-Office <team@example.com>"
```

If SMTP is not configured, the invite is still created. The UI shows a copyable
invite link and a `mailto:` link so you can send it manually.

## API example

```bash
curl -X POST "$BROKER/invites" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teammate@example.com",
    "name": "Kim Teammate",
    "created_by": "human",
    "base_url": "https://your-laf-office-url.example"
  }'
```

Accept:

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

- Team ownership is captured on invites and users, but full data partitioning is
  still future work.
- Invite tokens are bearer links.
- Remote access still requires exposing the web UI/broker behind your own secure
  tunnel or access layer.
