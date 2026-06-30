#!/usr/bin/env bash
# Housearch installer: installs Node dependencies and registers a systemd
# service so the app starts on boot and restarts on failure.
#
# Usage:
#   ./install.sh                 # install deps + register service (needs sudo for the unit)
#   SERVICE_USER=bob ./install.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="housearch"
SERVICE_USER="${SERVICE_USER:-$(id -un)}"

echo "==> Housearch install"
echo "    dir:  $APP_DIR"
echo "    user: $SERVICE_USER"

# --- 1. Node check ---
if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node not found. Install Node.js 22+ first (needs node:sqlite)." >&2
  exit 1
fi
NODE_BIN="$(command -v node)"
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "ERROR: Node $NODE_MAJOR detected; node:sqlite needs Node 22+." >&2
  exit 1
fi

# --- 2. Dependencies ---
echo "==> Installing dependencies"
cd "$APP_DIR"
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

# --- 3. systemd service ---
if ! command -v systemctl >/dev/null 2>&1; then
  echo "WARNING: systemctl not found; skipping service registration." >&2
  echo "         Start manually with: npm start" >&2
  exit 0
fi

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

UNIT_PATH="/etc/systemd/system/${SERVICE_NAME}.service"
echo "==> Writing $UNIT_PATH"

$SUDO tee "$UNIT_PATH" >/dev/null <<UNIT
[Unit]
Description=Housearch house-hunting tracker
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${APP_DIR}
ExecStart=${NODE_BIN} ${APP_DIR}/server.js
EnvironmentFile=-${APP_DIR}/.env
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

echo "==> Enabling and starting service"
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "${SERVICE_NAME}.service"

echo "==> Done."
echo "    Status:  systemctl status ${SERVICE_NAME}"
echo "    Logs:    journalctl -u ${SERVICE_NAME} -f"
echo "    App on:  http://localhost:${PORT:-8787}"
