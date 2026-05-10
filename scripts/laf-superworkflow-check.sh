#!/usr/bin/env bash
# Reviewer/Tester gates for the LAF Claude/Codex Superworkflow.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

mode="${1:-all}"
scope="${2:-worktree}"

failures=0

fail() {
  printf 'FAIL: %s\n' "$*" >&2
  failures=$((failures + 1))
}

info() {
  printf '==> %s\n' "$*"
}

tracked_changes() {
  if [ "$scope" = "--staged" ]; then
    git diff --cached --name-only --diff-filter=ACMR
  else
    {
      git diff --name-only --diff-filter=ACMR HEAD
      git ls-files --others --exclude-standard
    } | sort -u
  fi
}

changed_files="$(tracked_changes || true)"

has_changed() {
  pattern="$1"
  printf '%s\n' "$changed_files" | grep -E "$pattern" >/dev/null 2>&1
}

diff_added() {
  if [ "$scope" = "--staged" ]; then
    git diff --cached --diff-filter=ACMR -U0 -- "$@"
  else
    git diff --diff-filter=ACMR -U0 HEAD -- "$@"
  fi
}

run_reviewer() {
  info "Reviewer gate"

  for required in \
    CLAUDE.md \
    .laf-office/subagents/README.md \
    .claude/agents/laf-architect.md \
    docs/specs/HARNESS-RATCHET.md \
    docs/specs/memory-superworkflow.md \
    claude-code-plugin/commands/Superpowers.md \
    claude-code-plugin/commands/Security.md \
    claude-code-plugin/commands/TDD-Guard.md \
    claude-code-plugin/commands/Office-Rules.md \
    claude-code-plugin/commands/LAF-Specific-Rules.md
  do
    [ -f "$required" ] || fail "missing required superworkflow file: $required"
  done

  if [ "$scope" = "--staged" ]; then
    git diff --cached --check || fail "staged diff has whitespace/conflict issues"
  else
    git diff --check || fail "working diff has whitespace/conflict issues"
  fi

  if diff_added | grep -iE '^\+.*(api_token|password|api_key|secret)\s*[:=]\s*['"'"'"][^'"'"'"]+['"'"'"]' \
    | grep -vE 'placeholder|example|fake|your_|os\.Getenv|environ\.get' >/tmp/laf-superworkflow-secret.$$ 2>/dev/null; then
    cat /tmp/laf-superworkflow-secret.$$ >&2
    rm -f /tmp/laf-superworkflow-secret.$$
    fail "possible secret in diff"
  fi
  rm -f /tmp/laf-superworkflow-secret.$$

  if diff_added internal/team internal/provider 2>/dev/null \
    | grep -E '^\+.*(time\.NewTicker|time\.Tick|time\.Sleep)' \
    | grep -v '_test\.go' >/tmp/laf-superworkflow-polling.$$ 2>/dev/null; then
    cat /tmp/laf-superworkflow-polling.$$ >&2
    rm -f /tmp/laf-superworkflow-polling.$$
    fail "possible polling/sleep added near broker/provider paths"
  fi
  rm -f /tmp/laf-superworkflow-polling.$$

  for cmd in hire-agent assign-task daily-standup review-office promote-to-wiki fix-bug deploy-simulation ratchet; do
    [ -f "claude-code-plugin/commands/$cmd.md" ] || fail "missing plugin command: $cmd.md"
  done

  info "Reviewer gate complete"
}

run_tester() {
  info "Tester gate"

  if has_changed '\.go$'; then
    if [ "$scope" = "--staged" ] && has_changed '^internal/commands/'; then
      go test ./internal/commands
    elif [ "$scope" = "--staged" ]; then
      info "Go changes staged outside internal/commands; broad Go tests run at pre-push"
    else
      ./scripts/test-go.sh
    fi
  else
    info "No Go changes detected"
  fi

  if has_changed '^web/.*\.(ts|tsx|js|jsx|css|json)$'; then
    if command -v bun >/dev/null 2>&1; then
      (cd web && bun run typecheck)
      if [ "$scope" != "--staged" ]; then
        (cd web && bun run test)
      fi
    else
      fail "web files changed but bun is not on PATH"
    fi
  else
    info "No web source changes detected"
  fi

  info "Tester gate complete"
}

case "$mode" in
  reviewer)
    run_reviewer
    ;;
  tester)
    run_tester
    ;;
  all)
    run_reviewer
    run_tester
    ;;
  -h|--help)
    cat <<'USAGE'
usage: laf-superworkflow-check.sh [reviewer|tester|all] [--staged]

reviewer  Check architecture, security, command, and memory invariants.
tester    Run focused staged checks or broader worktree checks.
all       Run both gates.
USAGE
    ;;
  *)
    printf 'error: unknown mode: %s\n' "$mode" >&2
    exit 2
    ;;
esac

if [ "$failures" -gt 0 ]; then
  printf '%d superworkflow gate(s) failed\n' "$failures" >&2
  exit 1
fi

printf 'LAF superworkflow checks passed (%s, %s)\n' "$mode" "$scope"
