#!/usr/bin/env sh
set -eu

mode="${1:-}"

tmp_file() {
  mktemp "${TMPDIR:-/tmp}/laf-staged-safety.XXXXXX"
}

staged_files() {
  git diff --cached --name-only --diff-filter=ACM
}

case "$mode" in
  no-secrets)
    hits="$(tmp_file)"
    if git diff --cached --diff-filter=ACM -U0 \
      | grep -iE "(api_token|password|api_key|secret)[[:space:]]*[:=][[:space:]]*['\"][^'\"]+['\"]" \
      | grep -vE 'placeholder|example|fake|your_|os\.Getenv|environ\.get' >"$hits"; then
      cat "$hits" >&2
      rm -f "$hits"
      echo "Possible secret in staged changes" >&2
      exit 1
    fi
    rm -f "$hits"
    ;;

  no-large-files)
    failed="$(tmp_file)"
    rm -f "$failed"
    staged_files | while IFS= read -r f; do
      [ -f "$f" ] || continue
      size="$(wc -c <"$f" 2>/dev/null | tr -d ' ')"
      if [ "${size:-0}" -gt 5242880 ]; then
        echo "ERROR: $f exceeds 5MB ($((size / 1048576))MB)" >&2
        : >"$failed"
      fi
    done
    [ ! -e "$failed" ]
    ;;

  merge-conflicts)
    failed="$(tmp_file)"
    rm -f "$failed"
    staged_files | while IFS= read -r f; do
      case "$f" in
        *.go | *.yml | *.yaml | *.md | *.toml | *.json)
          [ -f "$f" ] || continue
          if grep -nE '^(<{7}|>{7}|={7})' "$f" >&2; then
            : >"$failed"
          fi
          ;;
      esac
    done
    if [ -e "$failed" ]; then
      rm -f "$failed"
      echo "Merge conflict markers found" >&2
      exit 1
    fi
    ;;

  *)
    echo "usage: $0 no-secrets|no-large-files|merge-conflicts" >&2
    exit 2
    ;;
esac
