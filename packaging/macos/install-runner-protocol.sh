#!/bin/sh
set -e

RUNNER_PATH="${1:-$(command -v laf-runner || true)}"
if [ -z "$RUNNER_PATH" ]; then
  printf "laf-runner was not found on PATH. Pass the full path as the first argument.\n" >&2
  exit 1
fi

RUNNER_PATH="$(cd "$(dirname "$RUNNER_PATH")" && pwd)/$(basename "$RUNNER_PATH")"
APP_DIR="${HOME}/Applications/LAF Runner Link.app"

mkdir -p "${HOME}/Applications"
rm -rf "$APP_DIR"

osacompile -o "$APP_DIR" \
  -e "on open location runnerURL" \
  -e "  do shell script quoted form of \"$RUNNER_PATH\" & \" pair-url \" & quoted form of runnerURL" \
  -e "end open location"

PLIST="${APP_DIR}/Contents/Info.plist"
/usr/libexec/PlistBuddy -c "Set :CFBundleIdentifier team.laf-office.runner-link" "$PLIST"
/usr/libexec/PlistBuddy -c "Delete :CFBundleURLTypes" "$PLIST" >/dev/null 2>&1 || true
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes array" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0 dict" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLName string LAF Runner" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes array" "$PLIST"
/usr/libexec/PlistBuddy -c "Add :CFBundleURLTypes:0:CFBundleURLSchemes:0 string laf-runner" "$PLIST"

"/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister" -f "$APP_DIR"

printf "Registered laf-runner:// URL handler at %s\n" "$APP_DIR"
