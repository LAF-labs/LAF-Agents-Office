#!/usr/bin/env bash
set -euo pipefail

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to install the latest LAF-Office CLI." >&2
  exit 1
fi

PKG="${LAF_OFFICE_CLI_PACKAGE:-@laf-office/laf-office}"

echo "Installing latest ${PKG}..."
npm install -g "${PKG}@latest"

echo
echo "Done. Verify with:"
echo "  laf-office --version"
