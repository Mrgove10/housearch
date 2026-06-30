#!/usr/bin/env bash
# Housearch updater: pulls latest code, refreshes dependencies, and restarts
# the systemd service.
#
# Usage:
#   ./update.sh
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVICE_NAME="housearch"
cd "$APP_DIR"

echo "==> Pulling latest code"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
git pull --ff-only origin "$BRANCH"

echo "==> Updating dependencies"
if [ -f package-lock.json ]; then
  npm ci --omit=dev
else
  npm install --omit=dev
fi

if command -v systemctl >/dev/null 2>&1 && [ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]; then
  SUDO=""
  if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi
  echo "==> Restarting service"
  $SUDO systemctl restart "${SERVICE_NAME}.service"
  $SUDO systemctl --no-pager status "${SERVICE_NAME}.service" | head -5
else
  echo "WARNING: ${SERVICE_NAME}.service not found; restart manually (npm start)." >&2
fi

echo "==> Done."
