# TokoFlow

SaaS WhatsApp commerce untuk UMKM Indonesia — buat katalog produk, terima pembayaran QRIS, dan kelola pesanan via WhatsApp tanpa potongan marketplace.

TokoFlow memakai model **facilitator**: setiap seller pakai akun Midtrans/Xendit mereka sendiri, dana mengalir langsung ke seller, platform tidak pernah pegang uang pembeli. Repository ini berisi backend Go (chi + pgx + Postgres + Redis) dan frontend Next.js 15 (App Router + Tailwind v4) di dalam monorepo tunggal.

## Prerequisites

- Docker & Docker Compose v2
- Go 1.23+ (untuk dev di luar Docker, opsional)
- Node 20+ dan pnpm (via `corepack enable pnpm`, opsional jika dev di luar Docker)

## Quickstart

```bash
cp .env.example .env
make dev
```

- API: http://localhost:8080
- Web: http://localhost:3000
- Postgres: `localhost:5432` (user/pass: `tokoflow`)
- Redis: `localhost:6379`

Health check:

```bash
curl http://localhost:8080/health
```

## Struktur

```
tokoflow/
├── apps/
│   ├── api/          Go backend (chi, pgx, slog, viper)
│   └── web/          Next.js 15 frontend (App Router, Tailwind v4)
├── docker-compose.yml
├── Makefile
└── .env.example
```

Lihat `apps/api/README.md` dan `apps/web/README.md` untuk detail per service.

## Make Targets

| Command | Action |
|---|---|
| `make dev` | copy `.env`, start all services, tail logs |
| `make up` / `make down` | start / stop services |
| `make logs` | tail combined logs |
| `make clean` | stop and remove volumes (reset state) |
| `make api-shell` / `make web-shell` / `make db-shell` | shell ke container |
