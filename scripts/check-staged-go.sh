#!/usr/bin/env sh
set -eu

mode="${1:-}"

staged_go_files() {
  git diff --cached --name-only --diff-filter=ACM | grep -E '\.go$' || true
}

case "$mode" in
  gofmt)
    files="$(staged_go_files)"
    [ -z "$files" ] && exit 0
    unformatted="$(printf '%s\n' "$files" | xargs gofmt -l)"
    if [ -n "$unformatted" ]; then
      echo "gofmt needs to be run on:" >&2
      echo "$unformatted" >&2
      echo "Run: gofmt -w <file>" >&2
      exit 1
    fi
    ;;

  golangci-lint)
    files="$(staged_go_files)"
    [ -z "$files" ] && exit 0
    if ! command -v golangci-lint >/dev/null 2>&1; then
      echo "golangci-lint not found; skipping pre-commit lint. Install it to enable this gate." >&2
      exit 0
    fi
    golangci-lint run ./...
    ;;

  *)
    echo "usage: $0 gofmt|golangci-lint" >&2
    exit 2
    ;;
esac
