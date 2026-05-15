import { Header } from "@/components/layout/header";
import { Footer } from "@/components/layout/footer";
import { Hero } from "@/components/home/hero";
import { Features } from "@/components/home/features";
import { Pricing } from "@/components/home/pricing";
import { TrustBar } from "@/components/marketing/trust-bar";
import { HowItWorks } from "@/components/marketing/how-it-works";
import { Testimonials } from "@/components/marketing/testimonials";
import { Faq } from "@/components/marketing/faq";
import { CtaBanner } from "@/components/marketing/cta-banner";
import { getMe } from "@/lib/server-auth";
import { publicServerApi } from "@/lib/server-api";
import type { PublicPlan } from "@/lib/types";
import { faqJsonLd, pageMetadata } from "@/lib/seo";

export const metadata = pageMetadata({
  title: "Toko Online untuk Seller WhatsApp — Tanpa Potongan Marketplace",
  description:
    "Bikin katalog online dalam menit. Pembeli pilih produk lewat link, bayar QRIS, dan konfirmasi via WhatsApp - tanpa potongan transaksi. Gratis untuk UMKM Indonesia.",
  path: "/",
});

// FAQ items mirror what's rendered in <Faq /> below — wired here for
// JSON-LD so Google can show rich answers in search.
const landingFaqItems = [
  {
    question: "Apakah SellOn benar-benar gratis?",
    answer:
      "Ya, tier Gratis tidak ada biaya bulanan. Kamu hanya bayar ke Midtrans (jika pakai pembayaran online) sesuai tarif resmi mereka. SellOn tidak memotong uang dari setiap transaksi.",
  },
  {
    question: "Apakah pembeli harus install aplikasi?",
    answer:
      "Tidak. Pembeli buka link katalog di browser HP, pilih produk, lalu konfirmasi via WhatsApp atau bayar online. Tidak perlu install apa pun.",
  },
  {
    question: "Bagaimana dengan rekening pembayaran?",
    answer:
      "Uang dari pembeli langsung masuk ke rekening Midtrans atau bank kamu sendiri. SellOn tidak menahan dana - kamu pegang kontrol penuh.",
  },
  {
    question: "Bisa pakai untuk produk digital?",
    answer:
      "Bisa. Upload file atau link akses, pembeli otomatis dapat link download setelah pembayaran lunas. Tidak perlu kirim manual.",
  },
];

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
      "Domain custom (segera)",
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
  const [me, plansRes] = await Promise.all([
    getMe(),
    publicServerApi<{ plans: PublicPlan[] }>("/api/v1/plans"),
  ]);
  const plans = plansRes?.plans?.length ? plansRes.plans : fallbackPlans;

  return (
    <div className="landing-brand-cycle">
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
        <TrustBar />
        <Features />
        <HowItWorks />
        <Pricing plans={plans} />
        <Testimonials />
        <Faq />
        <CtaBanner />
      </main>
      <Footer />
    </div>
  );
}
