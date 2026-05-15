#!/usr/bin/env bash
# Spin up ngrok with the SellOn web + api tunnels, point .env at the
# assigned URLs, and recreate the affected containers.
#
# Usage: scripts/ngrok-up.sh [--keep-env]
#
#   --keep-env  Don't touch .env. Useful when you already have stable
#               URLs configured.
set -euo pipefail

KEEP_ENV=0
for arg in "$@"; do
  case "$arg" in
    --keep-env) KEEP_ENV=1 ;;
  esac
done

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok belum ter-install. brew install ngrok atau https://ngrok.com/download" >&2
  exit 1
fi

# Make sure local web + api are up first (ngrok tunnel proxies to them).
if ! docker compose ps api 2>/dev/null | grep -q "Up"; then
  echo "→ docker compose up -d (api + web belum running)"
  docker compose up -d
fi

# Kill any existing ngrok process from a previous run so the API on
# :4040 is fresh.
pkill -x ngrok 2>/dev/null || true
sleep 1

LOG="$ROOT/.ngrok.log"
echo "→ Memulai ngrok (region ap, web:3100 + api:8080)…"
ngrok start --all --config "$HOME/.ngrok2/ngrok.yml" >"$LOG" 2>&1 &
NGROK_PID=$!

# Poll the inspector until BOTH named tunnels are registered. The
# inspector returns 200 with a partial list briefly while ngrok is
# still wiring up — must wait for the names we expect, not just
# "any response".
WEB_URL=""
API_URL=""
for _ in $(seq 1 60); do
  sleep 0.5
  if ! kill -0 "$NGROK_PID" 2>/dev/null; then
    echo "ngrok keluar — cek $LOG" >&2
    tail -20 "$LOG" >&2
    exit 1
  fi
  raw=$(curl -fs http://127.0.0.1:4040/api/tunnels 2>/dev/null || true)
  [[ -z "$raw" ]] && continue
  WEB_URL=$(printf '%s' "$raw" | python3 -c 'import sys, json
try:
  t = json.load(sys.stdin)["tunnels"]
  print(next((x["public_url"] for x in t if x["name"]=="sellon-web"), ""))
except Exception:
  print("")')
  API_URL=$(printf '%s' "$raw" | python3 -c 'import sys, json
try:
  t = json.load(sys.stdin)["tunnels"]
  print(next((x["public_url"] for x in t if x["name"]=="sellon-api"), ""))
except Exception:
  print("")')
  if [[ -n "$WEB_URL" && -n "$API_URL" ]]; then
    break
  fi
done

if [[ -z "$WEB_URL" || -z "$API_URL" ]]; then
  echo "Timeout menunggu tunnel sellon-web/sellon-api siap" >&2
  tail -20 "$LOG" >&2 || true
  exit 1
fi

echo
echo "  ✅ Web : $WEB_URL"
echo "  ✅ API : $API_URL"
echo "     (inspector: http://127.0.0.1:4040 )"
echo

if [[ "$KEEP_ENV" -eq 1 ]]; then
  echo "→ --keep-env aktif, .env tidak diubah."
  exit 0
fi

ENV_FILE="$ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "$ENV_FILE tidak ditemukan, lewati update env." >&2
  exit 0
fi

# Backup once per session.
cp "$ENV_FILE" "$ENV_FILE.before-ngrok.bak"

# Append BOTH the ngrok URL and the original localhost:3100 to WEB_ORIGIN
# so kamu bisa tetap akses lokal sambil tunnel hidup.
NEW_WEB_ORIGIN="$WEB_URL,http://localhost:3100,http://localhost:3000"

# Update keys in-place. Cross-platform sed dance: BSD sed (macOS) needs
# -i ''.
SED_INPLACE=(-i '')
if sed --version >/dev/null 2>&1; then
  # GNU sed
  SED_INPLACE=(-i)
fi

upsert() {
  local key="$1" val="$2"
  local escaped_val
  escaped_val=$(printf '%s' "$val" | sed 's/[\/&]/\\&/g')
  if grep -q "^${key}=" "$ENV_FILE"; then
    sed "${SED_INPLACE[@]}" -E "s|^${key}=.*|${key}=${escaped_val}|" "$ENV_FILE"
  else
    printf '\n%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

upsert WEB_ORIGIN          "$NEW_WEB_ORIGIN"
upsert NEXT_PUBLIC_API_URL "$API_URL"
upsert WEBHOOK_BASE_URL    "$API_URL"

echo "→ .env diupdate. Recreate api + web supaya nilai env-nya kepakai…"
docker compose up -d --force-recreate api web

cat <<EOF

╭───────────────────────────────────────────────────────────────╮
│  Akses dari luar:                                             │
│                                                               │
│    Web   : $WEB_URL
│    API   : $API_URL
│                                                               │
│  ⚠️  Login Google butuh ngrok URL ditambahkan ke              │
│      Google Cloud → APIs & Services → Credentials             │
│      → OAuth client → "Authorized JavaScript origins":        │
│                                                               │
│        $WEB_URL                                               │
│                                                               │
│      Setiap restart ngrok URL berubah (free tier acak),       │
│      jadi pakai static domain ngrok atau update list-nya.     │
│                                                               │
│  Stop tunnel: scripts/ngrok-down.sh                           │
╰───────────────────────────────────────────────────────────────╯
EOF
