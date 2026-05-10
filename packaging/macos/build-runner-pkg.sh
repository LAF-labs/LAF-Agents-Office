#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
VERSION="${VERSION:-$(cat "$REPO_ROOT/VERSION" 2>/dev/null || printf "0.0.0-dev")}"
OUT_DIR="${OUT_DIR:-$REPO_ROOT/dist}"
RUNNER_PATH="${RUNNER_PATH:-}"
IDENTIFIER="${IDENTIFIER:-team.laf-office.runner}"
SIGN_IDENTITY="${MACOS_INSTALLER_SIGN_IDENTITY:-}"

if ! command -v pkgbuild >/dev/null 2>&1; then
  printf "pkgbuild is required. Run this on macOS with Xcode command line tools installed.\n" >&2
  exit 1
fi

case "$(uname -m)" in
  arm64) GOARCH=arm64 ;;
  x86_64) GOARCH=amd64 ;;
  *) printf "Unsupported macOS architecture: %s\n" "$(uname -m)" >&2; exit 1 ;;
esac

STAGE="$(mktemp -d)"
cleanup() {
  rm -rf "$STAGE"
}
trap cleanup EXIT INT TERM

mkdir -p "$STAGE/root/usr/local/bin"
mkdir -p "$STAGE/root/usr/local/lib/laf-office"
mkdir -p "$STAGE/scripts"
mkdir -p "$OUT_DIR"

if [ -z "$RUNNER_PATH" ]; then
  RUNNER_PATH="$STAGE/laf-runner"
  (cd "$REPO_ROOT" && GOOS=darwin GOARCH="$GOARCH" CGO_ENABLED=0 go build -o "$RUNNER_PATH" ./cmd/laf-runner)
fi

install -m 0755 "$RUNNER_PATH" "$STAGE/root/usr/local/bin/laf-runner"
install -m 0755 "$SCRIPT_DIR/install-runner-protocol.sh" "$STAGE/root/usr/local/lib/laf-office/install-runner-protocol.sh"

cat >"$STAGE/scripts/postinstall" <<'POSTINSTALL'
#!/bin/sh
set -e

RUNNER_PATH="/usr/local/bin/laf-runner"
APP_DIR="/Applications/LAF Runner Link.app"

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

chown -R root:wheel "$APP_DIR" >/dev/null 2>&1 || true
"/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister" -f "$APP_DIR" >/dev/null 2>&1 || true

exit 0
POSTINSTALL
chmod 0755 "$STAGE/scripts/postinstall"

UNSIGNED_PKG="$OUT_DIR/laf-runner-macos-$GOARCH-$VERSION.pkg"
pkgbuild \
  --root "$STAGE/root" \
  --scripts "$STAGE/scripts" \
  --identifier "$IDENTIFIER" \
  --version "$VERSION" \
  --install-location "/" \
  "$UNSIGNED_PKG"

if [ -n "$SIGN_IDENTITY" ]; then
  SIGNED_PKG="$OUT_DIR/laf-runner-macos-$GOARCH-$VERSION-signed.pkg"
  productsign --sign "$SIGN_IDENTITY" "$UNSIGNED_PKG" "$SIGNED_PKG"
  printf "Created %s\n" "$SIGNED_PKG"
else
  printf "Created %s\n" "$UNSIGNED_PKG"
fi
