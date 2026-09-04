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

Integration tests live next to the code and skip unless `TEST_DATABASE_URL` is set, so
`go test ./...` stays green without a database. To run them against a throwaway Postgres
(never the dev volume — it holds real accounts):

```bash
docker run -d --name pg-test -e POSTGRES_USER=sellon -e POSTGRES_PASSWORD=sellon \
  -e POSTGRES_DB=sellon_test -p 55432:5432 postgres:16-alpine
cd api && TEST_DATABASE_URL='postgres://sellon:sellon@localhost:55432/sellon_test?sslmode=disable' \
  go test ./internal/repository/ -run Auth -v
```

`internal/repository/authflow_integration_test.go` covers the register-claim, OTP
attempt-lock and password-reset invariants. Prefer integration tests that hit a real
Postgres; avoid mocking the DB layer.

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

End-to-end: **email + password → 6-digit code emailed → session cookie**. Google SSO was
replaced in `1efd466`; `/auth/google` still exists as a backend-only fallback for legacy rows
and is wired to no UI.

**The password is never written to `users.password_hash` before the mailbox is proven.**
`POST /auth/register` parks the bcrypt hash (and name) on the `email_verifications` row
(`pending_password_hash` / `pending_name`, migration 0097) and always emails a code —
including for a legacy Google-only row, which migration 0096 backfilled as
`email_verified_at` non-null. Installing the password at register time meant anyone who
typed an existing email got a session for that account, the seeded platform admin included.
For the same reason a brand-new email is inserted with an EMPTY password: an unverified row
is not an account yet, so a squatter cannot lock the real owner out — the owner re-registers,
receives the code, and their password wins. Only a verified row WITH a password returns 409.

1. `EmailAuthForm` (`web/src/components/auth/`) POSTs `/auth/register` or `/auth/login`.
2. `POST /auth/verify-email` takes `{email, code, password}`. The code alone is deliberately
   NOT enough: a stray code delivered to a mailbox whose owner never registered would
   otherwise let that owner install a password a third party chose. The submitted password is
   compared against the parked hash before it is applied.
3. `EmailVerificationRepo.Consume` bumps `attempt_count` in the SAME `UPDATE` that selects the
   row (`... AND attempt_count < 5 RETURNING code_hash`), then runs the caller's `apply`
   inside that transaction. A read-then-write here let concurrent guesses all pass the
   5-attempt lock; see `TestAuthOTPAttemptLockIsAtomic`.
4. Backend issues an HS256 JWT (claims `uid`, `iat`, exp from `JWT_TTL_HOURS`, iss
   `sellon-api`) as the `sellon_session` httpOnly cookie (`SameSite=Lax`, `Secure` only when
   `cfg.IsProd()`).
5. Server-rendered pages call `getMe()` from `web/src/lib/server-auth.ts`, which forwards the
   cookie to `/auth/me` via `API_INTERNAL_URL`.
6. Protected routes call `getMe()` and `redirect("/login")` server-side when null.

**`RequireAuth` loads the user row**, so two things a stateless JWT cannot express are
enforced per request: a ban takes effect immediately instead of at token expiry (up to 7
days later), and `users.sessions_valid_after` revokes every token issued before a password
reset. The row is cached on the request context (`auth.WithSessionUser`) so `RequireSeller`
and `RequireAdmin` reuse it instead of re-querying.

**Password reset** shares the `email_verifications` table via `purpose` (`verify` | `reset`);
a code minted for one purpose is rejected by the other endpoint. `/auth/forgot-password`
always answers 200 so it can't be used to enumerate accounts, and `/auth/login` runs bcrypt
against a dummy hash for unknown or password-less emails so timing and copy are identical.

**Rate limiting**: `middleware.RateLimit` is a dependency-free in-memory fixed-window
per-IP limiter wired onto `/auth/*`, the buyer OTP endpoints, and the anonymous storefront
order endpoints. It throttles casual abuse only — it keys off `RemoteAddr` after chi's
`RealIP`, which trusts `X-Forwarded-For`. The per-account counters (OTP attempts, resend
quota) are the guarantees that don't depend on the caller's IP.

`SameSite=Lax` works between `localhost:3100` (browser) and `localhost:8080` (api) because
they share the registrable domain `localhost` — same-site for cookie purposes despite
different ports.

**Buyer email-OTP is a SEPARATE auth path — never conflate it with seller auth (privilege-escalation guard).** Digital/course buyers verify the order's email via a one-time code to reach token-gated content. Distinct from the seller `sellon_session`: the backend issues a `buyer_session` cookie (issuer `sellon-buyer`, `BuyerClaims{StoreID,TokenID,OrderItemID,Email}`), guarded by `RequireBuyer` (NOT `RequireAuth`), and **scoped to a single download token** — handlers re-check `claims.TokenID == path token`. OTP machinery: `BuyerOTPRepo` (rate-limited, keyed by `(token_id, email)`), the shared `resolveToken` resolver in `handler/buyer_course.go` (serves course AND digital), and the `RenderBuyerOTP` email. The same request/verify endpoints work for any download token. FE: `BuyerOtpGate` is the reusable email→code card.

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

### Offline-first POS (local-first cashier)

The POS (`/pos`, Bisnis-only) keeps selling when in-store internet drops. Toggle per store at `/settings/offline` (`stores.offline_enabled`). Architecture:

- **Service worker** — `web/public/sw.js`, hand-rolled (not Serwist), **network-first** (fresh code wins online; cache is offline fallback). Serves the cached `/pos` shell for a cold-offline start. **Production-only**: `web/src/lib/offline/register-sw.ts` only registers it when `NODE_ENV === "production"` and unregisters + clears caches in dev — intercepting Turbopack's HMR chunks is incompatible with `next dev`.
- **IndexedDB** — `web/src/lib/offline/db.ts` (`idb`). Object stores: `products`/`categories`/`meta` (catalog + `store_config` snapshot of tax/offline flag), `pos_cart` (cart/customer/discount), `pos_order_queue` (queued offline orders), plus the active shift under its own `meta` key (`saveActiveSession` — kept separate so frequent cart writes can't null it; restored on a cold reload **only when offline**, since the server is authoritative online).
- **Online status** — `online.ts` `useOnlineStatus()` via `useSyncExternalStore` over `navigator.onLine`.
- **Sync engine** — `sync.ts` `syncQueue()` replays the queue in bounded batches; transient failure stops + retries, permanent 4xx flags `failed`. **Global** `OfflineSyncWatcher` (mounted in `(dashboard)/layout.tsx`) drives it on **every** dashboard page (survives navigation/refresh, not just `/pos`), fires on reconnect + a 10s tick, and shows a background toast. `OfflineIndicator` in the POS header is display-only.
- **Idempotency (anti double-charge)** — every order carries a client `crypto.randomUUID()` `idempotency_key`; backend partial UNIQUE index on `(store_id, idempotency_key)` (migration 0090). On replay the create returns the existing order — no double stock/loyalty/charge.
- **Conflict = flag, not block** — an offline order with a stock shortfall, OR a payment-short after a config change, still records and sets `needs_review` + `review_reason` (surfaced as a "Perlu dicek" badge in Pesanan, filterable). Online path keeps the strict stock + payment guards.
- **Tax/amount integrity** — offline orders carry a tax snapshot (`offline_tax_bps`/`offline_tax_inclusive`); the server honors it for offline orders so the synced total matches what the cashier collected even if the store tax changed before sync.
- **Cash-only offline** — payment modal forces cash when offline: `cashOnly = offlineEnabled && !online` (non-cash rails need connectivity). Variant picker uses `?include_variants=1`-embedded variants so it needs no network offline.
- **Testing** — cold-offline reload is only reliable on a production build / the deployed site (Turbopack regenerates dev chunk URLs). In `next dev`, test the flow by toggling DevTools Offline **without** reloading. NEVER `pnpm build` against the dev container (clobbers `next dev`'s `.next`).

### Digital & course products (token-gated delivery)

Three `products.product_type`: `physical` | `digital` | `course`. Non-physical have no stock/shipping/variants (the form forces these to zero) and use the dedicated `NonPhysicalProductForm`, not the physical form.

- **Delivery via `download_tokens`.** `fulfillment.OnPaymentPaid` is the **SINGLE token-mint path** (idempotent, keyed by `order_item_id`; called from BOTH the Midtrans webhook AND manual mark-paid). It mints a random 256-bit token per non-physical line item via `PrepareDigitalFulfillment` (digital + course; mixed carts still mint, order auto-completes only when all lines are non-physical), then emails the buyer. Digital → `/download/{token}`; course → `/{slug}/course/{token}`.
- **Both are email-OTP gated** (see the buyer-OTP auth note above). `/download/{token}` is behind `RequireBuyer` (was public pre-v1.6.1); the course viewer is a client OTP flow (`CourseViewer` → `BuyerOtpGate` → `CoursePlayer`). Access is logged **once per successful OTP verify** (not per page refresh) into `download_logs`; `clientIP` prefers `CF-Connecting-IP`/`X-Forwarded-For` and strips the port.
- **Course content** = ordered `course_videos` (YouTube URL + markdown) watched on the OTP-gated viewer; seller preview at `/products/{id}/course-preview` (no OTP).
- **Access validity ("masa aktif")** — `products.access_validity_value` + `access_validity_unit` (`lifetime`|`week`|`month`|`year`, default lifetime; migration 0094). At mint, `fulfillment.accessExpiry` sets the token's `expires_at` via calendar `AddDate` (lifetime → nil; month/year are calendar-correct, not fixed days). `resolveToken` returns 410 "link sudah kedaluwarsa" past expiry; the viewer/preview show a "masa aktif" badge. Existing tokens keep their issued expiry — no retroactive change.

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
/settings/payment         midtrans (production-only, "Connect" Snap-popup verify) + bank accounts (manual transfer + QRIS statis)
/settings/domain          custom domain (CNAME → cname.sellon.id, "Verifikasi DNS", Bisnis-only)
/settings/shipping        pengiriman + origin city + free shipping threshold
/settings/whatsapp        WA templates + notification number (new-order notif section temporarily disabled via NOTIFICATIONS_DISABLED flag)
/settings/offline         Mode Offline POS toggle (Bisnis-only)
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
auth:        /auth/register, /auth/login, /auth/verify-email, /auth/resend-verification,
             /auth/forgot-password, /auth/reset-password, /auth/logout, /auth/me,
             /auth/exit-impersonation, /auth/google (legacy fallback, no UI)
store:       /store, /store/storefront, /store/shipping, /store/offline (POS offline toggle), /store/custom-domain (set/verify/delete)
products:    CRUD, /bulk (template/upload/jobs/active/stream), /bulk-delete, /{id}/duplicate, list ?include_variants=1 (POS embeds variants for offline)
orders:      list/detail/stream, /{id}/status, /{id}/payment-link, /{id}/wa-log
download:    /download/{token} (RequireBuyer — digital delivery DTO), /download/{token}/request-otp + /verify-otp (public OTP)
course:      /storefront/{slug}/course/{token}/content (RequireBuyer) + /request-otp + /verify-otp (public) — OTP-gated course viewer
digital-dl:  /digital-downloads (seller audit of token access), /customers/{id}/downloads (per-customer links + share signal)
pos:         /pos/orders (idempotent create — client UUID; offline=true relaxes stock/payment guard + flags needs_review), /pos/printer/config (multi-line header/footer)
customers:   list/detail/export
promos:      CRUD
reports:     overview, top-products, top-customers (Free tier locked)
plans:       /plans (public), /admin/plans (CRUD marketing meta + limits)
payments:    /payments/midtrans (CRUD + connect[Snap-popup verify] + rotate-webhook with "GENERATE" confirm) — production-only, no sandbox
uploads:     /uploads/image, /uploads/delete
storefront:  /storefront/{slug}, /storefront/{slug}/orders (create/get/mark-paid/payment-proof), /storefront/domain-lookup (Host→slug)
internal:    /internal/tls-check (public — Caddy on-demand-TLS "ask"; 200 only for active custom domains)
subscription:/subscription, /subscription/request-upgrade, /subscription/cancel, /subscription/checkout (platform Snap, production-only)
audit-log:   tenant-scoped activity feed
admin:       /admin/users (ban/unban/delete/impersonate), /admin/stores, /admin/plans,
             /admin/subscriptions, /admin/audit, /admin/stats
webhooks:    /webhooks/midtrans/{token} (per-store), /webhooks/platform/midtrans (subscription billing)
SSE:         /orders/stream, /products/bulk/jobs/stream
```

## Configuration

Environment is loaded by both apps via the root `.env` (see `.env.example`). Notable vars:

- `WEB_PORT` — host port for the web service. Defaults to `3000`. The dev `.env` uses `3100` because port 3000 was occupied at scaffold time. CORS allowlist `WEB_ORIGIN` includes both.
- `WEB_ORIGIN` is **dual-purpose, comma-separated**: CORS allowlist (raw) + canonical base URL for email/notification links. For URL building, always use `cfg.PrimaryWebOrigin()` (returns first non-empty entry, trimmed). Never `strings.TrimRight(cfg.WebOrigin, "/")` — that produces `http://a,http://b/path` garbage if two origins listed.
- `GOOGLE_CLIENT_ID` and `NEXT_PUBLIC_GOOGLE_CLIENT_ID` must be set to the **same** value (one for backend ID-token verification, one inlined into the client bundle for the GIS button). Without these, the login page renders a "belum dikonfigurasi" placeholder card instead of the Google button.
- `JWT_SECRET` is required (server fails to start otherwise). Generate with `openssl rand -hex 32`.
- `MAILTRAP_API_KEY` + `FROM_EMAIL=halo@sellon.id` + `FROM_NAME=SellOn` drive all transactional email. Without the key, mailer is a no-op (logs only). For deliverability to Gmail/etc, the `sellon.id` domain must be SPF+DKIM verified inside Mailtrap dashboard → Sending Domains.
- `S3_ENDPOINT` + `S3_REGION` + `S3_BUCKET` + `S3_ACCESS_KEY` + `S3_SECRET_KEY` — the **active** upload backend (S3-compatible; the platform runs on Cloudeka). Defaults point at the production bucket, so only the two credentials need filling in. `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` work as aliases. **The bucket is PRIVATE** — Cloudeka ignores per-object ACLs (verified: a PUT with `x-amz-acl: public-read` still returns an owner-only ACL), and a world-readable bucket wasn't wanted, so reads go through the API. Stored asset URLs point at `{API}/api/v1/files/{key}` (`S3_PUBLIC_BASE_URL`, defaulting to `WEBHOOK_BASE_URL` + `/api/v1/files`), and `handler.FilesHandler` streams the object with a signed GET. Because the prefix is resolved at read time, putting a CDN in front is an env change, not a database rewrite. Leaving the credentials as the literal `YOUR_ACCESS_KEY`/`YOUR_SECRET_KEY` counts as **unconfigured** on purpose, so a half-configured deploy answers 503 instead of opaque 403s. Random object keys (`{store_id}/{kind}/{stamp}-{8byte-hex}.{ext}`) prevent enumeration, and the `{store_id}/` prefix is what the cross-tenant delete guard checks.
- `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_BUCKET` — **legacy, deletes only.** Nothing is written here any more. Keep set only while rows still reference a Supabase public URL so cleanup can reach the old bucket; unset all three once none remain and the client drops out via `NewMultiClient`.
- `API_INTERNAL_URL=http://api:8080` is used by the Next.js server runtime to reach the API across the Docker network. Browser-side fetches use `NEXT_PUBLIC_API_URL=http://localhost:8080` instead.

**`docker compose restart` does NOT reload `env_file`.** When `.env` changes (mail key, S3 credentials, JWT secret, anything), use `docker compose up -d --force-recreate api web` to recreate containers with fresh env. `docker compose up -d` alone only recreates services whose compose-spec env changed, not those whose `env_file` content changed silently. For DB user/name changes, also `docker compose down -v` because postgres only initializes the role on a fresh volume.

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
- **Uploaded assets are read through `/api/v1/files/*`, never straight from the bucket.** The proxy is deliberately unauthenticated (a storefront visitor has no session) and safe because keys carry 8 random bytes and the bucket exposes no listing. Responses are `immutable` with a one-year max-age and honour `If-None-Match`, so repeat views cost nothing. Since the bucket is private, gating a prefix later (e.g. `{store_id}/digital/` behind the buyer-OTP session) is a change to that one handler — no re-upload, no URL rewrite.
- **Object storage is behind `storage.Client`, not a concrete type.** `S3Client` (SigV4, hand-rolled, path-style addressing) is the live backend; `SupabaseClient` is legacy; `MultiClient` routes `PathFromPublicURL` across both so pre-migration URLs stay deletable. Handlers depend on the interface, so swapping providers is a wiring change in `server.go`. The signer is pinned to a golden vector captured from the **AWS CLI** signing the same request (`TestSigV4MatchesAWSCLI`) — a signing regression is otherwise invisible until a real upload 403s, so don't touch `sigv4.go` without running it.
- **Storage cleanup on entity delete.** When deleting any DB row with image URLs (products, stores, users), snapshot the URLs BEFORE delete, then fire-and-forget `storage.DeleteObjects(paths)` in a goroutine with `context.Background()` after DB commit. Failure logged but never blocks the user response — orphan files don't break UX. Backend enforces cross-tenant scope via `{store_id}/` path prefix.
- **Bulk-upload runs background via SSE.** `/products/bulk` returns 202 with `{job_id}` immediately, spawns goroutine that publishes `bulk_job.progress|completed|failed` events via `events.Broker`. FE `BulkJobWatcher` (mounted in `DashboardShell`) subscribes via `EventSource` and renders persistent toast in top-right corner across page navigation. Polling endpoint `/jobs/active` kept as fallback.
- **Public SSE-style logging quiet rule.** Logger middleware skips logs for OPTIONS preflight, `*/orders/stream`, `*/bulk/jobs/stream`, `*/health` — they're either noisy without value or fire on long-lived connections.
- **`forceMobile` prop pattern in storefront-catalog.** Tailwind `sm:`/`lg:` responsive classes trigger on viewport (browser width), not container width. Inside the layout-preview dialog's mobile frame (`max-w-sm`), viewport is still desktop — so `sm:grid-cols-3` etc. activate and the preview is wrong. Components in `storefront/storefront-catalog.tsx` accept a `forceMobile` boolean that overrides responsive classes to hard mobile counts. Real storefront page calls without this prop, so its responsive behavior unchanged.
- **Buyer-side endpoints scoped by `{store_slug}/{order_number}` — public (no auth).** Examples: `/storefront/{slug}/orders/{number}/payment-proof`, `/mark-paid`. Guards: order belongs to slug's store + single-shot 409 conflict for proof upload + multipart validated.
- **Admin actions log to `platform_audit_log`, store actions log to `audit_log`.** Different tables, different scopes. Admin views: `/platform/audit`. Seller view: `/settings/activity`. Don't cross-write.
- **Midtrans is production-only (no sandbox).** Sandbox was removed from both the seller integration AND platform billing. The `payments.MidtransClient` always hits production hosts (no `IsSandbox` param). Seller key verification = "Connect" button → backend creates a real Rp 1.000 dummy Snap transaction (`/payments/midtrans/connect`) → frontend opens the Snap.js popup (`lib/load-snap.ts`); popup rendering confirms both server + client key (seller just closes it, no payment). The dormant `is_sandbox`/`*_sandbox` DB columns remain (no migration) but are always written false/ignored. Don't reintroduce sandbox UI/branches.
- **Offline-first POS** — full architecture in the "Offline-first POS" section under Architecture. Invariants to preserve: per-order `idempotency_key` (anti double-charge via the partial UNIQUE index), sync conflict = flag (`needs_review`) not block, cash-only when offline, the service worker is production-only, and the active shift lives under its own IndexedDB key. NEVER `pnpm build` against the dev container — it clobbers `next dev`'s `.next`; use `tsc`/`eslint` to verify.
- **Digital/course delivery** — full architecture in "Digital & course products" under Architecture. Invariants: `fulfillment.OnPaymentPaid` is the ONE mint path (idempotent, fed by webhook + manual mark-paid — don't add a parallel one); buyer email-OTP (`buyer_session`/`RequireBuyer`) is a separate auth path from seller auth and is token-scoped; access "masa aktif" → token `expires_at` set calendar-correctly at mint (`accessExpiry`), enforced as 410 in `resolveToken`; access logged once per OTP verify, not per refresh.
- **Money-path writes are guarded UPDATEs, never read-then-write.** Every transition that
  moves money or inventory re-checks its precondition inside the same statement and reports
  0-rows as "someone else won the race": `SetPaymentStatusGuarded` (webhook), `MarkPaid`,
  `ClaimRefund` (claimed in the DB *before* the Midtrans call, with a deterministic
  refund_key), `CancelIfUnpaid` (lazy expiry on the public order page), `SettleInvoice`
  (`AND status='pending'`), the promo claim inside `OrderRepo.Create`
  (`AND (max_usage=0 OR used_count<max_usage)`), and the OTP attempt counter. The pattern
  exists because each of these previously branched on a snapshot read that a concurrent
  webhook could invalidate.
- **Idempotency keys on both order-create paths.** POS and storefront checkout each accept a
  client-generated `idempotency_key`, backed by the partial unique index on
  `(store_id, idempotency_key)` (migration 0090); a replay returns the original order.
  `download_tokens` has the equivalent unique index on `order_item_id` (0098) so
  `fulfillment.OnPaymentPaid` really is the single, idempotent mint path it claims to be.
- **Cancel/void/return reverse everything the sale did.** Product + variant stock, digital
  kuota, promo `used_count`, loyalty points, customer lifetime counters, AND raw-material
  consumption via `reverseConsumptionTx` (writes compensating `movement_type='restore'` rows,
  migration 0100). Any new "undo a sale" path must call it — consumption reports and COGS net
  `consume` against `restore`.
- **Nothing anonymous is unbounded.** Public endpoints carry per-IP rate limits
  (`middleware.RateLimit`), a body cap, and per-field length/quantity caps. Order numbers use
  8 chars of crypto/rand base32 — the buyer-facing order endpoints are keyed only by
  `{slug}/{number}`, so a short suffix was both an enumeration hole and a collision source.
- **Dates that a seller sees are Asia/Jakarta, not UTC.** Report buckets, quota month
  boundaries, POS shift filters, promo start/expiry, admin grants and every default date
  range parse and bucket in WIB. `date_trunc` and `toISOString().slice(0,10)` in a UTC
  container are both wrong by seven hours, which silently moved the first sales of each day
  into the previous one.
- **Custom-domain edge = Caddy on-demand TLS (NOT nginx).** `scripts/server-setup.sh setup_caddy` installs Caddy (replaced nginx + certbot): automatic HTTPS for the platform domain + `on_demand_tls` for seller custom domains, gated by the public `/api/v1/internal/tls-check` "ask" endpoint (200 only for `domain_status='active'`). Sellers CNAME to `cname.sellon.id` (must be a **terminal A record, DNS-only** in Cloudflare). Platform domain behind Cloudflare proxy needs a **Cloudflare Origin Certificate** at `/etc/caddy/origin/{tls.pem,tls.key}` + CF SSL mode "Full (strict)". `server-setup.sh` is run manually on the host — the deploy pipeline (`deploy.sh`) only ships api/web images.

## Things to Avoid

- Editing the directory name `tokoflow/` — that's the host path, harmless. The brand and module identifier is `sellon`.
- Hard-coding `localhost:3000` in CORS or env — use `WEB_ORIGIN` from config and respect the `WEB_PORT` override.
- Adding `dotenv` libs to either app — both apps read process env directly (viper for Go, `process.env` for Next).
- Touching the postgres volume to "fix" data — for schema changes, write a new numbered migration in `api/internal/db/migrations/NNNN_*.up.sql` (and `.down.sql`); they auto-run on api boot via `embed.FS`.

## Web app deviations from training data

`web/AGENTS.md` (linked from `web/CLAUDE.md`) flags that this repo runs **Next.js 16**, which has API and convention changes vs. older Next.js. When in doubt, read `web/node_modules/next/dist/docs/01-app/` rather than relying on memory. Notable: turbopack is the default dev compiler now (we still pass `--no-turbopack` to `pnpm create next-app` for stability), and Tailwind v4 uses CSS-first `@theme` config (no `tailwind.config.ts`).
