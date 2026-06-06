#!/usr/bin/env bash
# server-setup.sh — first-time provisioning for a SellOn production host.
#
# Idempotent: aman dipanggil ulang. Setiap fungsi check-before-install.
#
# Target OS: Ubuntu 22.04 / 24.04 LTS.
#
# Usage:
#   sudo bash scripts/server-setup.sh                    # run semua langkah
#   sudo bash scripts/server-setup.sh setup_docker       # satu fungsi saja
#   sudo bash scripts/server-setup.sh --help             # daftar fungsi
#
# Setelah selesai:
#   1. Isi /var/www/app/.env dengan nilai production yang asli
#   2. Jalankan: bash scripts/deploy.sh   (pertama kalinya manual sebelum ada
#      image baru — atau langsung kalau tag :latest sudah dorong dari laptop)

set -euo pipefail

# Apt: jangan minta input interaktif (mis. saat libssl prompt restart
# services). Set di env level, biar semua apt subprocess ikut.
export DEBIAN_FRONTEND=noninteractive
export NEEDRESTART_MODE=a  # auto-restart services after libc upgrade

# ───────────────────────────────────────────────────────────────────────────
# Konfigurasi — boleh di-override via env sebelum panggil script
# ───────────────────────────────────────────────────────────────────────────

APP_DIR="${APP_DIR:-/var/www/app}"
# SUDO_USER di-set otomatis oleh sudo. Fallback ke logname (TTY) lalu
# ke root sebagai last resort — cloud-init/CI yang ga punya TTY ga
# bakal pernah panggil logname dengan sukses.
APP_USER="${APP_USER:-${SUDO_USER:-$(logname 2>/dev/null || echo root)}}"

# Registry + owner. Hard-coded ke akun "ipoool" — tidak ada auto-detect
# git remote agar konsisten lintas mesin/CI tanpa surprise.
REGISTRY="ghcr.io"
GITHUB_OWNER="ipoool"

IMAGE_API="${REGISTRY}/${GITHUB_OWNER}/sellon-api"
IMAGE_WEB="${REGISTRY}/${GITHUB_OWNER}/sellon-web"

# Nginx vhost. Pakai _ kalau belum punya domain — pasang config-nya, edit
# server_name nanti. HTTPS otomatis kalau DOMAIN bukan `_` dan
# LETSENCRYPT_EMAIL diisi.
DOMAIN="${DOMAIN:-_}"
LETSENCRYPT_EMAIL="${LETSENCRYPT_EMAIL:-}"

# Docker Swarm overlay network name (dipakai stack file juga).
SWARM_NETWORK="${SWARM_NETWORK:-sellon-net}"

# ───────────────────────────────────────────────────────────────────────────
# Helper
# ───────────────────────────────────────────────────────────────────────────

log()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[1;33m⚠\033[0m %s\n" "$*"; }
die()  { printf "\n\033[1;31m✗ %s\033[0m\n" "$*" >&2; exit 1; }

need_root() {
  [[ $EUID -eq 0 ]] || die "Jalankan dengan sudo (perlu root untuk apt + nginx + docker)."
}

# Sanity check: script ditarget Ubuntu, tapi tetap jalan di Debian
# (apt + sites-available sama). Warn kalau bukan keduanya.
check_os() {
  if [[ ! -r /etc/os-release ]]; then
    die "/etc/os-release tidak ada — bukan distro yang dikenal."
  fi
  # shellcheck source=/dev/null
  . /etc/os-release
  case "${ID:-unknown}" in
    ubuntu)
      ok "Ubuntu ${VERSION_ID:-?} terdeteksi"
      # Warn kalau bukan LTS yang kita test (22.04, 24.04).
      case "${VERSION_ID:-}" in
        22.04|24.04) ;;
        *) warn "Ubuntu ${VERSION_ID:-?} bukan yang kita test (22.04/24.04). Lanjut tapi mungkin ada hal yang harus disesuaikan." ;;
      esac
      ;;
    debian)
      warn "Debian ${VERSION_ID:-?} — script di-target Ubuntu. Apt path-nya mirip, harusnya jalan."
      ;;
    *)
      die "Distro '${ID:-unknown}' tidak didukung. Script ini Ubuntu-only (Debian biasanya juga jalan)."
      ;;
  esac
}

# ───────────────────────────────────────────────────────────────────────────
# 1. Docker Engine + Compose plugin
# ───────────────────────────────────────────────────────────────────────────

setup_docker() {
  log "Setup Docker"
  if command -v docker >/dev/null 2>&1; then
    ok "Docker sudah terpasang ($(docker --version))"
  else
    apt-get update -y -qq
    apt-get install -y --no-install-recommends ca-certificates curl gnupg lsb-release
    install -m 0755 -d /etc/apt/keyrings
    # Idempotent: replace key kalau sudah pernah ada.
    rm -f /etc/apt/keyrings/docker.gpg
    # Ubuntu official + Debian fallback (struktur path repo sama).
    # shellcheck source=/dev/null
    . /etc/os-release
    local docker_repo_distro="${ID}"
    case "$docker_repo_distro" in
      ubuntu|debian) ;;
      *) docker_repo_distro=ubuntu ;;  # last-resort
    esac
    curl -fsSL "https://download.docker.com/linux/${docker_repo_distro}/gpg" \
      | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/${docker_repo_distro} ${VERSION_CODENAME} stable" \
      > /etc/apt/sources.list.d/docker.list
    apt-get update -y -qq
    apt-get install -y --no-install-recommends \
      docker-ce docker-ce-cli containerd.io \
      docker-buildx-plugin docker-compose-plugin
    ok "Docker terpasang"
  fi

  systemctl enable --now docker
  ok "Docker service aktif"

  # Tambah user ke group docker biar `docker ...` bisa tanpa sudo.
  # Skip kalau APP_USER=root (root sudah bisa apa-apa via /var/run/docker.sock).
  if [[ "$APP_USER" == "root" ]]; then
    ok "APP_USER=root — tidak perlu group docker"
  elif id -nG "$APP_USER" | grep -qw docker; then
    ok "User $APP_USER sudah di group docker"
  else
    usermod -aG docker "$APP_USER" || warn "Gagal tambah $APP_USER ke group docker"
    # CATATAN PENTING soal group activation:
    #
    # `usermod -aG` cuma update /etc/group. Shell yang LAGI berjalan
    # tidak akan dapat membership baru sampai user logout + login
    # ulang (membership di-resolve saat shell init).
    #
    # Tiga cara aktivasi tanpa reboot, dari yang paling clean:
    #   1. exit + ssh ulang        → shell baru, group reload ✓
    #   2. `newgrp docker`         → spawn sub-shell dengan group baru
    #   3. `sg docker -c '<cmd>'`  → jalankan satu command saja dengan group
    warn "User $APP_USER ditambahkan ke group docker."
    warn "Jalan tanpa sudo BARU efektif setelah logout + ssh ulang."
    warn "Quick activate: 'newgrp docker' (spawn sub-shell baru)"
  fi
}

# ───────────────────────────────────────────────────────────────────────────
# 2. Docker Swarm + overlay network
# ───────────────────────────────────────────────────────────────────────────

setup_swarm() {
  log "Setup Docker Swarm"
  if docker info 2>/dev/null | grep -q "Swarm: active"; then
    ok "Swarm sudah aktif"
  else
    # Pakai IP advertise eksplisit kalau ada multiple interface.
    local advertise_addr
    advertise_addr=$(hostname -I | awk '{print $1}')
    docker swarm init --advertise-addr "$advertise_addr" >/dev/null
    ok "Swarm init di $advertise_addr"
  fi

  if docker network ls --format '{{.Name}}' | grep -qx "$SWARM_NETWORK"; then
    ok "Overlay network $SWARM_NETWORK sudah ada"
  else
    docker network create --driver overlay --attachable "$SWARM_NETWORK" >/dev/null
    ok "Overlay network $SWARM_NETWORK dibuat"
  fi
}

# ───────────────────────────────────────────────────────────────────────────
# 3. App directory: /var/www/app/{docker-compose.yml, .env}
# ───────────────────────────────────────────────────────────────────────────

setup_app_dir() {
  log "Setup direktori aplikasi di $APP_DIR"

  mkdir -p "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
  ok "Direktori $APP_DIR siap"

  # ── docker-compose.yml (sekaligus jadi Swarm stack file) ──
  if [[ -f "$APP_DIR/docker-compose.yml" ]]; then
    ok "docker-compose.yml sudah ada, tidak ditimpa"
  else
    cat > "$APP_DIR/docker-compose.yml" <<EOF
# Production stack untuk SellOn. Dipakai docker stack deploy lewat
# scripts/deploy.sh — bukan docker compose up (yang skip update_config).
# Image di-pull dari ghcr.io; tag default :latest (deploy.sh juga pakai
# git-sha kalau diset).
#
# Update strategy: rolling. order=start-first → swarm jalankan task baru
# DULU, tunggu healthy, baru kill task lama → zero downtime.
#
# Tanpa "version:" — Compose Specification mode (auto) yang support
# host_ip di long-form ports. Legacy "version: 3.9" reject host_ip.

services:
  api:
    image: ${IMAGE_API}:\${IMAGE_TAG:-latest}
    # env_file: di stack deploy Docker baca file SAAT deploy + inline
    # ke service spec. Path relatif ke compose file (/var/www/app/.env).
    # Update .env → rerun deploy.sh untuk apply.
    env_file: .env
    networks: [${SWARM_NETWORK}]
    ports:
      # mode=host + host_ip=127.0.0.1 → bind langsung di host network
      # namespace ke loopback saja. Port API tidak bocor ke publik —
      # cuma nginx (juga di host) yang bisa reach. Trade-off: dengan
      # mode=host, replicas harus 1 (port conflict kalau >1 di node
      # yang sama). Untuk single-node prod ini OK.
      - target: 8080
        published: 8080
        host_ip: 127.0.0.1
        protocol: tcp
        mode: host
    deploy:
      # replicas: 1 karena mode=host (lihat catatan di atas). Untuk
      # multi-node atau true zero-downtime, pindah nginx jadi service
      # Swarm di overlay network, lalu balik replicas: 2 + mode: ingress.
      replicas: 1
      update_config:
        # stop-first (default untuk replicas=1): task lama dimatikan
        # dulu, lalu start yang baru. Gap ~3-5 detik antara kill old
        # dan healthy new. Nginx mengembalikan 502 selama window itu.
        # Untuk minimize: tambahkan HEALTHCHECK di Dockerfile.
        parallelism: 1
        failure_action: rollback
      restart_policy:
        condition: on-failure

  web:
    image: ${IMAGE_WEB}:\${IMAGE_TAG:-latest}
    # CATATAN: web TIDAK pakai env_file. Semua var Next.js (NEXT_PUBLIC_*
    # + server-side seperti API_INTERNAL_URL) di-bake ke image saat
    # \`pnpm build\` dari web/.env.production di build context. Kalau
    # mau ganti domain / Google client ID, edit web/.env.production di
    # laptop → build-push.sh → deploy.sh.
    networks: [${SWARM_NETWORK}]
    ports:
      - target: 3000
        published: 3000
        host_ip: 127.0.0.1
        protocol: tcp
        mode: host
    deploy:
      replicas: 1
      update_config:
        parallelism: 1
        failure_action: rollback
      restart_policy:
        condition: on-failure

  # Postgres TIDAK dijalankan di stack — production pakai DB dedicated
  # (managed/external). API service connect via POSTGRES_HOST di .env
  # (pasang hostname penyedia + POSTGRES_SSLMODE=require).

  redis:
    image: redis:7-alpine
    # Persistence: AOF (append-only file) — Redis log setiap write ke
    # disk. Default snapshot RDB juga aktif, tapi AOF lebih durable
    # (kehilangan data max 1 detik vs beberapa menit).
    command: ["redis-server", "--appendonly", "yes", "--save", "60", "1"]
    volumes:
      # Named volume di-manage Docker secara terpisah dari container
      # lifecycle. \`docker stack rm\` tidak hapus volume — data Redis
      # tetap selamat walaupun stack di-redeploy / container di-recreate.
      # Manual delete: \`docker volume rm sellon_redis-data\`.
      - redis-data:/data
    networks: [${SWARM_NETWORK}]
    deploy:
      replicas: 1
      # Pin ke manager node — volume terikat ke node tertentu, kalau
      # task pindah node datanya akan kosong.
      placement:
        constraints: [node.role == manager]
      # update_config force-recreate dihindari: kalau image redis:7-alpine
      # digest sama dengan yang lagi running, Swarm tidak akan recreate
      # task ini saat deploy api/web (no-op).
      update_config:
        parallelism: 1
        order: stop-first
      restart_policy:
        condition: on-failure

networks:
  ${SWARM_NETWORK}:
    external: true

volumes:
  redis-data:
EOF
    chown "$APP_USER:$APP_USER" "$APP_DIR/docker-compose.yml"
    ok "docker-compose.yml dibuat"
  fi

  # ── .env (placeholder; user isi sendiri) ──
  if [[ -f "$APP_DIR/.env" ]]; then
    ok ".env sudah ada, tidak ditimpa"
  else
    cat > "$APP_DIR/.env" <<'EOF'
# === SellOn production env (server-side, BACKEND ONLY) ===
# Web/Next.js config sudah di-bake ke image dari web/.env.production
# saat build di laptop — di server file ini cuma untuk API + DB.
#
# WAJIB diisi sebelum deploy. Generate JWT_SECRET dengan:
#   openssl rand -hex 32

# ── App ──
API_ENV=production
API_PORT=8080
JWT_SECRET=
JWT_TTL_HOURS=168
WEB_ORIGIN=https://your-domain.id
WEBHOOK_BASE_URL=https://your-domain.id

# ── Postgres (DB dedicated/managed di luar stack — Supabase / Neon /
#    DigitalOcean / RDS / Aiven, dst). Isi hostname penyedia di sini.
#    POSTGRES_SSLMODE=require untuk managed (mayoritas wajib SSL).
POSTGRES_HOST=db.your-provider.com
POSTGRES_PORT=5432
POSTGRES_USER=sellon
POSTGRES_PASSWORD=
POSTGRES_DB=sellon
POSTGRES_SSLMODE=require

# ── Redis ──
REDIS_HOST=redis
REDIS_PORT=6379

# ── Google OAuth (server verify ID token) ──
GOOGLE_CLIENT_ID=

# ── Supabase storage (untuk upload gambar) ──
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_BUCKET=stores

# ── RajaOngkir ──
RAJAONGKIR_API_KEY=EOoWckjO08bd9a6324316c55ZvmcdWez
RAJAONGKIR_TIER=starter

# ── Platform Midtrans (langganan platform → SellOn) ──
PLATFORM_MIDTRANS_SERVER_KEY=
PLATFORM_MIDTRANS_CLIENT_KEY=
PLATFORM_MIDTRANS_SANDBOX=false

# ── Mailtrap (transactional email) ──
MAILTRAP_API_KEY=
FROM_EMAIL=halo@your-domain.id
FROM_NAME=SellOn

# ── Twilio (WhatsApp alerts ke owner — Pro/Bisnis only) ──
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
EOF
    chmod 600 "$APP_DIR/.env"
    chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
    warn ".env dibuat kosong di $APP_DIR/.env — ISI dulu sebelum deploy!"
  fi
}

# ───────────────────────────────────────────────────────────────────────────
# 4. Caddy reverse proxy — automatic HTTPS for the platform domain + on-demand
#    TLS for seller custom domains. Replaces the old nginx + certbot setup.
#
#    How custom domains work: a seller CNAMEs their domain to cname.sellon.id
#    (→ this server's IP). On the first HTTPS request Caddy asks the API
#    (/api/v1/internal/tls-check) whether that host is an ACTIVE custom domain;
#    only then does it obtain a Let's Encrypt cert on demand. The ask gate stops
#    arbitrary hosts pointed at the IP from exhausting the ACME rate limit.
# ───────────────────────────────────────────────────────────────────────────

setup_caddy() {
  log "Setup Caddy (reverse proxy + automatic HTTPS + on-demand TLS)"

  if [[ "$DOMAIN" == "_" ]]; then
    warn "DOMAIN belum di-set (masih '_'). Caddy butuh domain real untuk cert platform."
    warn "Jalankan: sudo DOMAIN=tokomu.id LETSENCRYPT_EMAIL=ops@tokomu.id bash $(basename "$0") setup_caddy"
    return 0
  fi
  if [[ -z "$LETSENCRYPT_EMAIL" ]]; then
    warn "LETSENCRYPT_EMAIL belum di-set — wajib untuk akun ACME (Let's Encrypt)."
    warn "Jalankan: sudo DOMAIN=$DOMAIN LETSENCRYPT_EMAIL=ops@$DOMAIN bash $(basename "$0") setup_caddy"
    return 0
  fi

  # Install Caddy from the official Cloudsmith apt repo.
  if command -v caddy >/dev/null 2>&1; then
    ok "Caddy sudah terpasang ($(caddy version 2>/dev/null | head -n1))"
  else
    apt-get update -y -qq
    apt-get install -y --no-install-recommends debian-keyring debian-archive-keyring apt-transport-https curl gnupg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
      > /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -y -qq
    apt-get install -y caddy
    ok "Caddy terpasang"
  fi

  # Free ports 80/443: stop the old nginx + certbot timer if present.
  if systemctl is-active --quiet nginx 2>/dev/null; then
    systemctl disable --now nginx
    warn "Nginx dimatikan — Caddy mengambil alih port 80/443."
  fi
  systemctl disable --now certbot.timer 2>/dev/null || true

  # Write the Caddyfile. ${DOMAIN}/${LETSENCRYPT_EMAIL} are substituted now;
  # the rest is literal Caddy config (no shell vars inside).
  cat > /etc/caddy/Caddyfile <<EOF
# SellOn edge. Auto-generated by scripts/server-setup.sh.
# Automatic HTTPS for the platform domain + on-demand TLS for seller custom
# domains (gated by the API so only ACTIVE custom domains get a cert).

{
	email ${LETSENCRYPT_EMAIL}
	# The ask endpoint is the gate: Caddy only obtains a cert if the API says
	# the host is an active custom domain. (Caddy 2 dropped interval/burst.)
	on_demand_tls {
		ask http://127.0.0.1:8080/api/v1/internal/tls-check
	}
}

# Reverse-proxy rules shared by the platform domain + custom domains.
(sellon_proxy) {
	encode gzip
	# API + webhooks → api service. SSE streams need unbuffered flushing.
	@api path /api/* /webhooks/*
	reverse_proxy @api 127.0.0.1:8080 {
		flush_interval -1
	}
	# Everything else (storefront + dashboard) → Next.js web.
	reverse_proxy 127.0.0.1:3000
}

# Platform domain — cert obtained at startup (not on-demand).
${DOMAIN}, www.${DOMAIN} {
	import sellon_proxy
}

# Seller custom domains — on-demand TLS, gated by the ask endpoint above.
https:// {
	tls {
		on_demand
	}
	import sellon_proxy
}
EOF
  ok "Caddyfile ditulis ke /etc/caddy/Caddyfile"

  # Validate before reload — a bad config would take the edge down.
  if caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null 2>&1; then
    ok "Caddyfile valid"
  else
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile || true
    die "Caddyfile tidak valid — perbaiki sebelum reload."
  fi
  systemctl enable caddy >/dev/null 2>&1 || true
  systemctl reload caddy 2>/dev/null || systemctl restart caddy
  ok "Caddy aktif (auto-renewal cert built-in)"

  warn "DNS yang harus disiapkan:"
  warn "  - A record  ${DOMAIN}      → IP server ini"
  warn "  - A record  www.${DOMAIN}  → IP server ini"
  warn "  - A record  cname.sellon.id → IP server ini (target CNAME domain custom seller;"
  warn "    HARUS A record terminal, bukan CNAME berantai, supaya verifikasi DNS seller match)"
}

# ───────────────────────────────────────────────────────────────────────────
# 5. UFW firewall (Ubuntu default). Buka SSH (22) + HTTP (80) + HTTPS (443).
# ───────────────────────────────────────────────────────────────────────────

setup_firewall() {
  log "Setup UFW firewall"
  if ! command -v ufw >/dev/null 2>&1; then
    apt-get update -y -qq
    apt-get install -y --no-install-recommends ufw
  fi
  # Default policies — deny incoming, allow outgoing.
  ufw default deny incoming >/dev/null
  ufw default allow outgoing >/dev/null
  # Allow rules — pakai "OpenSSH" app profile biar SSH tetap reachable
  # walau port di-customize lewat /etc/ssh/sshd_config (tidak hardcode 22).
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null

  # Aktifkan UFW kalau belum. `--force` skip prompt yes/no — wajib di
  # non-interactive shell, dan aman karena rule SSH sudah dipasang
  # SEBELUM enable (urutan penting — jangan dibalik).
  if ufw status | grep -q "Status: active"; then
    ok "UFW sudah aktif"
  else
    ufw --force enable >/dev/null
    ok "UFW di-enable + rule SSH/HTTP/HTTPS dipasang"
  fi

  ufw status verbose | sed 's/^/    /'
}

# ───────────────────────────────────────────────────────────────────────────
# Help / dispatch
# ───────────────────────────────────────────────────────────────────────────

usage() {
  cat <<EOF
Usage: sudo bash $(basename "$0") [function]

Target OS: Ubuntu 22.04 / 24.04 LTS (Debian biasanya juga jalan).

Functions:
  setup_docker     Install Docker Engine + Compose plugin
  setup_swarm      Init Docker Swarm + create overlay network
  setup_app_dir    Buat $APP_DIR + docker-compose.yml + .env placeholder
  setup_caddy      Install Caddy: auto-HTTPS platform domain + on-demand TLS domain custom (butuh DOMAIN + LETSENCRYPT_EMAIL)
  setup_firewall   UFW: deny incoming, allow SSH/HTTP/HTTPS
  all (default)    Jalankan semuanya sekali jalan

Override config:
  APP_DIR=/var/www/app           Direktori aplikasi
  APP_USER=ubuntu                Owner /var/www/app + group docker
  DOMAIN=tokomu.id               Platform domain (cert + reverse proxy Caddy)
  LETSENCRYPT_EMAIL=ops@tokomu.id  Email ACME Let's Encrypt (wajib untuk HTTPS)
  SWARM_NETWORK=sellon-net       Overlay network

Registry hard-coded: ghcr.io/ipoool/sellon-{api,web}
EOF
}

main() {
  need_root
  check_os
  case "${1:-all}" in
    setup_docker)    setup_docker ;;
    setup_swarm)     setup_swarm ;;
    setup_app_dir)   setup_app_dir ;;
    setup_caddy)     setup_caddy ;;
    setup_firewall)  setup_firewall ;;
    all|"")
      setup_docker
      setup_swarm
      setup_app_dir
      setup_firewall
      # Caddy terakhir — butuh firewall (port 80/443) sudah kebuka + DNS
      # sudah nunjuk ke server ini (ACME challenge ke port 80/443). Auto-skip
      # kalau DOMAIN/EMAIL belum di-set; user bisa panggil ulang nanti.
      setup_caddy
      log "Selesai!"
      echo ""
      echo "Langkah berikutnya:"
      echo "  1. nano $APP_DIR/.env            # isi nilai production"
      echo "  2. (di laptop) bash scripts/build-push.sh"
      echo "  3. (di server) bash scripts/deploy.sh"
      # Group docker hanya aktif di shell baru. Kalau APP_USER bukan
      # root DAN dia belum di group sebelumnya, prompt logout/login
      # supaya `docker ...` tanpa sudo langsung jalan.
      if [[ "$APP_USER" != "root" ]] && ! id -nG "$APP_USER" 2>/dev/null \
           | tr ' ' '\n' | grep -qx docker; then
        echo ""
        echo "⚠ Penting: agar 'docker ...' bisa tanpa sudo, $APP_USER perlu"
        echo "  logout + ssh ulang sekarang juga. Atau jalankan:"
        echo "      newgrp docker"
      fi
      if [[ "$DOMAIN" == "_" || -z "$LETSENCRYPT_EMAIL" ]]; then
        echo ""
        echo "HTTPS/Caddy belum aktif. Setelah DNS A-record (DOMAIN, www, dan"
        echo "cname.sellon.id) nunjuk ke server ini, jalankan:"
        echo "  sudo DOMAIN=tokomu.id LETSENCRYPT_EMAIL=ops@tokomu.id \\"
        echo "       bash $(basename "$0") setup_caddy"
      fi
      ;;
    --help|-h|help) usage ;;
    *) usage; die "Fungsi '$1' tidak dikenal." ;;
  esac
}

main "$@"
