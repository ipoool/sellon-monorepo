import { UserPlus, ImagePlus, Send } from "lucide-react";
import { Section } from "@/components/layout/section";
import { Container } from "@/components/layout/container";

const steps = [
  {
    icon: UserPlus,
    title: "Daftar dalam 1 menit",
    description:
      "Login dengan Google, akun langsung jadi. Tidak perlu isi formulir panjang.",
  },
  {
    icon: ImagePlus,
    title: "Bikin katalog",
    description:
      "Upload foto produk, atur harga, dan dapatkan link katalog WhatsApp untuk dibagikan.",
  },
  {
    icon: Send,
    title: "Terima pesanan",
    description:
      "Pembeli klik link, bayar via QRIS, dana langsung masuk ke rekeningmu. Selesai.",
  },
];

export function HowItWorks() {
  return (
    <Section id="cara-kerja" bg="alt">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-medium text-brand-600">Cara Kerja</p>
          <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight text-neutral-900 sm:text-4xl">
            Dari nol ke jualan online dalam 5 menit
          </h2>
          <p className="mt-4 text-lg text-neutral-600">
            Tiga langkah, tanpa proses panjang. Cocok untuk yang baru pertama
            kali jualan online.
          </p>
        </div>

        <ol className="mt-14 grid gap-6 lg:grid-cols-3">
          {steps.map(({ icon: Icon, title, description }, i) => (
            <li
              key={title}
              className="relative flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-6 shadow-card"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-8 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                  {i + 1}
                </span>
                <div className="flex size-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                  <Icon className="size-5" strokeWidth={2} aria-hidden />
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-neutral-600">
                  {description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
