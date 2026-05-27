import Link from "next/link";
import { Container } from "@/components/layout/container";

const COPYRIGHT_YEAR = new Date().getFullYear();

type FooterLink = {
  label: string;
  href?: string;
  external?: boolean;
};

type FooterColumn = {
  title: string;
  links: FooterLink[];
};

const columns: FooterColumn[] = [
  {
    title: "Produk",
    links: [
      { label: "Fitur", href: "/#fitur" },
      { label: "Harga", href: "/#harga" },
      { label: "Cara Kerja", href: "/#cara-kerja" },
      { label: "Roadmap", href: "/roadmap" },
    ],
  },
  {
    title: "Perusahaan",
    links: [
      { label: "Tentang Kami", href: "/about" },
      { label: "Karir" },
      { label: "Blog", href: "/blog" },
      { label: "Press Kit" },
    ],
  },
  {
    title: "Resource",
    links: [
      { label: "Pusat Bantuan", href: "/help" },
      { label: "Panduan UMKM", href: "/guides" },
      { label: "Status Layanan", href: "/status" },
      { label: "API Docs" },
    ],
  },
  {
    title: "Hukum",
    links: [
      { label: "Syarat & Ketentuan", href: "/terms" },
      { label: "Kebijakan Privasi", href: "/privacy" },
      { label: "Kebijakan Cookie", href: "/cookies" },
    ],
  },
];

export function Footer() {
  return (
    <footer className="border-t border-neutral-200 bg-white">
      <Container>
        <div className="grid gap-10 py-14 sm:grid-cols-2 lg:grid-cols-6">
          <div className="lg:col-span-2">
            <Link href="/" aria-label="SellOn — Beranda">
              <img
                src="/sellon-logo.svg"
                alt="SellOn"
                className="h-7 w-auto"
              />
            </Link>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-neutral-600">
              Toko online untuk seller WhatsApp Indonesia. Pembeli pilih
              produk lewat link, bayar online, konfirmasi via WhatsApp -
              tanpa potongan marketplace.
            </p>
            <p className="mt-4 text-xs text-neutral-500">
              Pertanyaan?{" "}
              <a
                href="mailto:halo@sellon.id"
                className="font-medium text-brand-700 hover:text-brand-800"
              >
                halo@sellon.id
              </a>
            </p>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="text-sm font-semibold text-neutral-900">
                {col.title}
              </h3>
              <ul className="mt-4 flex flex-col gap-2.5 text-sm">
                {col.links.map((link) =>
                  link.href ? (
                    <li key={link.label}>
                      <Link
                        href={link.href}
                        className="text-neutral-600 transition-colors hover:text-neutral-900"
                      >
                        {link.label}
                      </Link>
                    </li>
                  ) : (
                    <li
                      key={link.label}
                      className="cursor-not-allowed text-neutral-500"
                      title="Akan segera hadir"
                    >
                      {link.label}
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3 border-t border-neutral-200 py-6 text-sm text-neutral-500 sm:flex-row sm:items-center sm:justify-between">
          <p>© {COPYRIGHT_YEAR} SellOn Indonesia. Semua hak dilindungi.</p>
          <p className="flex items-center gap-1.5">
            <span aria-hidden>🇮🇩</span>
            <span>Dibuat di Indonesia untuk UMKM Indonesia.</span>
          </p>
        </div>
      </Container>
    </footer>
  );
}
