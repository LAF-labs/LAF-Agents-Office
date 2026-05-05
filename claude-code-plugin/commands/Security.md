---
description: Security review for LAF-Office code, tools, memory, and hooks
---

Run this skill as Reviewer before merge or overnight handoff.

Check:

- No secrets, keys, tokens, cookies, certs, or credential-shaped values.
- No destructive external action without approval gating.
- No background memory process writes canonical Wiki directly.
- No agent receives broad MCP tools without role justification.
- No provider command interpolates untrusted input unsafely.
- No hook runs a network or destructive command unexpectedly.
- No generated markdown records private credentials or customer secrets.

Expected output: findings first, severity, file references, and residual risk.

