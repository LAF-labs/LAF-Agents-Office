#!/usr/bin/env bash
# smoke-broker-restart.sh — boot laf-office, mutate state via the real HTTP
# API, kill the process, reboot, and verify the mutation survived. This
# is the binary-level canary for Broker state persistence: a serialization
# or path-resolution regression that every Go test still passes would
# fail here because the process actually starts over.
#
# Runs entirely under a disposable sandbox:
#   - LAF_OFFICE_RUNTIME_HOME → per-run tempdir (onboarded.json, broker-state.json land here)
#   - LAF_OFFICE_BROKER_TOKEN_FILE → tempdir sibling (doesn't collide with
#     any live laf-office using /tmp/laf-office-broker-token)
#   - Alternate broker+web ports (27890/27891 default; override with
#     PORT=<N> for web port, broker port = PORT-1)
#
# Usage:
#   scripts/smoke-broker-restart.sh [path-to-laf-office-binary]
#   PORT=37891 scripts/smoke-broker-restart.sh ./laf-office
#
# Exits 0 on pass, non-zero on any boot failure or missing mutation.

set -euo pipefail

BIN="${1:-$PWD/laf-office}"
if [ ! -x "$BIN" ]; then
  echo "[smoke] laf-office binary not executable at: $BIN" >&2
  echo "[smoke]   build with: go build -o laf-office ./cmd/laf-office" >&2
  exit 2
fi

web_port="${PORT:-27891}"
broker_port="$((web_port - 1))"

sandbox="$(mktemp -d -t laf-office-smoke-XXXXXX)"
export LAF_OFFICE_RUNTIME_HOME="$sandbox/runtime"
export LAF_OFFICE_BROKER_TOKEN_FILE="$sandbox/broker-token"
mkdir -p "$LAF_OFFICE_RUNTIME_HOME/.laf-office"

echo "[smoke] sandbox=$sandbox"
echo "[smoke] broker=$broker_port web=$web_port"

# Pre-seed onboarded.json so laf-office boots into shell mode rather than the
# wizard. Otherwise the /channels endpoint is gated behind onboarding.
cat > "$LAF_OFFICE_RUNTIME_HOME/.laf-office/onboarded.json" <<JSON
{"version":1,"completed_at":"2026-01-01T00:00:00Z","company_name":"smoke-test"}
JSON

pid=""
kill_laf_office() {
  local p="$1"
  [ -n "$p" ] || return 0
  kill -0 "$p" 2>/dev/null || return 0
  kill -TERM "$p" 2>/dev/null || true
  for _ in $(seq 1 50); do
    kill -0 "$p" 2>/dev/null || return 0
    sleep 0.1
  done
  kill -KILL "$p" 2>/dev/null || true
  wait "$p" 2>/dev/null || true
}

cleanup() {
  kill_laf_office "${pid:-}"
  rm -rf "$sandbox"
}
trap cleanup EXIT

start_laf_office() {
  local label="$1"
  echo "[smoke] starting laf-office ($label)"
  "$BIN" --no-open --broker-port "$broker_port" --web-port "$web_port" --no-nex \
    </dev/null > "$sandbox/laf-office-$label.log" 2>&1 &
  pid=$!
  for _ in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:$web_port/onboarding/state" -o /dev/null; then
      echo "[smoke] laf-office ready ($label, pid=$pid)"
      return 0
    fi
    sleep 1
  done
  echo "[smoke] laf-office failed to become ready ($label)" >&2
  cat "$sandbox/laf-office-$label.log" >&2
  exit 1
}

stop_laf_office() {
  kill_laf_office "${pid:-}"
  pid=""
  # Wait for the port to free up so the reboot can rebind. /dev/tcp is a
  # bash-only virtual device — if you ever switch the shebang to /bin/sh
  # this loop no-ops silently.
  for _ in $(seq 1 10); do
    if ! (exec 3<>/dev/tcp/127.0.0.1/"$web_port") 2>/dev/null; then break; fi
    sleep 1
  done
}

# ── Phase 1: boot, mutate, stop ─────────────────────────────────────────
start_laf_office first
token="$(cat "$LAF_OFFICE_BROKER_TOKEN_FILE")"
if [ -z "$token" ]; then
  echo "[smoke] empty broker token" >&2
  exit 1
fi

echo "[smoke] POST /channels create smoke-channel"
status=$(curl -sS -o "$sandbox/post-resp.json" -w '%{http_code}' \
  -X POST "http://127.0.0.1:$broker_port/channels" \
  -H "Authorization: Bearer $token" \
  -H "Content-Type: application/json" \
  -d '{"action":"create","slug":"smoke-channel","name":"Smoke","description":"canary","created_by":"ceo"}')
if [ "$status" != "200" ]; then
  echo "[smoke] POST /channels failed: status=$status body=$(cat "$sandbox/post-resp.json")" >&2
  exit 1
fi

state_file="$LAF_OFFICE_RUNTIME_HOME/.laf-office/team/broker-state.json"
if [ ! -f "$state_file" ]; then
  echo "[smoke] state file missing after mutation: $state_file" >&2
  exit 1
fi
if ! grep -q '"smoke-channel"' "$state_file"; then
  echo "[smoke] state file does not contain smoke-channel:" >&2
  head -c 2000 "$state_file" >&2
  exit 1
fi

stop_laf_office

# ── Phase 2: reboot, verify survival ────────────────────────────────────
start_laf_office second
token="$(cat "$LAF_OFFICE_BROKER_TOKEN_FILE")"
resp=$(curl -sSf "http://127.0.0.1:$broker_port/channels" \
  -H "Authorization: Bearer $token")
if ! printf '%s' "$resp" | grep -q '"smoke-channel"'; then
  echo "[smoke] mutation lost across restart; GET /channels body:" >&2
  printf '%s\n' "$resp" | head -c 2000 >&2
  exit 1
fi

echo "[smoke] PASS — smoke-channel survived restart"
