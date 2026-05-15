# === Deps ===
FROM node:20-alpine AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile

# === Dev (with hot reload) ===
FROM node:20-alpine AS dev
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
EXPOSE 3000
CMD ["pnpm", "dev"]

# === Builder ===
FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# .env.production wajib ada di build context. Next.js auto-load file
# ini saat `pnpm build` (NODE_ENV=production), nilai NEXT_PUBLIC_* +
# server-side env di-bake ke standalone bundle. Image siap pakai —
# tidak butuh env_file di server. Fail cepat kalau lupa create.
RUN test -f .env.production \
  || (echo "ERROR: web/.env.production tidak ada. Copy dari .env.production.example dan edit dulu." && exit 1)
# Mirror .env.production → .env. Beberapa tooling (dotenv loader bare,
# script CI) baca `.env` default — gandakan biar dua-duanya kebaca.
# Next.js sendiri sudah ambil .env.production duluan jadi tidak konflik.
RUN cp .env.production .env
RUN pnpm build

# === Prod ===
FROM node:20-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
# Next.js standalone default bind ke container hostname (bukan
# all-interfaces) — set 0.0.0.0 supaya request dari host docker proxy
# / nginx upstream bisa masuk. PORT eksplisit juga supaya tidak depend
# environment runtime.
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
