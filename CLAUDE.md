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

- **Brand color:** OKLCH scale 50–950, all sharing the same hue (default `145` = emerald-teal). Find-replace `145` to another hue (e.g., `25` for orange) — every component shifts.
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

Marketing + auth + storefront (public):
```
/                         landing (Hero+TrustBar+Features+HowItWorks+Pricing+Testimonials+Faq+CtaBanner+Footer)
/login                    Google SSO (split-screen lg+, redirect → /dashboard if authed)
/setup                    first-time onboarding (create store)
/{slug}                   public storefront (catalog, layout per seller's product_layout)
/{slug}/product/{slug}    product detail page
/{slug}/cart              buyer cart
/{slug}/checkout          buyer checkout wizard (identitas → pengiriman → pembayaran)
/{slug}/order/{number}    buyer order status page (with payment proof upload)
/syarat-ketentuan, /kebijakan-privasi, /kebijakan-cookie  legal docs
/bantuan, /panduan, /status, /tentang, /roadmap            content pages
```

Authenticated seller dashboard (under `(dashboard)` route group):
```
/dashboard                stats overview
/orders                   pesanan list (filter + export CSV)
/orders/{id}              order detail (status actions, WA send, notes, payment proof view)
/products                 produk list (bulk select + delete, share link)
/products/new             create product
/products/{id}            edit product
/products/bulk-upload     XLSX bulk import (async job + SSE progress)
/customers                pelanggan list (segments, WA contact)
/customers/{id}           customer detail
/promos, /promos/{id}     promo list / detail
/reports                  laporan (overview, top products, top customers — locked for Free)
/settings/toko            profil toko + jam buka
/settings/storefront      tampilan storefront (logo, banner, theme hue, product layout)
/settings/payment         midtrans + bank accounts (manual transfer + QRIS statis)
/settings/shipping        pengiriman + origin city + free shipping threshold
/settings/whatsapp        WA templates + notification number
/settings/subscription    plan + invoices + upgrade dialog
/settings/team            staff + invites
/settings/activity        audit log (action filter + detail accordion)
/settings/category        kategori produk
```

Platform admin (under `/platform/*`):
```
/platform                 admin overview
/platform/users           list + impersonate + ban + hard-delete (typed "DELETE NOW")
/platform/users/{id}      user detail + per-user audit
/platform/stores          list semua toko
/platform/subscriptions   approve manual-transfer invoices
/platform/plans           plan pricing + marketing meta editor
/platform/audit           platform-wide audit log
```

API summary (current — full list di `internal/server/server.go`):
```
auth:        /auth/google, /auth/logout, /auth/me, /auth/exit-impersonation
store:       /store, /store/storefront, /store/shipping
products:    CRUD, /bulk (template/upload/jobs/active/stream), /bulk-delete, /{id}/duplicate
orders:      list/detail/stream, /{id}/status, /{id}/payment-link, /{id}/wa-log
customers:   list/detail/export
promos:      CRUD
reports:     overview, top-products, top-customers (Free tier locked)
plans:       /plans (public), /admin/plans (CRUD marketing meta + limits)
payments:    /payments/midtrans (CRUD + verify + rotate-webhook with "GENERATE" confirm)
uploads:     /uploads/image, /uploads/delete
storefront:  /storefront/{slug}, /storefront/{slug}/orders (create/get/mark-paid/payment-proof)
subscription:/subscription, /subscription/request-upgrade, /subscription/cancel
audit-log:   tenant-scoped activity feed
admin:       /admin/users (ban/unban/delete/impersonate), /admin/stores, /admin/plans,
             /admin/subscriptions, /admin/audit, /admin/stats
webhooks:    /webhooks/midtrans/{token} (per-store; rotate via dashboard)
SSE:         /orders/stream, /products/bulk/jobs/stream
```

## Configuration

Environment is loaded by both apps via the root `.env` (see `.env.example`). Notable vars:

- `WEB_PORT` — host port for the web service. Defaults to `3000`. The dev `.env` uses `3100` because port 3000 was occupied at scaffold time. CORS allowlist `WEB_ORIGIN` includes both.
- `WEB_ORIGIN` is **dual-purpose, comma-separated**: CORS allowlist (raw) + canonical base URL for email/notification links. For URL building, always use `cfg.PrimaryWebOrigin()` (returns first non-empty entry, trimmed). Never `strings.TrimRight(cfg.WebOrigin, "/")` — that produces `http://a,http://b/path` garbage if two origins listed.
- `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` must be set to the **same** value (one for backend ID-token verification, one inlined into the client bundle for the GIS button). Without these, the login page renders a "belum dikonfigurasi" placeholder card instead of the Google button.
- `JWT_SECRET` is required (server fails to start otherwise). Generate with `openssl rand -hex 32`.
- `MAILTRAP_API_KEY` + `FROM_EMAIL=halo@sellon.id` + `FROM_NAME=SellOn` drive all transactional email. Without the key, mailer is a no-op (logs only). For deliverability to Gmail/etc, the `sellon.id` domain must be SPF+DKIM verified inside Mailtrap dashboard → Sending Domains.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_BUCKET=stores`. **Bucket must be PUBLIC** — public storefront images use `…/object/public/{bucket}/…` URLs, no auth header. Random object keys (`{store_id}/{kind}/{stamp}-{8byte-hex}.{ext}`) prevent enumeration.
- `API_INTERNAL_URL=http://api:8080` is used by the Next.js server runtime to reach the API across the Docker network. Browser-side fetches use `NEXT_PUBLIC_API_URL=http://localhost:8080` instead.

**`docker compose restart` does NOT reload `env_file`.** When `.env` changes (mail key, Supabase key, JWT secret, anything), use `docker compose up -d --force-recreate api web` to recreate containers with fresh env. `docker compose up -d` alone only recreates services whose compose-spec env changed, not those whose `env_file` content changed silently. For DB user/name changes, also `docker compose down -v` because postgres only initializes the role on a fresh volume.

## Important Drafts and Placeholders

The codebase ships with **placeholder content** that's intentionally not production-ready. Do not silently remove the warning banners or convert them into real claims:

- **Legal docs** (`/syarat-ketentuan`, `/kebijakan-privasi`, `/kebijakan-cookie`): the yellow "draft awal" banners were removed by founder request on 2026-05-10. Real lawyer review is still required before launch — do not treat their absence as endorsement.
- **About + Roadmap**: team names (Andi/Citra/Bayu/Dewi), timeline, vote counts, stats ("1.000+ UMKM", "27 provinsi") are illustrative placeholders.

(Sidebar nav is now live for all routes. Help center, Panduan, and Status page placeholders have since been replaced with real content / live probes.)

## Conventions Worth Preserving

- **One commit per phase / per task.** Commit messages follow `feat(scope): …` / `refactor(scope): …` / `chore(scope): …` with a short summary line and brief bullet body. Co-author trailer is set by the harness.
- **Indonesian copy, English code comments.** Don't translate identifiers or comments to Indonesian.
- **No new deps without clear reason.** When adding one, prefer the minimal-overhead option (e.g., we picked native `<dialog>` over a Headless UI dialog; `<details>` over an Accordion library; CSS-only Tooltip via `group-hover` instead of Radix).
- **Server-first React.** Pages are server components by default; promote to `'use client'` only for interactive bits. State that can live on the server should — including auth checks via `getMe()`.
- **Avatar, Badge, Stat, Card, Tooltip, ConfirmDialog** are the canonical primitives — reuse them rather than re-rolling card markup. New shared UI goes in `web/src/components/ui/`; new layout pieces in `layout/`; marketing-only stuff in `marketing/`.
- **Bounded EXISTS probes for hot-path quota checks.** Never `SELECT COUNT(*)` for tier-limit enforcement on the create path; use `HasAtLeast(storeID, threshold)` with `LIMIT 1` — O(1) regardless of store size.
- **Subscription snapshot pattern.** Plan limits are snapshotted onto the `subscriptions` row at upgrade time. Admin changes to `plans` table do NOT retroactively affect existing subscribers. See migration 0022.
- **Plan-gating defense-in-depth.** Pro/Bisnis features (bulk upload, theme hue, product layout) gate at both FE (hide/disable button + show upsell) and BE (return 402 Payment Required). Don't rely on either alone.
- **Email chrome via `email.WrapHTML`.** All transactional emails (welcome, order status, payment notification, digital fulfillment) reuse the same outer shell — white card on slate-100 background, SellOn wordmark header, green `#10b981` CTA buttons, footer fineprint. Inline styles only (no `<style>` tag — Gmail/Outlook strip them).
- **Typed-phrase confirm dialogs for destructive actions.** Use `requireTypedPhrase` prop on `ConfirmDialog` to force seller to type a literal phrase: `DELETE ALL` (products bulk delete), `DELETE NOW` (admin hard-delete user), `GENERATE` (rotate Midtrans webhook URL — sets store offline). Backend additionally guards these (cross-tenant scope, conflict-409 single-shot, etc.) regardless of FE confirmation.
- **Storage cleanup on entity delete.** When deleting any DB row with image URLs (products, stores, users), snapshot the URLs BEFORE delete, then fire-and-forget `storage.DeleteObjects(paths)` in a goroutine with `context.Background()` after DB commit. Failure logged but never blocks the user response — orphan files don't break UX. Backend enforces cross-tenant scope via `{store_id}/` path prefix.
- **Bulk-upload runs background via SSE.** `/products/bulk` returns 202 with `{job_id}` immediately, spawns goroutine that publishes `bulk_job.progress|completed|failed` events via `events.Broker`. FE `BulkJobWatcher` (mounted in `DashboardShell`) subscribes via `EventSource` and renders persistent toast in top-right corner across page navigation. Polling endpoint `/jobs/active` kept as fallback.
- **Public SSE-style logging quiet rule.** Logger middleware skips logs for OPTIONS preflight, `*/orders/stream`, `*/bulk/jobs/stream`, `*/health` — they're either noisy without value or fire on long-lived connections.
- **`forceMobile` prop pattern in storefront-catalog.** Tailwind `sm:`/`lg:` responsive classes trigger on viewport (browser width), not container width. Inside the layout-preview dialog's mobile frame (`max-w-sm`), viewport is still desktop — so `sm:grid-cols-3` etc. activate and the preview is wrong. Components in `storefront/storefront-catalog.tsx` accept a `forceMobile` boolean that overrides responsive classes to hard mobile counts. Real storefront page calls without this prop, so its responsive behavior unchanged.
- **Buyer-side endpoints scoped by `{store_slug}/{order_number}` — public (no auth).** Examples: `/storefront/{slug}/orders/{number}/payment-proof`, `/mark-paid`. Guards: order belongs to slug's store + single-shot 409 conflict for proof upload + multipart validated.
- **Admin actions log to `platform_audit_log`, store actions log to `audit_log`.** Different tables, different scopes. Admin views: `/platform/audit`. Seller view: `/settings/activity`. Don't cross-write.

## Things to Avoid

- Editing the directory name `tokoflow/` — that's the host path, harmless. The brand and module identifier is `sellon`.
- Hard-coding `localhost:3000` in CORS or env — use `WEB_ORIGIN` from config and respect the `WEB_PORT` override.
- Adding `dotenv` libs to either app — both apps read process env directly (viper for Go, `process.env` for Next).
- Touching the postgres volume to "fix" data — for schema changes, write a new numbered migration in `api/internal/db/migrations/NNNN_*.up.sql` (and `.down.sql`); they auto-run on api boot via `embed.FS`.

## Web app deviations from training data

`web/AGENTS.md` (linked from `web/CLAUDE.md`) flags that this repo runs **Next.js 16**, which has API and convention changes vs. older Next.js. When in doubt, read `web/node_modules/next/dist/docs/01-app/` rather than relying on memory. Notable: turbopack is the default dev compiler now (we still pass `--no-turbopack` to `pnpm create next-app` for stability), and Tailwind v4 uses CSS-first `@theme` config (no `tailwind.config.ts`).
