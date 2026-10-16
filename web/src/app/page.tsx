import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/home/hero";
import { Pricing } from "@/components/home/pricing";
import { StoreShowcase, type ShowcaseStore } from "@/components/home/store-showcase";
import { Highlights } from "@/components/home/highlights";
import { FeatureExplorer } from "@/components/home/feature-explorer";
import { MobileApp } from "@/components/home/mobile-app";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Faq, FAQ_ITEMS } from "@/components/marketing/faq";
import { CtaBanner } from "@/components/marketing/cta-banner";
import { BlogPreview } from "@/components/marketing/blog-preview";
import { getMe } from "@/lib/server-auth";
import { publicServerApi } from "@/lib/server-api";
import type { PublicPlan } from "@/lib/types";
import { faqJsonLd, pageMetadata } from "@/lib/seo";

// The brand is spelled out here rather than left to the root layout's
// title.template: per Next's metadata rules the template applies to CHILD
// route segments only, never to a page.js in the segment where it is defined.
// So the landing page — the one title most likely to be seen in search — was
// rendering with no brand in it at all.
export const metadata = pageMetadata({
  title: "SellOn — Platform Jualan Online & Offline All-in-One untuk UMKM",
  description:
    "Satu aplikasi untuk seluruh tokomu: jualan online (link katalog + checkout), kasir POS, QR meja & dapur (KDS), stok & bahan baku, membership pelanggan, sampai pembayaran QRIS/Midtrans — tanpa potongan per transaksi. Gratis untuk UMKM Indonesia.",
  path: "/",
});

// The first six questions <Faq /> renders, as JSON-LD so Google can show rich
// answers in search. Read from the component's own array so the structured
// data can never drift from the copy on the page.
const landingFaqItems = FAQ_ITEMS.slice(0, 6).map(({ q, a }) => ({
  question: q,
  answer: a,
}));

// Hardcoded fallback so the landing page still renders if the API is
// unreachable during SSR. Mirrors the seed values in migration 0018.
const fallbackPlans: PublicPlan[] = [
  {
    tier: "free",
    name: "Gratis",
    monthly_price_cents: 0,
    yearly_price_cents: 0,
    currency: "IDR",
    sort_order: 0,
    product_limit: 30,
    staff_limit: 1,
    order_monthly_limit: 50,
    promo_limit: -1,
    description:
      "Cukup untuk warung dan toko kecil yang baru mulai online.",
    features: ["Pembayaran QRIS, transfer, e-wallet", "Laporan dasar"],
    cta_label: "Mulai Gratis",
    period_monthly_label: "selamanya",
    period_yearly_label: "selamanya",
    highlighted: false,
    updated_at: "",
  },
  {
    tier: "pro",
    name: "Pro",
    monthly_price_cents: 99_000_00,
    yearly_price_cents: 79_000_00,
    currency: "IDR",
    sort_order: 1,
    product_limit: -1,
    staff_limit: 5,
    order_monthly_limit: -1,
    promo_limit: -1,
    description: "Untuk toko yang sudah punya pelanggan tetap.",
    features: [
      "Template pesan WhatsApp",
      "Integrasi kurir & ongkir otomatis",
      "Laporan lengkap & export CSV",
    ],
    cta_label: "Pilih Pro",
    period_monthly_label: "/ bulan",
    period_yearly_label: "/ bulan, ditagih tahunan",
    highlighted: true,
    updated_at: "",
  },
  {
    tier: "bisnis",
    name: "Bisnis",
    monthly_price_cents: 299_000_00,
    yearly_price_cents: 239_000_00,
    currency: "IDR",
    sort_order: 2,
    product_limit: -1,
    staff_limit: -1,
    order_monthly_limit: -1,
    promo_limit: -1,
    description: "Untuk brand yang sudah jalan dan butuh banyak admin.",
    features: [
      "Semua fitur Pro",
      "Tema toko custom (warna brand)",
      "Analisa AI (tren penjualan & saran stok)",
      "Support via email & WhatsApp",
    ],
    cta_label: "Pilih Bisnis",
    period_monthly_label: "/ bulan",
    period_yearly_label: "/ bulan, ditagih tahunan",
    highlighted: false,
    updated_at: "",
  },
];

export default async function Home() {
  const [me, plansRes, showcaseRes] = await Promise.all([
    getMe(),
    publicServerApi<{ plans: PublicPlan[] }>("/api/v1/plans"),
    publicServerApi<{ stores: ShowcaseStore[] }>(
      "/api/v1/storefront/showcase?limit=4",
    ),
  ]);
  const plans = plansRes?.plans?.length ? plansRes.plans : fallbackPlans;
  // No fallback here on purpose: an unreachable API hides the proof section
  // rather than inventing stores to fill it.
  const showcase = showcaseRes?.stores ?? [];

  return (
    <div>
      <script
        type="application/ld+json"
        // eslint-disable-next-line react/no-danger
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(faqJsonLd(landingFaqItems)),
        }}
      />
      <Header me={me} />
      <main>
        <Hero />
        {/* Real stores, not testimonials: every card links to a live
            storefront the visitor can check. See PRODUCT.md on why the old
            invented statistics and quotes are gone. */}
        <StoreShowcase stores={showcase} />
        <Highlights />
        <FeatureExplorer />
        <MobileApp />
        <HowItWorks />
        <Pricing plans={plans} />
        <Faq />
        <BlogPreview />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}
