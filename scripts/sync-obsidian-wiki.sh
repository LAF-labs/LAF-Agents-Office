#!/usr/bin/env bash
# One-way sync from the canonical local LAF Wiki into the repo Obsidian mirror.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
wiki_root="${LAF_OFFICE_WIKI_HOME:-$HOME/.laf-office/wiki}"
mirror="${LAF_OFFICE_OBSIDIAN_MIRROR:-$repo_root/docs/wiki-mirror}"
cmd="${1:-status}"

usage() {
  cat <<'USAGE'
usage: sync-obsidian-wiki.sh [status|pull]

status  Show canonical wiki and mirror paths.
pull    Copy ~/.laf-office/wiki/ into docs/wiki-mirror/ for Obsidian browsing.

The sync is intentionally one-way. Promote Notebook drafts through LAF-Office,
not by editing the mirror.
USAGE
}

case "$cmd" in
  status)
    printf 'wiki:   %s\n' "$wiki_root"
    printf 'mirror: %s\n' "$mirror"
    [ -d "$wiki_root" ] || printf 'warning: wiki root does not exist yet\n' >&2
    ;;
  pull)
    if [ ! -d "$wiki_root" ]; then
      printf 'error: wiki root not found: %s\n' "$wiki_root" >&2
      exit 1
    fi
    mkdir -p "$mirror"
    if command -v rsync >/dev/null 2>&1; then
      rsync -a --delete --exclude '.git/' "$wiki_root"/ "$mirror"/
    else
      find "$mirror" -mindepth 1 ! -name README.md -exec rm -rf {} +
      cp -R "$wiki_root"/. "$mirror"/
      rm -rf "$mirror/.git"
    fi
    printf 'synced wiki mirror: %s\n' "$mirror"
    ;;
  -h|--help)
    usage
    ;;
  *)
    printf 'error: unknown command: %s\n' "$cmd" >&2
    usage >&2
    exit 2
    ;;
esac

