#!/usr/bin/env bash
# Capture Claude/Codex/claude-subconscious memory into an agent Notebook draft.
# Preferred path is MCP notebook_write. This script is an offline fallback.

set -euo pipefail

agent="ceo"
source_name="manual"
title="Untitled memory"
wiki_root="${LAF_OFFICE_WIKI_HOME:-$HOME/.laf-office/wiki}"

usage() {
  cat <<'USAGE'
usage: laf-memory-capture.sh [--agent slug] [--source name] [--title text]

Reads markdown from stdin and appends it to:
  $LAF_OFFICE_WIKI_HOME/agents/{agent}/notebook/subconscious/YYYY-MM-DD.md

This writes Notebook drafts only. It never promotes to the team Wiki.
USAGE
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --agent)
      agent="${2:-}"
      shift 2
      ;;
    --source)
      source_name="${2:-}"
      shift 2
      ;;
    --title)
      title="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf 'error: unknown argument: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

agent="$(printf '%s' "$agent" | tr '[:upper:]' '[:lower:]' | tr -cd 'a-z0-9_-')"
source_name="$(printf '%s' "$source_name" | tr -cd '[:alnum:]_.:-')"

if [ -z "$agent" ]; then
  printf 'error: --agent must contain at least one safe slug character\n' >&2
  exit 2
fi

if [ ! -d "$wiki_root" ]; then
  printf 'error: wiki root not found: %s\n' "$wiki_root" >&2
  printf 'hint: start laf-office once, or set LAF_OFFICE_WIKI_HOME.\n' >&2
  exit 1
fi

body="$(cat)"
if [ -z "$(printf '%s' "$body" | tr -d '[:space:]')" ]; then
  printf 'error: stdin is empty\n' >&2
  exit 2
fi

day="$(date +%F)"
stamp="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
dir="$wiki_root/agents/$agent/notebook/subconscious"
file="$dir/$day.md"

mkdir -p "$dir"

{
  printf '\n## %s\n\n' "$title"
  printf '- captured_at: `%s`\n' "$stamp"
  printf '- agent: `%s`\n' "$agent"
  printf '- source: `%s`\n' "${source_name:-manual}"
  printf '- status: `draft`\n'
  printf '- promotion: `manual-review-required`\n\n'
  printf '%s\n' "$body"
} >> "$file"

printf 'captured notebook draft: %s\n' "$file"
printf 'next: review, then use notebook_promote for canonical Wiki promotion.\n'

