# sellon-web

Frontend Next.js 16 (App Router) untuk SellOn — TypeScript + Tailwind CSS v4 + komponen UI handcrafted.

## Run

### Via Docker (rekomendasi)

Dari root repo:

```bash
make dev
```

App di http://localhost:3000.

### Standalone

Butuh Node 20+ dan pnpm (via `corepack enable`):

```bash
cp ../.env.example ../.env
pnpm install
pnpm dev
```

## Struktur

```
web/
├── src/
│   ├── app/
│   │   ├── layout.tsx           Root layout + font loader
│   │   ├── page.tsx             Landing
│   │   ├── globals.css          ⭐ Theme tokens
│   │   ├── (auth)/masuk/        Login placeholder
│   │   └── (dashboard)/dasbor/  Dashboard placeholder
│   ├── components/
│   │   ├── ui/                  Button, Card, Input, Label
│   │   ├── layout/              Container, Header
│   │   └── home/                Hero
│   └── lib/
│       ├── utils.ts             cn() helper
│       └── api.ts               fetch wrapper
├── next.config.ts               output: standalone
├── postcss.config.mjs
└── tailwind config              via @theme in globals.css (Tailwind v4)
```

## How to change theme

Semua warna, font, radius, dan shadow ditentukan dari satu file:

`src/app/globals.css`

### Ganti warna brand

Semua nuansa brand pakai OKLCH dengan hue yang sama. Cari semua `--color-brand-*` dan ubah angka hue (komponen ketiga, contoh `160`):

```css
--color-brand-500: oklch(0.58 0.17 160);  /* ubah 160 jadi hue lain */
```

Hue umum: `25` (orange), `50` (amber), `130` (green), `160` (emerald-teal — default), `230` (info-blue), `250` (royal-blue), `280` (purple), `0` (red).

Find-replace `160` ke `25` di seluruh `--color-brand-*` lalu reload — seluruh tampilan ikut.

### Ganti font

1. Update import di `src/app/layout.tsx`:
   ```tsx
   import { Inter } from "next/font/google";
   const inter = Inter({ subsets: ["latin"], variable: "--font-app-sans" });
   ```
2. Apply variable ke `<html className={inter.variable}>`.
3. Update `--font-sans` di `globals.css`:
   ```css
   --font-sans: var(--font-app-sans), system-ui, sans-serif;
   ```

### Ganti radius / shadow

Edit `--radius-*` dan `--shadow-*` di `globals.css`. Semua komponen ikut otomatis.
