import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";
import { BRAND, SITE_URL, organizationJsonLd, websiteJsonLd } from "@/lib/seo";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta-sans",
  display: "swap",
});

// Site-wide metadata defaults. Per-page metadata overrides title +
// description, and the title template here gives every child page a
// consistent " — SellOn" suffix without each page repeating the brand.
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "SellOn — Toko Online untuk Seller WhatsApp, Tanpa Potongan Marketplace",
    template: "%s — SellOn",
  },
  description: BRAND.description,
  applicationName: BRAND.name,
  authors: [{ name: BRAND.legalName, url: SITE_URL }],
  generator: "Next.js",
  keywords: [
    "jualan whatsapp",
    "katalog whatsapp",
    "toko online umkm",
    "umkm indonesia",
    "platform jualan",
    "midtrans qris",
    "sellon",
  ],
  referrer: "origin-when-cross-origin",
  alternates: { canonical: SITE_URL },
  icons: {
    // app/icon.svg auto-served oleh Next App Router di /icon.svg.
    // SVG saja — favicon.ico lama dihapus supaya tidak ada konflik
    // dengan browser cache.
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png" }],
  },
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: BRAND.name,
    locale: BRAND.locale,
    title: "SellOn — Toko Online untuk Seller WhatsApp, Tanpa Potongan Marketplace",
    description: BRAND.description,
    images: [
      {
        url: "/og-default.png",
        width: 1200,
        height: 630,
        alt: BRAND.name,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: BRAND.twitter,
    creator: BRAND.twitter,
    title: "SellOn — Toko Online untuk Seller WhatsApp, Tanpa Potongan Marketplace",
    description: BRAND.description,
    images: ["/og-default.png"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
  colorScheme: "light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={plusJakarta.variable}>
      <head>
        {/* Organization + WebSite structured data — surfaces brand in
            Google Knowledge Graph and enables sitelinks search box. */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationJsonLd()),
          }}
        />
        <script
          type="application/ld+json"
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteJsonLd()),
          }}
        />
      </head>
      {/* suppressHydrationWarning here is for browser extensions that
          stamp attributes on <body> after SSR (ColorZilla adds
          cz-shortcut-listen, Grammarly adds data-new-gr-c-s-check-loaded,
          etc.). Mismatches on these attributes are harmless — without
          this, every dev session sees a noisy hydration warning. */}
      <body suppressHydrationWarning>
        {children}
        {/* Global toast container — semua showError/showSuccess dari
            @/lib/toast muncul di sini. Top-right desktop, top-center
            mobile (auto-stack). richColors → visual brand-aligned. */}
        <Toaster
          position="top-right"
          richColors
          closeButton
          expand
          duration={4500}
        />
      </body>
    </html>
  );
}
