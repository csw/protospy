#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
    exit 0
fi

CADDY_VERSION=$(cat "$CLAUDE_PROJECT_DIR/.caddy-version")

if caddy version 2>/dev/null | grep -qF "v${CADDY_VERSION}"; then
    echo "Caddy ${CADDY_VERSION} already installed"
    exit 0
fi

echo "Installing Caddy ${CADDY_VERSION}..."

ARCH=$(dpkg --print-architecture 2>/dev/null \
    || uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/')

INSTALL_DIR="/usr/local/bin"
if [ -w "$INSTALL_DIR" ]; then
    SUDO=""
else
    SUDO="sudo"
fi

curl -fsSL \
    "https://github.com/caddyserver/caddy/releases/download/v${CADDY_VERSION}/caddy_${CADDY_VERSION}_linux_${ARCH}.tar.gz" \
    | $SUDO tar -xz -C "$INSTALL_DIR" caddy

echo "Installed: $(caddy version)"
