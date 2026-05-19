# LAF Bridge Engineering Plan

Status: superseded by the Bridge-first hosted execution model.

The product now exposes one local execution component: LAF Bridge. A user pairs
their local computer with the hosted workspace through:

```sh
npx laf-bridge pair
```

The hosted UI creates a setup code and LAF Bridge prompts for it. Bridge owns
local CLI detection, Codex/Claude invocation, git/filesystem access, heartbeats,
pending execution plan polling, event upload, and completion receipts. The
hosted web/API layer owns auth, product state, and dispatch only.

For the active architecture, see:

- [HOSTED-PRODUCT-BOUNDARY.md](HOSTED-PRODUCT-BOUNDARY.md)
- [HOSTED-BRIDGE-PROTOCOL.md](HOSTED-BRIDGE-PROTOCOL.md)
- [HOSTED-DEPLOYMENT-RUNBOOK.md](HOSTED-DEPLOYMENT-RUNBOOK.md)
