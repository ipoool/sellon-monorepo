"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  Store as StoreIcon,
  MapPin,
  Sparkles,
  PartyPopper,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const categories = [
  "Makanan & Minuman",
  "Fashion",
  "Kecantikan",
  "Kerajinan Tangan",
  "Elektronik",
  "Rumah Tangga",
  "Buku & Stationery",
  "Hobi & Mainan",
  "Lainnya",
];

type FormState = {
  name: string;
  slug: string;
  category: string;
  city: string;
  whatsapp: string;
  instagram: string;
  tiktok: string;
};

const initialState: FormState = {
  name: "",
  slug: "",
  category: "",
  city: "",
  whatsapp: "",
  instagram: "",
  tiktok: "",
};

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

const steps = [
  { id: 1, title: "Identitas Toko", icon: StoreIcon },
  { id: 2, title: "Kontak & Lokasi", icon: MapPin },
  { id: 3, title: "Review & Buat", icon: Sparkles },
];

export function SetupWizard({
  firstName,
  email,
}: {
  firstName: string;
  email: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(initialState);
  // User can manually edit slug; if they haven't, we keep it auto-derived.
  const [slugTouched, setSlugTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const autoSlug = useMemo(() => slugify(form.name), [form.name]);
  const effectiveSlug = slugTouched ? form.slug : autoSlug;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  // --- Step validation ---
  const step1Valid = form.name.trim().length >= 2 && effectiveSlug.length >= 3;
  const step2Valid = true; // contact info all optional

  function handleNext(e?: FormEvent) {
    e?.preventDefault();
    setError(null);
    if (step === 1) {
      if (!step1Valid) {
        setError("Nama minimal 2 karakter dan slug minimal 3 karakter.");
        return;
      }
      // Lock the auto-slug if user never edited
      if (!slugTouched) update("slug", autoSlug);
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      // 1. Create the store
      const slug = (slugTouched ? form.slug : autoSlug).trim();
      const createRes = await fetch(`${apiBase}/api/v1/store`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          slug,
          category: form.category,
          city: form.city,
        }),
      });
      const createData = await createRes.json().catch(() => ({}));
      if (!createRes.ok) {
        throw new Error(
          createData.error ||
            "Gagal membuat toko (slug mungkin sudah dipakai toko lain)",
        );
      }

      // 2. If user filled WA / IG / TT, save those via PUT (CREATE doesn't take them)
      if (
        form.whatsapp ||
        form.instagram ||
        form.tiktok
      ) {
        await fetch(`${apiBase}/api/v1/store`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            description: "",
            logo_url: "",
            category: form.category,
            city: form.city,
            whatsapp_number: form.whatsapp,
            instagram: form.instagram,
            tiktok: form.tiktok,
            is_open: true,
          }),
        });
      }

      setDone(true);
      // Brief celebration screen, then redirect.
      setTimeout(() => {
        router.push("/dasbor");
        router.refresh();
      }, 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal membuat toko");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex min-h-svh items-center justify-center px-4 py-12">
        <div className="text-center">
          <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-success/15 text-success">
            <PartyPopper className="size-10" aria-hidden />
          </div>
          <h1 className="mt-6 font-display text-3xl font-semibold tracking-tight text-neutral-900">
            Toko-mu sudah jadi! 🎉
          </h1>
          <p className="mt-2 text-neutral-600">
            Mengarahkan ke dasbor…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-svh items-center justify-center px-4 py-10">
      <div className="w-full max-w-2xl">
        {/* Brand + greeting */}
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="font-display text-2xl font-semibold text-neutral-900"
          >
            SellOn
          </Link>
          <p className="mt-3 font-display text-2xl font-semibold tracking-tight text-neutral-900 sm:text-3xl">
            Halo, {firstName}! 👋
          </p>
          <p className="mt-1 text-sm text-neutral-600">
            Setup toko-mu dalam 3 langkah cepat. Bisa diubah kapan saja nanti.
          </p>
        </div>

        {/* Stepper */}
        <ol className="mx-auto mb-8 flex max-w-md items-center">
          {steps.map((s, i) => {
            const isPast = step > s.id;
            const isCurrent = step === s.id;
            return (
              <li
                key={s.id}
                className="flex flex-1 items-center last:flex-none"
              >
                <div className="flex flex-col items-center gap-2">
                  <div
                    className={cn(
                      "flex size-9 items-center justify-center rounded-full transition-colors",
                      isPast
                        ? "bg-success text-white"
                        : isCurrent
                          ? "bg-brand-500 text-white"
                          : "bg-neutral-200 text-neutral-500",
                    )}
                  >
                    {isPast ? (
                      <Check className="size-4" aria-hidden />
                    ) : (
                      <s.icon className="size-4" aria-hidden />
                    )}
                  </div>
                  <span
                    className={cn(
                      "hidden text-xs font-medium sm:block",
                      isCurrent ? "text-neutral-900" : "text-neutral-500",
                    )}
                  >
                    {s.title}
                  </span>
                </div>
                {i < steps.length - 1 && (
                  <span
                    className={cn(
                      "mx-2 -mt-5 h-0.5 flex-1 transition-colors sm:mt-0",
                      step > s.id ? "bg-success" : "bg-neutral-200",
                    )}
                  />
                )}
              </li>
            );
          })}
        </ol>

        {/* Card */}
        <Card>
          {step === 1 && (
            <form onSubmit={handleNext} className="flex flex-col gap-5">
              <div>
                <h2 className="font-display text-xl font-semibold text-neutral-900">
                  Identitas toko-mu
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Nama yang akan dilihat pembeli + URL toko publik-mu.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="name">
                  Nama Toko <span className="text-danger">*</span>
                </Label>
                <Input
                  id="name"
                  required
                  autoFocus
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  placeholder="Warung Bu Sari"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="slug">
                  URL Toko <span className="text-danger">*</span>
                </Label>
                <div className="flex items-stretch">
                  <span className="inline-flex items-center rounded-l-lg border border-r-0 border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-500">
                    sellon.id/
                  </span>
                  <Input
                    id="slug"
                    required
                    value={effectiveSlug}
                    onChange={(e) => {
                      setSlugTouched(true);
                      update("slug", slugify(e.target.value));
                    }}
                    placeholder="warung-bu-sari"
                    className="rounded-l-none"
                  />
                </div>
                <p className="text-xs text-neutral-500">
                  Otomatis dari nama. Boleh diubah, tapi nanti tidak bisa diganti
                  setelah toko dibuat.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="category">Kategori Usaha</Label>
                <Select
                  id="category"
                  value={form.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  <option value="">— Pilih kategori —</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>

              {error && (
                <p className="text-sm font-medium text-danger">{error}</p>
              )}

              <div className="mt-2 flex justify-end">
                <Button type="submit" size="md" disabled={!step1Valid}>
                  Lanjut
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleNext} className="flex flex-col gap-5">
              <div>
                <h2 className="font-display text-xl font-semibold text-neutral-900">
                  Kontak & lokasi
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Bantu pembeli mengenal toko-mu. Semua field di sini opsional —
                  bisa diisi nanti.
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="city">Kota</Label>
                  <Input
                    id="city"
                    value={form.city}
                    onChange={(e) => update("city", e.target.value)}
                    placeholder="Yogyakarta"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="whatsapp">Nomor WhatsApp</Label>
                  <Input
                    id="whatsapp"
                    type="tel"
                    value={form.whatsapp}
                    onChange={(e) => update("whatsapp", e.target.value)}
                    placeholder="0812-3456-7890"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="instagram">Instagram</Label>
                  <Input
                    id="instagram"
                    value={form.instagram}
                    onChange={(e) => update("instagram", e.target.value)}
                    placeholder="@warung_bu_sari"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="tiktok">TikTok</Label>
                  <Input
                    id="tiktok"
                    value={form.tiktok}
                    onChange={(e) => update("tiktok", e.target.value)}
                    placeholder="@warungbusari"
                  />
                </div>
              </div>

              {error && (
                <p className="text-sm font-medium text-danger">{error}</p>
              )}

              <div className="mt-2 flex items-center justify-between">
                <Button
                  type="button"
                  size="md"
                  variant="ghost"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Kembali
                </Button>
                <Button type="submit" size="md" disabled={!step2Valid}>
                  Lanjut
                  <ArrowRight className="size-4" aria-hidden />
                </Button>
              </div>
            </form>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-5">
              <div>
                <h2 className="font-display text-xl font-semibold text-neutral-900">
                  Review terakhir
                </h2>
                <p className="mt-1 text-sm text-neutral-600">
                  Cek dulu — kalau sudah pas, klik &ldquo;Buat Toko&rdquo;. Kamu bisa
                  edit detail apapun setelah masuk dasbor.
                </p>
              </div>

              <dl className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
                <Row label="Nama Toko" value={form.name} required />
                <Row
                  label="URL Toko"
                  value={`sellon.id/${effectiveSlug}`}
                  required
                />
                <Row label="Kategori" value={form.category} />
                <Row label="Kota" value={form.city} />
                <Row label="WhatsApp" value={form.whatsapp} />
                <Row label="Instagram" value={form.instagram} />
                <Row label="TikTok" value={form.tiktok} />
              </dl>

              <div className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm text-neutral-800">
                <p className="font-medium text-brand-700">Yang akan terjadi:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-neutral-700">
                  <li>Toko langsung live di sellon.id/{effectiveSlug}</li>
                  <li>Kamu akan masuk ke dasbor untuk mulai tambah produk</li>
                  <li>Setup pembayaran (Midtrans / rekening manual) bisa nanti</li>
                </ul>
              </div>

              {error && (
                <p className="text-sm font-medium text-danger">{error}</p>
              )}

              <div className="mt-2 flex items-center justify-between">
                <Button
                  type="button"
                  size="md"
                  variant="ghost"
                  onClick={() => setStep(2)}
                  disabled={submitting}
                >
                  <ArrowLeft className="size-4" aria-hidden />
                  Kembali
                </Button>
                <Button
                  type="button"
                  size="md"
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? (
                    "Membuat toko…"
                  ) : (
                    <>
                      <Sparkles className="size-4" aria-hidden />
                      Buat Toko
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <p className="mt-6 text-center text-xs text-neutral-500">
          Login sebagai{" "}
          <Badge variant="outline" className="font-mono">
            {email}
          </Badge>
        </p>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  required,
}: {
  label: string;
  value: string;
  required?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-xs font-medium uppercase tracking-wider text-neutral-500">
        {label}
        {required && <span className="ml-1 text-danger">*</span>}
      </dt>
      <dd
        className={cn(
          "text-right text-sm",
          value ? "font-medium text-neutral-900" : "text-neutral-400",
        )}
      >
        {value || "—"}
      </dd>
    </div>
  );
}
