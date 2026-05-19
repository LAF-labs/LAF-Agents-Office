#!/usr/bin/env bash
set -euo pipefail

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to install the latest LAF-Office CLI." >&2
  exit 1
fi

PKG="${LAF_OFFICE_CLI_PACKAGE:-laf-office}"

echo "Installing latest ${PKG} developer bootstrap..."
npm install -g "${PKG}@latest"

echo
echo "Done. This package is for contributor/local developer bootstrap."
echo "Hosted production users should create a Bridge setup code in the hosted web app and run:"
echo "  npx laf-bridge pair"
echo
echo "Verify the local developer bootstrap with:"
echo "  laf-office --version"
