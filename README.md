# SellOn

SaaS WhatsApp commerce untuk UMKM Indonesia — buat katalog produk, terima pembayaran QRIS, dan kelola pesanan via WhatsApp tanpa potongan marketplace.

SellOn memakai model **facilitator**: setiap seller pakai akun Midtrans/Xendit mereka sendiri, dana mengalir langsung ke seller, platform tidak pernah pegang uang pembeli. Repository ini berisi backend Go (chi + pgx + Postgres + Redis) dan frontend Next.js 15 (App Router + Tailwind v4) di dalam monorepo tunggal.

## Prerequisites

- Docker & Docker Compose v2
- Go 1.25+ (untuk dev di luar Docker, opsional — Docker image sudah include)
- Node 20+ dan pnpm (via `corepack enable pnpm`, opsional jika dev di luar Docker)

## Quickstart

```bash
cp .env.example .env
make dev
```

- API: http://localhost:8080
- Web: http://localhost:3000
- Postgres: `localhost:5432` (user/pass: `sellon`)
- Redis: `localhost:6379`

Health check:

```bash
curl http://localhost:8080/health
```

## Struktur

```
sellon/
├── api/              Go backend (chi, pgx, slog, viper)
├── web/              Next.js 16 frontend (App Router, Tailwind v4)
├── docker-compose.yml
├── Makefile
└── .env.example
```

Lihat `api/README.md` dan `web/README.md` untuk detail per service.

## Make Targets

| Command | Action |
|---|---|
| `make dev` | copy `.env`, start all services, tail logs |
| `make up` / `make down` | start / stop services |
| `make logs` | tail combined logs |
| `make clean` | stop and remove volumes (reset state) |
| `make api-shell` / `make web-shell` / `make db-shell` | shell ke container |

## Google Sign-In Setup

SellOn login pakai Google Identity Services. Untuk mengaktifkan:

1. Buka [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials).
2. **Create Credentials → OAuth Client ID** → application type: **Web application**.
3. **Authorized JavaScript origins** (tambahkan keduanya untuk dev):
   - `http://localhost:3000`
   - `http://localhost:3100`
4. Copy "Client ID" yang dihasilkan, paste ke `.env` di **dua tempat** (nilai sama):
   ```env
   GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
   ```
5. Restart container: `docker compose restart api web`.

Buka http://localhost:3100/masuk → klik "Continue with Google" → akun otomatis dibuat di tabel `users` saat pertama kali login.

### Cara kerja

- Frontend pakai `accounts.google.com/gsi/client` untuk render tombol dan menerima ID token.
- ID token di-POST ke `/api/v1/auth/google`. Backend verify pakai `google.golang.org/api/idtoken` (cek audience = client ID, signature, expiration).
- Backend issue JWT (HS256, TTL default 7 hari) lalu set di `sellon_session` httpOnly cookie (`SameSite=Lax`).
- Protected route Go (`/api/v1/auth/me`) divalidasi via middleware `RequireAuth`.
- Server-side Next.js (`getMe()` di `src/lib/server-auth.ts`) baca cookie dan forward ke `/auth/me` lewat `API_INTERNAL_URL` — `/dasbor` redirect ke `/masuk` kalau session invalid.
