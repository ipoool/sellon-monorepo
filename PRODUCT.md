# PRODUCT.md — SellOn

Durable product truth. Visual decisions live in DESIGN.md; this file does not
describe how anything looks.

## What it is

SellOn is commerce software for Indonesian micro and small businesses (UMKM).
A seller signs up, builds an online store, and takes orders through a link they
share with their own customers — mostly over WhatsApp. The same account also
runs their physical counter: POS, dine-in QR ordering, kitchen display, stock
and raw materials.

Repository directory is `tokoflow/` for historical reasons. The brand and every
code identifier is `sellon` / `SellOn`. Production: https://sellon.id

## Platform

web

## Primary user

An Indonesian UMKM owner, usually operating the business themselves. They are
on a phone most of the day. They already sell — through WhatsApp chat, a
marketplace, or a physical counter — and they are losing time to manual order
taking and losing margin to per-transaction fees.

They are not technical, and they have been burned by tools that demanded setup
before showing value. "Setup 5 menit" is a promise the product has to keep.

## The job

Take orders without retyping them into a chat thread. Know what is in stock.
Get paid into their own account. Serve walk-in and online customers from one
place rather than two systems that disagree.

## What makes it different

**Facilitator model, not a marketplace.** The seller connects their OWN
Midtrans/Xendit account. The platform never touches buyer funds and takes no
per-transaction cut — sellers pay a flat monthly subscription. This is the
central commercial argument and the thing marketplaces structurally cannot
match.

**Online and offline in one account.** The storefront, the POS, the dine-in QR
flow and the kitchen display share one product catalogue and one stock number.
Most competitors do one side or the other.

**It keeps working when the internet does not.** The POS is local-first:
offline sales queue in IndexedDB and sync on reconnect, idempotently, so a
replay never double-charges. For a warung on bad connectivity this is the
difference between selling and not selling.

## Who the home page argues against

Sellers already on Shopee/Tokopedia who are paying a cut on every order and do
not own their customer relationship. The page's primary argument is a store
that is genuinely theirs, with no per-transaction deduction.

Secondary audiences (selling manually over WhatsApp; comparing SaaS tools) are
served by the same argument but are not who the page is tuned for.

## Proof the page may use

**Real, live sellers.** The home page showcases actual stores that have
completed successful transactions, each linking to its real public storefront
so a visitor can click through and see the product working on someone else's
business. This is the proof mechanism the founder chose, and it replaces the
placeholder social proof described below.

Constraints on that showcase:

- Only stores with at least one PAID order, so it never features an empty shell.
- Public storefront data only — store name, slug, logo, category, city. A
  seller's order counts, revenue and customer data are theirs and never appear.
- A seller can be excluded. Their storefront is already public, so linking to
  it exposes nothing new and sends them traffic, but being used as a marketing
  face is a different thing from having a public page.

## Placeholder content that must NOT be treated as fact

Carried over from the current site and explicitly flagged in CLAUDE.md:

- Aggregate statistics: "1.000+ UMKM aktif", "27 provinsi", "4.9/5 rating".
- Testimonial names and quotes (Bu Sari, Andre, Mbak Devi, Pak Bayu, Citra).
- About/roadmap team names and vote counts.

None of these are verified. New work must not restate them as claims. Replace
with the real-store showcase, or with a slot the founder fills in.

## Commercial facts

- Tiers: Gratis, Pro (Rp 99.000/bulan), Bisnis (Rp 299.000/bulan). Prices are
  editable by an admin at runtime; never hard-code them in marketing copy.
- Take-rate is Rp 0 on every tier. This is a load-bearing claim and it is true.
- Bisnis-only: POS, dine-in QR, membership, custom domain, AI cash-flow,
  custom checkout fields, reseller program.
- Payments are production-only Midtrans (no sandbox), plus manual bank transfer
  and static QRIS.

## Durable constraints

- **UI copy is Bahasa Indonesia.** Code identifiers and comments stay English.
- **Outbound email is currently unavailable** — the Mailtrap account that serves
  `sellon.id` is suspended pending an appeal. Sign-in therefore ships
  Google-only by default (`AUTH_EMAIL_PASSWORD_ENABLED=false`). A page may not
  promise email-based flows until that clears.
- Theme is driven by OKLCH `@theme` tokens in `web/src/app/globals.css`; the
  brand hue is one number (145, emerald). No hard-coded colours or shadows.
- Tailwind v4 CSS-first, Next.js 16 App Router, React 19, server-first.
- No new npm dependencies without a clear reason.

## Stack

Existing. Go 1.25 API (chi, pgx, golang-migrate) + Next.js 16 / React 19 /
TypeScript / Tailwind v4, Postgres 16, Redis 7, docker compose. Deployed by
semver tag → GitHub Actions → GHCR → SSH.
