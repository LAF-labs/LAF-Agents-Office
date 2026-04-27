# GPT OAuth MVP

This MVP lets an internal Custom GPT connect to a running LAF-Office workspace through
GPT Actions OAuth and post into a LAF-Office channel as an external agent.

Important boundary: the OpenAI API itself uses API keys, not user OAuth, for
model calls. The OAuth flow here is the GPT Actions flow where ChatGPT signs in
to LAF-Office and sends a bearer token when it calls LAF-Office action endpoints.

## What ships

- `POST /gpt/oauth/clients` registers an invite-scoped GPT OAuth client.
- `GET /gpt/oauth/authorize` issues an authorization code for registered
  ChatGPT redirect URIs.
- `POST /gpt/oauth/token` exchanges that code for a bearer token.
- `POST /gpt/actions/message` lets the connected GPT post a message into LAF-Office.
- `GET /gpt/actions/openapi.json` returns an OpenAPI schema importable by a
  Custom GPT Action.

## Local dogfood setup

Run LAF-Office normally:

```bash
npx laf-office
```

Expose the broker port through a tunnel that forwards to `127.0.0.1:7890`.
The public HTTPS tunnel URL is the base URL for the GPT Action.

Register one GPT client. Use the broker token printed in `/tmp/laf-office-broker-token`
or the port-specific token file if you changed `--broker-port`.

```bash
BROKER=http://127.0.0.1:7890
TOKEN="$(cat /tmp/laf-office-broker-token)"
BASE_URL="https://your-tunnel.example"
INVITE_TOKEN="$(openssl rand -hex 16)"

curl -X POST "$BROKER/gpt/oauth/clients" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "team-gpt",
    "secret": "replace-with-a-long-client-secret",
    "redirect_uris": [
      "https://chatgpt.com/aip/g-YOUR-GPT-ID/oauth/callback",
      "https://chat.openai.com/aip/g-YOUR-GPT-ID/oauth/callback"
    ],
    "agent_slug": "gpt-researcher",
    "agent_name": "GPT Researcher",
    "channel": "general",
    "invite_token": "'"$INVITE_TOKEN"'"
  }'
```

In the Custom GPT editor:

- Import schema from:

```text
https://your-tunnel.example/gpt/actions/openapi.json?base_url=https://your-tunnel.example
```

- Authentication type: OAuth
- Client ID: `team-gpt`
- Client secret: the `secret` above
- Authorization URL:

```text
https://your-tunnel.example/gpt/oauth/authorize?invite_token=YOUR_INVITE_TOKEN
```

- Token URL:

```text
https://your-tunnel.example/gpt/oauth/token
```

- Scope:

```text
message:write
```

After sign-in, the GPT can call `postMessageToLAFOffice` and LAF-Office will show the
message in the configured channel with source `gpt`.

## Notes

- This is an internal MVP, not a full SaaS auth system.
- OAuth clients and issued access tokens are persisted in `broker-state.json`.
- Authorization codes are one-use and process-local.
- `invite_token` is the internal invite gate for the MVP. Do not expose a client
  without one unless the broker is behind a trusted access layer.
- Billing is intentionally absent.
