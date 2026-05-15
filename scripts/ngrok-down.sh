#!/usr/bin/env bash
# Stop ngrok and restore .env from the backup written by ngrok-up.sh.
set -euo pipefail

cd "$(dirname "$0")/.."

pkill -x ngrok 2>/dev/null || true
echo "→ ngrok dimatikan"

if [[ -f .env.before-ngrok.bak ]]; then
  mv .env.before-ngrok.bak .env
  echo "→ .env dikembalikan ke nilai sebelum tunnel"
  docker compose up -d --force-recreate api web
else
  echo "→ Tidak ada .env.before-ngrok.bak — .env tidak diubah."
fi
