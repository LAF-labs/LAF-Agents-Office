#!/bin/sh
set -e

REPO="LAF-labs/LAF-Agents-Office"
ARCHIVE_PREFIX="laf-office"
BINARY="${LAF_OFFICE_INSTALL_BINARY:-laf-office}"
case "$BINARY" in
  laf-office|laf-runner) ;;
  *)
    printf "Error: unsupported install binary: %s\n" "$BINARY" >&2
    printf "Supported values: laf-office, laf-runner\n" >&2
    exit 1
    ;;
esac

# Detect OS
OS="$(uname -s)"
case "$OS" in
  Darwin) OS="darwin" ;;
  Linux)  OS="linux" ;;
  *)
    printf "Error: unsupported OS: %s\n" "$OS" >&2
    exit 1
    ;;
esac

# Detect architecture
ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)  ARCH="amd64" ;;
  amd64)   ARCH="amd64" ;;
  arm64)   ARCH="arm64" ;;
  aarch64) ARCH="arm64" ;;
  *)
    printf "Error: unsupported architecture: %s\n" "$ARCH" >&2
    exit 1
    ;;
esac

# Two CI hooks, in order of how much of the install path they exercise:
#   LAF_OFFICE_INSTALL_URL_OVERRIDE   — skip resolution; download a specific tarball.
#                                  Cheap sanity check against a snapshot build.
#   LAF_OFFICE_INSTALL_REPO_BASE_URL  — override the GitHub base URL only. Still
#                                  runs the redirect-parsing + archive-name
#                                  construction that shipped broken in v0.8.1.
# Prefer the second in CI so the path that actually regressed stays covered.
REPO_BASE_URL="${LAF_OFFICE_INSTALL_REPO_BASE_URL:-https://github.com/${REPO}}"
URL="${LAF_OFFICE_INSTALL_URL_OVERRIDE:-}"
if [ -n "$URL" ]; then
  VERSION="${LAF_OFFICE_INSTALL_VERSION_OVERRIDE:-snapshot}"
  ARCHIVE="$(basename "$URL")"
else
  if [ -n "${LAF_OFFICE_INSTALL_VERSION_OVERRIDE:-}" ]; then
    VERSION="${LAF_OFFICE_INSTALL_VERSION_OVERRIDE}"
  else
    # Resolve latest version tag from GitHub redirect
    VERSION="$(curl -sSL -o /dev/null -w '%{url_effective}' "${REPO_BASE_URL}/releases/latest" | rev | cut -d'/' -f1 | rev)"
    if [ -z "$VERSION" ]; then
      printf "Error: could not determine latest version\n" >&2
      exit 1
    fi
  fi

  # goreleaser strips the leading 'v' from the tag in archive names
  VERSION_CLEAN="${VERSION#v}"
  ARCHIVE="${ARCHIVE_PREFIX}_${VERSION_CLEAN}_${OS}_${ARCH}.tar.gz"
  URL="${REPO_BASE_URL}/releases/download/${VERSION}/${ARCHIVE}"
fi

TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

printf "Downloading %s %s (%s/%s)...\n" "$BINARY" "$VERSION" "$OS" "$ARCH"
curl -sSL "$URL" -o "${TMPDIR}/${ARCHIVE}"

printf "Extracting...\n"
tar -xzf "${TMPDIR}/${ARCHIVE}" -C "$TMPDIR"

codesign_if_needed() {
  if [ "$OS" = "darwin" ] && command -v codesign >/dev/null 2>&1; then
    codesign --force --sign - "$1" >/dev/null 2>&1 || true
  fi
}

find_extracted_binary() {
  find "$TMPDIR" -type f -name "$1" 2>/dev/null | head -n 1
}

# Install binary
INSTALL_DIR="${LAF_OFFICE_INSTALL_DIR_OVERRIDE:-/usr/local/bin}"
if [ -n "${LAF_OFFICE_INSTALL_DIR_OVERRIDE:-}" ]; then
  mkdir -p "$INSTALL_DIR"
  printf "Installing to %s\n" "$INSTALL_DIR"
elif [ ! -w "$INSTALL_DIR" ]; then
  INSTALL_DIR="${HOME}/.local/bin"
  mkdir -p "$INSTALL_DIR"
  printf "Installing to %s (no write access to /usr/local/bin)\n" "$INSTALL_DIR"
fi

REQUESTED_PATH="$(find_extracted_binary "$BINARY")"
if [ -n "$REQUESTED_PATH" ]; then
  cp "$REQUESTED_PATH" "${INSTALL_DIR}/${BINARY}"
  chmod +x "${INSTALL_DIR}/${BINARY}"
  codesign_if_needed "${INSTALL_DIR}/${BINARY}"
else
  printf "Error: release archive %s did not contain %s.\n" "$ARCHIVE" "$BINARY" >&2
  printf "Use a newer LAF Office release that includes %s, or build it from this checkout for local development.\n" "$BINARY" >&2
  exit 1
fi

# Verify
if "${INSTALL_DIR}/${BINARY}" --version >/dev/null 2>&1; then
  printf "Successfully installed %s to %s/%s\n" "$("${INSTALL_DIR}/${BINARY}" --version 2>&1)" "$INSTALL_DIR" "$BINARY"
else
  printf "%s installed to %s/%s\n" "$BINARY" "$INSTALL_DIR" "$BINARY"
fi
