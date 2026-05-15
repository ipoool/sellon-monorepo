#!/usr/bin/env bash
# build-push.sh — build prod image untuk api + web, push ke ghcr.io.
# Dijalankan di laptop / mesin developer / CI.
#
# Output:
#   ghcr.io/<owner>/sellon-api:<git-sha>  +  :latest
#   ghcr.io/<owner>/sellon-web:<git-sha>  +  :latest
#
# Usage:
#   bash scripts/build-push.sh                 # build keduanya
#   bash scripts/build-push.sh api             # api saja
#   bash scripts/build-push.sh web             # web saja
#
# Auth ke ghcr.io:
#   export GHCR_USER=<github-username>
#   export GHCR_PAT=<personal-access-token-with-write:packages>
# (atau jalankan `docker login ghcr.io` manual sebelumnya)

set -euo pipefail

# Hard-coded ke akun "ipoool" — konsisten lintas mesin/CI.
REGISTRY="ghcr.io"
GITHUB_OWNER="ipoool"

# Target platform. Server prod default Ubuntu amd64. Kalau Anda build
# di Mac M1/M2 (arm64), kita PAKSA linux/amd64 lewat buildx supaya
# image tidak crash dengan "exec format error" di server.
#
# Override eksplisit kalau pakai server arm64:
#   PLATFORM=linux/arm64 bash scripts/build-push.sh
#   PLATFORM=linux/amd64,linux/arm64 bash scripts/build-push.sh   # multi-arch
PLATFORM="${PLATFORM:-linux/amd64}"

IMAGE_API="${REGISTRY}/${GITHUB_OWNER}/sellon-api"
IMAGE_WEB="${REGISTRY}/${GITHUB_OWNER}/sellon-web"

# Git SHA pendek — tag immutable buat rollback. Kalau ada uncommitted
# changes, tambahkan suffix -dirty supaya kelihatan di docker images.
GIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
if ! git diff-index --quiet HEAD -- 2>/dev/null; then
  GIT_SHA="${GIT_SHA}-dirty"
fi

# Repo root — script bisa dipanggil dari mana saja.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

log()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[1;33m⚠\033[0m %s\n" "$*"; }

ensure_login() {
  # docker tidak punya cara cepat "am I logged in to X?" yang reliable;
  # cara paling murah: cek file config.json. Tetap sah kalau user
  # sudah login manual.
  if [[ -n "${GHCR_PAT:-}" && -n "${GHCR_USER:-}" ]]; then
    log "Login ke $REGISTRY sebagai $GHCR_USER"
    echo "$GHCR_PAT" | docker login "$REGISTRY" -u "$GHCR_USER" --password-stdin
    ok "Login OK"
  elif grep -q "\"$REGISTRY\"" "${HOME}/.docker/config.json" 2>/dev/null; then
    ok "Sudah ada credential $REGISTRY di docker config"
  else
    warn "Tidak ada credential $REGISTRY. Jalankan: docker login $REGISTRY"
    warn "Atau set GHCR_USER + GHCR_PAT env."
    exit 1
  fi
}

ensure_buildx() {
  # Pakai buildx supaya bisa cross-build (Mac M1 → linux/amd64 server).
  docker buildx version >/dev/null 2>&1 \
    || { echo "docker buildx plugin tidak terpasang"; exit 1; }
  # Bikin builder kalau belum ada. `--use` set jadi default current
  # context. Idempotent.
  if ! docker buildx inspect sellon-builder >/dev/null 2>&1; then
    docker buildx create --name sellon-builder --use >/dev/null
  else
    docker buildx use sellon-builder >/dev/null
  fi
  docker buildx inspect --bootstrap >/dev/null
}

build_and_push() {
  local svc=$1 context image
  case "$svc" in
    api) context="$ROOT/api"; image="$IMAGE_API" ;;
    web)
      context="$ROOT/web"; image="$IMAGE_WEB"
      # Web membutuhkan .env.production di build context (di-bake ke
      # image). Fail cepat di sini sebelum buat Docker yang sibuk pull
      # base image lalu baru error 2 menit kemudian.
      if [[ ! -f "$context/.env.production" ]]; then
        echo ""
        echo "  ✗ web/.env.production tidak ada."
        echo "    Copy dari template dan edit dulu:"
        echo "      cp web/.env.production.example web/.env.production"
        echo "      nano web/.env.production"
        echo ""
        exit 1
      fi
      ;;
    *) echo "service tidak dikenal: $svc"; exit 1 ;;
  esac

  log "Build + push $svc → $image:$GIT_SHA  (platform: $PLATFORM)"
  # buildx --push: build dan push dalam satu shot, tidak melalui local
  # docker image store (yang ga support multi-arch manifest). Wajib
  # buat cross-arch image yang akan jalan di Ubuntu amd64.
  docker buildx build \
    --platform "$PLATFORM" \
    --target prod \
    --tag "$image:$GIT_SHA" \
    --tag "$image:latest" \
    --push \
    "$context"
  ok "$svc selesai"
}

# ── dispatch ──
ensure_login
ensure_buildx

case "${1:-all}" in
  api) build_and_push api ;;
  web) build_and_push web ;;
  all|"")
    build_and_push api
    build_and_push web
    ;;
  *)
    echo "Usage: $0 [api|web|all]"
    exit 1
    ;;
esac

echo ""
ok "Selesai. Untuk deploy ke server:"
echo "    ssh server 'IMAGE_TAG=$GIT_SHA bash /path/to/scripts/deploy.sh'"
echo ""
echo "  …atau:"
echo "    ssh server 'bash /path/to/scripts/deploy.sh'   # pakai :latest"
