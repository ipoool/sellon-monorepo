#!/usr/bin/env bash
# deploy.sh — zero-downtime re-deploy di server production.
#
# Pull image terbaru dari registry, lalu `docker stack deploy` — Swarm
# jalankan rolling update sesuai update_config di compose file
# (order: start-first → tasks baru start dulu, kill yang lama setelah
# task baru siap → zero downtime).
#
# Usage:
#   bash scripts/deploy.sh                    # pakai tag :latest
#   IMAGE_TAG=abc1234 bash scripts/deploy.sh  # tag spesifik (untuk rollback)
#
# Prasyarat:
#   - scripts/server-setup.sh sudah dijalankan
#   - $APP_DIR/.env sudah terisi production values
#   - `docker login ghcr.io` sudah dilakukan (atau set GHCR_PAT + GHCR_USER)

set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/app}"
STACK_NAME="${STACK_NAME:-sellon}"
COMPOSE_FILE="${COMPOSE_FILE:-$APP_DIR/docker-compose.yml}"
IMAGE_TAG="${IMAGE_TAG:-latest}"
REGISTRY="${REGISTRY:-ghcr.io}"

log()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[1;33m⚠\033[0m %s\n" "$*"; }
die()  { printf "\n\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

# Sanity checks — gagal cepat kalau host belum siap.
command -v docker >/dev/null 2>&1 || die "Docker belum terpasang. Jalankan server-setup.sh dulu."
docker compose version >/dev/null 2>&1 \
  || die "Plugin docker-compose belum ada (apt: docker-compose-plugin). Jalankan server-setup.sh dulu."
[[ -f "$COMPOSE_FILE" ]] || die "Compose file tidak ditemukan: $COMPOSE_FILE. Jalankan server-setup.sh dulu."
[[ -f "$APP_DIR/.env" ]] || die ".env belum ada di $APP_DIR. Buat dan isi dulu."
docker info 2>/dev/null | grep -q "Swarm: active" || die "Docker Swarm belum aktif. Jalankan: docker swarm init"

# Login ke ghcr.io kalau credential disuplai via env. Kalau tidak,
# anggap user sudah `docker login` manual sebelumnya.
if [[ -n "${GHCR_PAT:-}" && -n "${GHCR_USER:-}" ]]; then
  log "Login ke $REGISTRY"
  echo "$GHCR_PAT" | docker login "$REGISTRY" -u "$GHCR_USER" --password-stdin
  ok "Login OK"
fi

log "Pull image tag '$IMAGE_TAG'"
# Ekstrak nama image dari compose file dengan envsubst, lalu pull
# semua image (kecuali postgres/redis upstream yang sudah ada di
# Docker Hub). Pakai stack deploy --resolve-image always kalau mau
# Swarm yang pull — tapi pull manual lebih cepat fail kalau image
# belum exist.
export IMAGE_TAG
# `docker compose config` interpolasi env + cetak final compose YAML.
# Filter `image:` baris, ambil nilai unik.
images=$(docker compose -f "$COMPOSE_FILE" --env-file "$APP_DIR/.env" config 2>/dev/null \
  | awk '/^[[:space:]]+image:/ {print $2}' | sort -u)
for img in $images; do
  echo "  → $img"
  docker pull "$img" || warn "Pull gagal untuk $img (mungkin image lokal)"
done
ok "Image siap"

log "Deploy stack '$STACK_NAME'"
# --with-registry-auth: kirim ke worker node-nya juga (kalau ada).
# --resolve-image always: pakai digest yang baru di-pull, bukan cache.
docker stack deploy \
  --compose-file "$COMPOSE_FILE" \
  --with-registry-auth \
  --resolve-image always \
  "$STACK_NAME"
ok "Stack deploy dipanggil — Swarm jalankan rolling update di background"

log "Tunggu konvergensi (max 5 menit)"
# Loop sampai semua service "converged" atau timeout.
end=$((SECONDS + 300))
while (( SECONDS < end )); do
  pending=$(docker service ls --filter "label=com.docker.stack.namespace=$STACK_NAME" \
    --format '{{.Name}} {{.Replicas}}' \
    | awk '{
        split($2, r, "/");
        if (r[1] != r[2]) print $0;
      }' | wc -l)
  if (( pending == 0 )); then
    ok "Semua service konvergen"
    break
  fi
  printf "  …%d service belum siap\r" "$pending"
  sleep 4
done
(( SECONDS < end )) || warn "Timeout — ada service yang tidak konvergen, cek 'docker service ls'"

log "Status final"
docker stack services "$STACK_NAME"

echo ""
ok "Deploy selesai. Untuk inspeksi:"
echo "    docker service logs ${STACK_NAME}_api --tail 100"
echo "    docker service logs ${STACK_NAME}_web --tail 100"
echo ""
echo "Rollback (kalau ada masalah):"
echo "    docker service rollback ${STACK_NAME}_api"
echo "    docker service rollback ${STACK_NAME}_web"
