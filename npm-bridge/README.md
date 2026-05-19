# laf-bridge

`laf-bridge` is the local execution bridge for hosted LAF Office workspaces.
It supports macOS, Linux, and Windows on x64 or arm64.

Pair your computer with the hosted workspace:

```sh
npx laf-bridge pair
```

Create the setup code in Settings -> LAF Bridge, run the command, and paste the
code when prompted. After pairing, the bridge keeps running and polls the hosted
API for work. It executes local Codex or Claude CLI tasks on your machine and
uses managed project checkouts for hosted GitHub-backed tasks. Logs, receipts,
and file-change summaries are reported back to the web workspace.
