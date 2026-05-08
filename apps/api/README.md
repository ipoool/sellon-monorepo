# sellon-api

Go backend service untuk SellOn — chi router, pgx, Postgres, Redis, slog.

## Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Liveness probe — `{"status":"ok"}` |
| GET | `/api/v1/info` | Service metadata (name, version, env) |

## Run

### Via Docker (rekomendasi)

Dari root repo:

```bash
make dev
```

### Standalone (tanpa Docker)

Butuh Go 1.25+ dan `air`:

```bash
go install github.com/air-verse/air@latest
cp ../../.env.example ../../.env
air -c .air.toml
```

## Struktur

```
apps/api/
├── cmd/server/main.go            entry point
├── internal/
│   ├── config/                   viper-based env loader
│   ├── server/                   chi router + http.Server
│   ├── handler/                  HTTP handlers
│   ├── middleware/               cors, logger, recover
│   └── pkg/response/             JSON / Error helpers
├── migrations/                   SQL migrations (golang-migrate format)
├── .air.toml                     hot-reload config
├── Dockerfile                    multi-stage: builder, dev, prod
└── go.mod
```

## Tech

- `go-chi/chi` v5 — router
- `jackc/pgx` v5 — Postgres driver (akan dipakai di iterasi berikutnya)
- `spf13/viper` — config dari env
- `go-playground/validator` v10 — request validation
- `log/slog` — structured logging
