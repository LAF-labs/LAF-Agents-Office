#!/usr/bin/env bash
# Create a tmux role layout for 24/7 LAF development supervision.

set -euo pipefail

provider="${1:-codex}"
repo_root="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$provider" = "-h" ] || [ "$provider" = "--help" ]; then
  cat <<'USAGE'
usage: laf-squad-tmux.sh [claude-code|codex]

Creates a tmux session with architect, coder, reviewer, tester, and ops windows.
Set LAF_SQUAD_AUTOSTART=1 to launch the selected provider CLI in each window.
USAGE
  exit 0
fi

case "$provider" in
  claude-code)
    cli="claude"
    ;;
  codex)
    cli="codex"
    ;;
  *)
    printf 'error: provider must be claude-code or codex\n' >&2
    exit 2
    ;;
esac

if ! command -v tmux >/dev/null 2>&1; then
  printf 'error: tmux is not installed\n' >&2
  exit 1
fi

session="laf-office-${provider}"
roles="architect coder reviewer tester ops"

if tmux has-session -t "$session" 2>/dev/null; then
  printf 'tmux session already exists: %s\n' "$session"
  printf 'attach: tmux attach -t %s\n' "$session"
  exit 0
fi

first_role="architect"
tmux new-session -d -s "$session" -n "$first_role" -c "$repo_root"

seed_role() {
  role="$1"
  target="$session:$role"
  tmux send-keys -t "$target" "cd '$repo_root'" C-m
  tmux send-keys -t "$target" "printf '%s\n' 'LAF $role agent ($provider). Read CLAUDE.md and .laf-office/subagents/$role.md before acting.'" C-m
  if [ "${LAF_SQUAD_AUTOSTART:-0}" = "1" ]; then
    tmux send-keys -t "$target" "$cli" C-m
  else
    tmux send-keys -t "$target" "printf '%s\n' 'Run $cli when ready. Use Notebook first; promote to Wiki only after review.'" C-m
  fi
}

seed_role "$first_role"

for role in $roles; do
  [ "$role" = "$first_role" ] && continue
  tmux new-window -t "$session" -n "$role" -c "$repo_root"
  seed_role "$role"
done

tmux select-window -t "$session:architect"
printf 'created tmux session: %s\n' "$session"
printf 'attach: tmux attach -t %s\n' "$session"
