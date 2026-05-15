# Deployment scripts

**Target OS production**: Ubuntu 22.04 / 24.04 LTS. Debian 12 juga jalan (apt path-nya sama). RHEL/CentOS/Amazon Linux **tidak didukung** — script pakai `apt-get`, `/etc/nginx/sites-available`, dan `ufw`.

Tiga script + dua helper ngrok yang sudah ada. Ringkasannya:

| Script | Dijalankan di | Frekuensi | Tujuan |
|---|---|---|---|
| `server-setup.sh` | server prod | sekali per host | Install Docker, init Swarm, buat `/var/www/app`, pasang nginx |
| `build-push.sh` | laptop / CI | tiap kali ada perubahan code | Build image prod, push ke `ghcr.io` |
| `deploy.sh` | server prod | tiap kali habis push | Pull image baru + rolling update zero-downtime |

## Workflow lengkap (sekali setup)

### 1) Di server (sekali saja)

```bash
git clone https://github.com/<owner>/<repo>.git /tmp/sellon
cd /tmp/sellon
sudo bash scripts/server-setup.sh
```

Script ini akan:
- Sanity check OS (warn kalau bukan Ubuntu 22.04/24.04)
- Install Docker + Compose plugin (dari official repo Docker)
- `docker swarm init` + buat overlay network `sellon-net`
- Buat `/var/www/app/docker-compose.yml` (stack file) dan `/var/www/app/.env` kosong
- Install nginx + pasang vhost reverse proxy
- Setup UFW firewall (deny incoming, allow SSH/HTTP/HTTPS)
- Issue Let's Encrypt cert via certbot + auto-redirect 80→443 (kalau `DOMAIN` + `LETSENCRYPT_EMAIL` di-set)

**Penting**: script menambahkan user Anda ke group `docker` supaya `docker ...` bisa **tanpa sudo**. Tapi membership baru aktif di shell baru — jalankan salah satu sekarang:

```bash
exit && ssh user@server      # cara paling clean
# atau
newgrp docker                # spawn sub-shell dengan group baru, tanpa logout
```

Verify: `docker ps` tanpa `sudo` — kalau "permission denied", logout/login dulu.

**Setelah itu**, isi `/var/www/app/.env` dengan nilai production yang asli:

```bash
sudo nano /var/www/app/.env
# isi JWT_SECRET, POSTGRES_PASSWORD, GOOGLE_CLIENT_ID, TWILIO_*, dst.
```

Generate `JWT_SECRET`:

```bash
openssl rand -hex 32
```

**HTTPS** sudah otomatis kalau DNS A-record `your-domain.id` sudah nunjuk ke IP server SEBELUM `server-setup.sh` dijalankan, dan Anda pass dua env:

```bash
sudo DOMAIN=your-domain.id LETSENCRYPT_EMAIL=ops@your-domain.id \
     bash scripts/server-setup.sh
```

Kalau setup pertama jalan tanpa domain/email (HTTPS di-skip), jalankan susulan setelah DNS siap:

```bash
sudo DOMAIN=your-domain.id LETSENCRYPT_EMAIL=ops@your-domain.id \
     bash scripts/server-setup.sh setup_https
```

Renewal otomatis lewat `certbot.timer` (systemd, 2× sehari).

### 2) Di laptop (tiap kali ada perubahan code)

```bash
export GHCR_USER=<github-username>
export GHCR_PAT=<github-personal-access-token-write:packages>

bash scripts/build-push.sh           # build + push api + web
# atau:
bash scripts/build-push.sh api       # api saja
bash scripts/build-push.sh web       # web saja
```

Script otomatis tag dengan git SHA pendek + `latest`:

- `ghcr.io/<owner>/sellon-api:abc1234`
- `ghcr.io/<owner>/sellon-api:latest`

**Cross-arch sudah otomatis**: `build-push.sh` pakai `docker buildx` dengan default `PLATFORM=linux/amd64`. Mac M1/M2 yang build dengan script ini akan menghasilkan image amd64 yang langsung jalan di Ubuntu server. Override kalau server-mu arm64:

```bash
PLATFORM=linux/arm64 bash scripts/build-push.sh
# atau multi-arch:
PLATFORM=linux/amd64,linux/arm64 bash scripts/build-push.sh
```

### 3) Di server (tiap kali deploy)

```bash
# pakai tag :latest (default)
bash /path/to/scripts/deploy.sh

# atau tag spesifik (rollback ke versi sebelumnya)
IMAGE_TAG=abc1234 bash /path/to/scripts/deploy.sh
```

Script ini:
- Pull image terbaru
- `docker stack deploy` — Swarm jalankan **rolling update**:
  - `order: start-first` → task baru dijalankan dulu
  - `delay: 5s` antara replica
  - `failure_action: rollback` → balik otomatis kalau healthcheck gagal
- Tunggu sampai semua service konvergen (max 5 menit)

**Rollback manual** kalau perlu:

```bash
docker service rollback sellon_api
docker service rollback sellon_web
```

## Konfigurasi yang bisa di-override

Registry + owner di-hard-code: `ghcr.io/ipoool/sellon-{api,web}`. Yang lain bisa override via env var:

| Var | Default | Dipakai di |
|---|---|---|
| `APP_DIR` | `/var/www/app` | semua |
| `APP_USER` | `$(logname)` | server-setup |
| `IMAGE_TAG` | `latest` | deploy |
| `DOMAIN` | `_` (catch-all) | server-setup (nginx) |
| `STACK_NAME` | `sellon` | deploy |
| `SWARM_NETWORK` | `sellon-net` | server-setup |
| `GHCR_USER` + `GHCR_PAT` | — | build-push, deploy (login otomatis) |

## Cara variable di-propagasi

### Backend (Go) — runtime via `/var/www/app/.env`

Container `api` punya `env_file: .env` di stack file. `docker stack deploy` baca file SAAT deploy + inline ke service spec → Go viper baca via `os.Getenv` di runtime. **Update `.env` di server → `bash scripts/deploy.sh` → service di-recreate dengan env baru.**

### Frontend (Next.js) — build-time via `web/.env.production`

Web container **tidak** baca env dari server. Semua nilai (NEXT_PUBLIC_* + server-side seperti `API_INTERNAL_URL`) di-bake ke image saat `pnpm build` dari `web/.env.production` di build context.

**Workflow di laptop:**

```bash
cp web/.env.production.example web/.env.production
nano web/.env.production            # isi domain produksi, Google client ID, dst
bash scripts/build-push.sh          # bake + push image
```

**Kalau ganti domain / Google client ID**: edit `web/.env.production` → rebuild + push → redeploy. Image tied to environment.

`web/.env.production` tidak masuk repo (`.gitignore` exclude `.env*` kecuali `.env.production.example`). User dev/CI yang punya tanggung jawab membuatnya sebelum build. `build-push.sh` fail-fast kalau file tidak ada.

## Catatan production

- **Postgres**: production pakai DB dedicated/managed (bukan container). Stack file tidak include service postgres — API connect via `POSTGRES_HOST` di `/var/www/app/.env` ke provider eksternal. Set `POSTGRES_SSLMODE=require` (atau `verify-full` kalau provider kasih CA cert).
- **Redis**: container di-pin ke manager node + named volume `sellon_redis-data` mount ke `/data`. Container BISA di-recreate saat deploy (kalau image upstream updates, atau stack spec berubah), tapi **data selamat** lewat volume + AOF (`--appendonly yes`, kehilangan max 1 detik). `docker stack rm` tidak menghapus volume — manual delete via `docker volume rm sellon_redis-data` kalau benar-benar mau bersih-bersih.
- **Migrations**: API otomatis jalankan `golang-migrate` di startup (`embed.FS`). Tidak perlu script terpisah.
- **Logs**: `docker service logs sellon_api --tail 200 -f`. Untuk persistent log, pasang Loki/Promtail atau pipe ke CloudWatch/Datadog.
- **Deploy gap (~3-5 detik)**: stack file pakai `mode: host` + `replicas: 1` supaya port api/web cuma reachable di `127.0.0.1` (tidak bocor ke publik). Trade-off: saat deploy ada gap singkat antara kill task lama + start task baru — nginx return 502 selama window itu. Untuk **true zero-downtime**, ada dua opsi:
  1. Tambahkan `HEALTHCHECK` di Dockerfile, Swarm akan tunggu sampai task baru healthy sebelum hapus lama — gap berkurang ke ~1-2 detik (masih bukan "0").
  2. Pindahkan nginx jadi Swarm service di overlay network, lalu balik `replicas: 2` + `mode: ingress`. Ini textbook Swarm prod setup tapi butuh refactor: nginx config + SSL cert harus di-mount via Docker config/secret, certbot lebih ribet. Worth it kalau Anda tumbuh ke multi-node Swarm.
