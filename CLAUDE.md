# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**SellOn** — WhatsApp-commerce SaaS for Indonesian UMKM. Facilitator model: each seller uses their own Midtrans/Xendit account; the platform never holds buyer funds. Repository is in the directory `tokoflow/` (legacy name; brand and code identifiers are all `sellon`/`SellOn`).

UI copy is **Bahasa Indonesia**. Code comments and commits stay in English.

## Stack

| Layer | Choice |
|---|---|
| Backend | Go 1.25 (chi router, pgx pool, `log/slog`, viper, golang-migrate w/ embedded SQL, golang-jwt, google.golang.org/api/idtoken) |
| Frontend | Next.js 16 (App Router), React 19, TypeScript 5, **Tailwind v4** (CSS-first `@theme`), pnpm 9, lucide-react |
| Data | Postgres 16, Redis 7 |
| Local orchestration | docker compose (4 services: api, web, postgres, redis) |

## Common Commands

All workflows are container-based via the root `Makefile`. **Do not add features that require host-installed Go or pnpm** unless absolutely necessary; the contract is `make dev` works on a fresh clone.

```bash
make dev           # cp .env.example .env (if missing), up + tail api/web logs
make up / down     # start / stop without log tail
make logs          # tail combined logs
make clean         # docker compose down -v (drops postgres + node_modules + go-modules volumes)
make api-shell     # sh into api container
make web-shell     # sh into web container
make db-shell      # psql -U sellon -d sellon
```

### Type-checking and verification

```bash
# Frontend (run inside web — pnpm exec works in repo root too if cwd persists)
cd web && pnpm exec tsc --noEmit

# Backend
cd api && go build -o /tmp/sellon-api ./cmd/server && rm /tmp/sellon-api
```

There are no test suites yet. When you add tests, prefer integration tests that hit a real Postgres (compose already provisions one); avoid mocking the DB layer.

### Adding dependencies (important gotcha)

The `web` compose service mounts `/app/node_modules` as an **anonymous volume**, so `pnpm add` on the host does **not** propagate into the container. Two valid paths:

```bash
# Option A: install inside the container
docker compose exec web pnpm add <pkg>

# Option B: install on host, then recreate the container so the volume re-syncs
cd web && pnpm add <pkg>
cd ../.. && docker compose rm -fsv web && docker compose up -d web
```

For Go: `cd api && go get …` works on host because Go modules are cached in a named volume and resolved during the container's air rebuild.

## Architecture

### Monorepo Layout

```
api/                    Go backend (module github.com/sellon/sellon/api)
├── cmd/server/         entry point — main.go, slog setup, graceful shutdown
├── internal/
│   ├── auth/           JWTService, GoogleVerifier, request-context helpers, SessionCookieName
│   ├── config/         viper-based env loader, returns *Config (DSN, IsProd, etc.)
│   ├── db/             pgxpool connect + golang-migrate runner with embedded migrations/*.sql
│   ├── handler/        HTTP handlers (Health, Info, Auth)
│   ├── middleware/     CORS, Logger, Recover, RequireAuth
│   ├── pkg/response/   JSON / Error helpers
│   ├── repository/     UserRepo (FindOrCreateByGoogleID, FindByID)
│   └── server/         chi.Router + http.Server wiring
└── Dockerfile          multi-stage: builder, dev (with air), prod (distroless)

web/                    Next.js 16 App Router
└── src/
    ├── app/            Pages (see "Routes")
    ├── components/     ui/, layout/, marketing/, home/, auth/
    └── lib/            server-auth.ts (getMe via cookie forward), api.ts, utils.ts (cn)
```

### Auth flow (the load-bearing piece)

End-to-end: **frontend → Google Identity Services → backend verifies → session cookie**.

1. `GoogleSignInButton` (`web/src/components/auth/`) loads `accounts.google.com/gsi/client` and renders a button using `NEXT_PUBLIC_GOOGLE_CLIENT_ID`.
2. On click, Google returns an ID token. Frontend POSTs `{ credential }` to `/api/v1/auth/google`.
3. Backend verifies via `google.golang.org/api/idtoken.Validate(ctx, token, GoogleClientID)`, then `UserRepo.FindOrCreateByGoogleID` upserts on `google_id` (refreshing email/name/picture every login).
4. Backend issues HS256 JWT (claims: `uid` UUID, exp from `JWT_TTL_HOURS`, iss `sellon-api`) and sets it as `sellon_session` httpOnly cookie (`SameSite=Lax`, `Secure` only when `cfg.IsProd()`).
5. Server-side rendered pages call `getMe()` from `web/src/lib/server-auth.ts`, which reads the cookie, forwards it to `/api/v1/auth/me` via `API_INTERNAL_URL` (e.g. `http://api:8080`), and returns `Me | null`.
6. Protected routes (`/dasbor`) call `getMe()` and `redirect("/masuk")` server-side when null.

`SameSite=Lax` works between `localhost:3100` (browser) and `localhost:8080` (api) because they share the registrable domain `localhost` — same-site for cookie purposes despite different ports.

### Theme system (load-bearing for design)

The entire visual language is driven by Tailwind v4 `@theme` tokens in **`web/src/app/globals.css`** — single edit point.

- **Brand color:** OKLCH scale 50–950, all sharing the same hue (default `160` = emerald-teal). Find-replace `160` to another hue (e.g., `25` for orange) — every component shifts.
- **Fonts:** `--font-sans` and `--font-display` reference `--font-plus-jakarta-sans` set by `next/font/google` in `layout.tsx`. To swap fonts, update both: the next/font import in `layout.tsx` and the variable name in `globals.css`.
- **Custom utilities** in `@layer utilities`: `.bg-dot-grid`, `.bg-gradient-brand`, `.bg-gradient-brand-soft`, `.text-gradient-brand`.
- **Shadows scale:** `soft / card / elevated / popout`. Use `popout` only for modals + emphasized pricing tier.

Don't introduce hard-coded colors or shadows — always use theme tokens so the founder can re-skin from this one file.

### Frontend layout patterns

Two distinct shells. Don't mix them:

- **Marketing pages** (landing, /tentang, /roadmap, /bantuan, /panduan, /status, /syarat-ketentuan, /kebijakan-privasi, /kebijakan-cookie): `<Header me={me} />` + `<main>` + `<Footer />`. Header has `variant="marketing"` (default) showing Fitur / Cara Kerja / Harga / FAQ links.
- **App pages** (/dasbor and any future authenticated pages): wrap in `<DashboardShell me={me} pageTitle="…" pageSubtitle="…" actions={…}>`. Provides sidebar + sticky topbar + responsive mobile drawer (`<dialog>`-based, no extra deps). Sidebar nav highlights active route via `usePathname`.

The marketing `/masuk` page is a hybrid: split-screen layout, no Header/Footer, redirects to `/dasbor` if `getMe()` returns a user.

### Routes

```
/                         landing (Hero+TrustBar+Features+HowItWorks+Pricing+Testimonials+Faq+CtaBanner+Footer)
/masuk                    Google SSO login (split-screen lg+, redirect → /dasbor if authed)
/dasbor                   protected dashboard (DashboardShell, redirect → /masuk if unauthed)
/syarat-ketentuan         T&C with sticky TOC
/kebijakan-privasi        privacy policy with sticky TOC
/kebijakan-cookie         cookie policy
/bantuan                  help center (search hero + 6 categories)
/status                   service status (90-day uptime placeholder)
/panduan                  UMKM article hub
/tentang                  about page (mission, principles, timeline, team)
/roadmap                  4-column public roadmap (Sudah Rilis / In progress / Berikutnya / Considering)
```

API:
```
GET  /health                  liveness
GET  /api/v1/info             service metadata
POST /api/v1/auth/google      verify Google credential, set session cookie
POST /api/v1/auth/logout      clear session cookie
GET  /api/v1/auth/me          protected (RequireAuth), returns current user
```

## Configuration

Environment is loaded by both apps via the root `.env` (see `.env.example`). Notable vars:

- `WEB_PORT` — host port for the web service. Defaults to `3000`. The dev `.env` uses `3100` because port 3000 was occupied at scaffold time. CORS allowlist `WEB_ORIGIN` includes both.
- `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` must be set to the **same** value (one for backend ID-token verification, one inlined into the client bundle for the GIS button). Without these, the masuk page renders a "belum dikonfigurasi" placeholder card instead of the Google button.
- `JWT_SECRET` is required (server fails to start otherwise). Generate with `openssl rand -hex 32`.
- `API_INTERNAL_URL=http://api:8080` is used by the Next.js server runtime to reach the API across the Docker network. Browser-side fetches use `NEXT_PUBLIC_API_URL=http://localhost:8080` instead.

When changing `.env`, run `docker compose up -d` (compose detects env changes and recreates affected containers). For DB user/name changes, also `docker compose down -v` because postgres only initializes the role on a fresh volume.

## Important Drafts and Placeholders

The codebase ships with **placeholder content** that's intentionally not production-ready. Do not silently remove the warning banners or convert them into real claims:

- **Legal docs** (`/syarat-ketentuan`, `/kebijakan-privasi`, `/kebijakan-cookie`): each carries a yellow "draft awal — perlu review kuasa hukum" banner. Real legal review required before public launch.
- **About + Roadmap**: team names (Andi/Citra/Bayu/Dewi), timeline, vote counts, stats ("1.000+ UMKM", "27 provinsi") are illustrative placeholders.
- **Help center & Panduan**: search and article links are `cursor-not-allowed` — no CMS yet.
- **Status page**: hardcoded `"operational"`, no real monitoring integration.
- **Sidebar nav** (Pesanan/Produk/Pelanggan/Promo/Pengaturan): all disabled until those routes are built.

## Conventions Worth Preserving

- **One commit per phase / per task.** Commit messages follow `feat(scope): …` / `refactor(scope): …` / `chore(scope): …` with a short summary line and brief bullet body. Co-author trailer is set by the harness.
- **Indonesian copy, English code comments.** Don't translate identifiers or comments to Indonesian.
- **No new deps without clear reason.** When adding one, prefer the minimal-overhead option (e.g., we picked native `<dialog>` over a Headless UI dialog; `<details>` over an Accordion library).
- **Server-first React.** Pages are server components by default; promote to `'use client'` only for interactive bits (auth button, pricing toggle, dashboard mobile drawer, logout dialog). State that can live on the server should — including auth checks via `getMe()`.
- **Avatar, Badge, Stat, Card** are the canonical primitives — reuse them rather than re-rolling card markup. New shared UI goes in `web/src/components/ui/`; new layout pieces in `layout/`; marketing-only stuff in `marketing/`.

## Things to Avoid

- Editing the directory name `tokoflow/` — that's the host path, harmless. The brand and module identifier is `sellon`.
- Hard-coding `localhost:3000` in CORS or env — use `WEB_ORIGIN` from config and respect the `WEB_PORT` override.
- Adding `dotenv` libs to either app — both apps read process env directly (viper for Go, `process.env` for Next).
- Touching the postgres volume to "fix" data — for schema changes, write a new numbered migration in `api/internal/db/migrations/NNNN_*.up.sql` (and `.down.sql`); they auto-run on api boot via `embed.FS`.

## Web app deviations from training data

`web/AGENTS.md` (linked from `web/CLAUDE.md`) flags that this repo runs **Next.js 16**, which has API and convention changes vs. older Next.js. When in doubt, read `web/node_modules/next/dist/docs/01-app/` rather than relying on memory. Notable: turbopack is the default dev compiler now (we still pass `--no-turbopack` to `pnpm create next-app` for stability), and Tailwind v4 uses CSS-first `@theme` config (no `tailwind.config.ts`).
