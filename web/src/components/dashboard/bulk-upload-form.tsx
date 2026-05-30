"use client";

import { useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import {
  Download,
  Upload,
  FileSpreadsheet,
  AlertTriangle,
  X,
  Crown,
  Lock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type Props = {
  // Apakah seller sudah berlangganan Pro / Bisnis. Saat false, tombol
  // "Mulai Upload" dikunci dan banner upsell ditampilkan di atas.
  isPaid: boolean;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const MAX_PRODUCTS = 100;
const MAX_BYTES = 8 * 1024 * 1024;

type StartedJob = { job_id: string; total_rows: number };

const columnSpec: { name: string; required: boolean; description: string }[] = [
  { name: "Nama Produk", required: true, description: "Maksimal 200 karakter." },
  {
    name: "URL Slug",
    required: false,
    description:
      "Hanya huruf kecil, angka, tanda hubung. Auto dari nama jika kosong.",
  },
  { name: "Deskripsi", required: false, description: "Boleh panjang. Optional." },
  {
    name: "Harga (Rp)",
    required: true,
    description: "Angka tanpa titik/koma. Contoh: 35000.",
  },
  { name: "Stok", required: true, description: "Bilangan bulat ≥ 0." },
  {
    name: "Status",
    required: false,
    description: "active | inactive | sold_out. Default: active.",
  },
  {
    name: "Berat (gram)",
    required: false,
    description: "Dipakai untuk hitung ongkir. Optional.",
  },
  {
    name: "Panjang/Lebar/Tinggi (cm)",
    required: false,
    description: "Dimensi paket untuk ongkir. Optional.",
  },
  {
    name: "Foto URL 1–5",
    required: false,
    description: "URL gambar (https://...). Maks 5 foto per produk.",
  },
  {
    name: "Varian",
    required: false,
    description:
      "Format: 'Nama:Harga:Stok[:SKU]' tiap entri, dipisah ';'. Contoh: 'S:85000:5;M:85000:10;L:90000:8:KP-L'.",
  },
  {
    name: "GTIN",
    required: false,
    description: "Barcode 8–14 digit. Optional (diabaikan kalau format salah).",
  },
  {
    name: "Kategori",
    required: false,
    description:
      "Nama kategori yang SUDAH ada di toko (case-insensitive). Optional — kalau tak ketemu, produk dibuat tanpa kategori + ada peringatan.",
  },
  {
    name: "Resep",
    required: false,
    description:
      "Untuk auto-kurang stok bahan. Format: 'NamaBahan:Qty' dipisah ';'. Contoh: 'Gula:10;Gelas:1'. Optional.",
  },
];

export function BulkUploadForm({ isPaid }: Props) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  function pickFile(f: File | null) {
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      showError("Format harus .xlsx (Excel). File CSV / numbers belum didukung.");
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      showError("Ukuran file maks 8 MB.");
      setFile(null);
      return;
    }
    setFile(f);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    pickFile(e.dataTransfer.files?.[0] ?? null);
  }

  async function onUpload() {
    if (!file) return;
    if (!isPaid) {
      showError(
        "Upload massal hanya tersedia untuk paket Pro & Bisnis. Upgrade dulu untuk akses fitur ini.",
      );
      return;
    }
    setUploading(true);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch(`${apiBase}/api/v1/products/bulk`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = (await res.json().catch(() => ({}))) as
        | StartedJob
        | { error?: string };
      if (!res.ok) {
        const msg = (data as { error?: string }).error || `HTTP ${res.status}`;
        throw new Error(msg);
      }
      const started = data as StartedJob;
      showSuccess(
        `Upload sedang diproses (${started.total_rows} produk). Kamu bisa pindah halaman — notifikasi progress akan tetap muncul.`,
      );
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      // Arahkan ke list produk supaya user merasakan progres background +
      // notifikasi yang nempel saat pindah halaman.
      router.push("/products");
    } catch (err) {
      showError(err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <>
      {!isPaid && (
        <div className="mb-5 flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/20 text-neutral-800">
            <Crown className="size-5" aria-hidden />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-neutral-900">
              Fitur Pro &amp; Bisnis
            </p>
            <p className="mt-0.5 text-sm text-neutral-700">
              Upload massal sampai 100 produk sekali jalan dari Excel. Tier
              Gratis bisa lihat panduan + download template, tapi proses
              upload-nya khusus paket berbayar.
            </p>
          </div>
          <Link href="/settings/subscription" className="shrink-0">
            <Button size="sm">
              <Crown className="size-4" aria-hidden />
              Upgrade ke Pro
            </Button>
          </Link>
        </div>
      )}
    <div className="grid gap-5 lg:grid-cols-12">
      {/* LEFT: Instructions + Template */}
      <div className="flex flex-col gap-5 lg:col-span-7">
        <Card>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div>
              <h2 className="font-semibold text-neutral-900">Cara Pakai</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Ikuti 3 langkah berikut untuk upload massal produk.
              </p>
            </div>
            <Badge variant="brand" className="w-fit shrink-0">
              Maks. {MAX_PRODUCTS} produk per upload
            </Badge>
          </div>

          <ol className="mt-6 flex flex-col gap-4">
            {[
              {
                title: "Download template Excel",
                body: (
                  <div className="space-y-2">
                    <p>
                      Template berisi 2 sheet: <strong>Produk</strong> (tempat isi data)
                      dan <strong>Petunjuk</strong> (referensi format).
                    </p>
                    <a
                      href={`${apiBase}/api/v1/products/bulk/template`}
                      download
                    >
                      <Button size="sm">
                        <Download className="size-4" aria-hidden />
                        Download Template (.xlsx)
                      </Button>
                    </a>
                  </div>
                ),
              },
              {
                title: "Isi data produk-mu",
                body: (
                  <ul className="list-disc space-y-1 pl-5">
                    <li>Mulai isi dari baris 2 (baris 1 adalah header - jangan diubah).</li>
                    <li>
                      Hapus 2 baris contoh yang sudah ada, atau replace dengan data
                      kamu.
                    </li>
                    <li>
                      Kolom wajib: <strong>Nama Produk</strong>,{" "}
                      <strong>Harga</strong>, <strong>Stok</strong>.
                    </li>
                    <li>
                      Maksimal <strong>{MAX_PRODUCTS} produk</strong> per upload.
                      Lebih dari itu akan ditolak - split jadi beberapa file.
                    </li>
                  </ul>
                ),
              },
              {
                title: "Upload file & cek hasil",
                body: (
                  <p>
                    Drop file ke kolom kanan atau klik untuk pilih file. Setiap
                    baris divalidasi - yang valid langsung tersimpan, yang
                    error akan muncul beserta alasannya. Anda bisa fix di file
                    Excel dan re-upload (slug yang sudah tersimpan tidak akan
                    duplikat).
                  </p>
                ),
              },
            ].map((step, i) => (
              <li key={step.title} className="flex gap-4">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-sm font-semibold text-brand-700">
                  {i + 1}
                </span>
                <div className="flex-1">
                  <p className="font-semibold text-neutral-900">{step.title}</p>
                  <div className="mt-1.5 text-sm text-neutral-600">{step.body}</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card>
          <h2 className="font-semibold text-neutral-900">Format Kolom</h2>
          <p className="mt-1 text-sm text-neutral-600">
            Total {columnSpec.length} kolom. Tanda * berarti wajib.
          </p>

          {/* Mobile: stacked cards (a 2-col table is too cramped on phones). */}
          <ul className="mt-4 flex flex-col gap-2 sm:hidden">
            {columnSpec.map((c) => (
              <li
                key={c.name}
                className="rounded-lg border border-neutral-200 bg-white p-3"
              >
                <p className="text-sm font-semibold text-neutral-900">
                  {c.name}{" "}
                  {c.required && <span className="text-danger">*</span>}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-neutral-600">
                  {c.description}
                </p>
              </li>
            ))}
          </ul>

          {/* sm+ : table */}
          <div className="mt-4 hidden overflow-hidden rounded-lg border border-neutral-200 sm:block">
            <table className="w-full text-left text-sm">
              <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                <tr>
                  <th className="px-4 py-2.5">Kolom</th>
                  <th className="px-4 py-2.5">Format / Catatan</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-200">
                {columnSpec.map((c) => (
                  <tr key={c.name}>
                    <td className="whitespace-nowrap px-4 py-2.5 align-top font-medium text-neutral-900">
                      {c.name} {c.required && <span className="text-danger">*</span>}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{c.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="text-neutral-800">
              <strong>Penting:</strong> Pastikan setiap baris punya{" "}
              <strong>URL Slug</strong> yang unik di toko-mu. Slug yang sudah
              dipakai produk lain akan ditolak. Kosongkan slug supaya
              auto-generate.
            </div>
          </div>
        </Card>
      </div>

      {/* RIGHT: Upload zone + Result */}
      <div className="flex flex-col gap-5 lg:col-span-5">
        <Card>
          <h2 className="font-semibold text-neutral-900">Upload File</h2>

          <div
            role={isPaid ? "button" : undefined}
            tabIndex={isPaid ? 0 : -1}
            aria-disabled={!isPaid}
            onDragOver={(e) => {
              if (!isPaid) return;
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => {
              if (!isPaid) return;
              setDragOver(false);
            }}
            onDrop={(e) => {
              if (!isPaid) {
                e.preventDefault();
                return;
              }
              onDrop(e);
            }}
            onClick={() => {
              if (!isPaid) return;
              fileInputRef.current?.click();
            }}
            onKeyDown={(e) => {
              if (!isPaid) return;
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            title={
              !isPaid
                ? "Upgrade ke Pro untuk akses upload massal"
                : undefined
            }
            className={cn(
              "mt-4 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
              !isPaid
                ? "cursor-not-allowed border-neutral-200 bg-neutral-50 opacity-60"
                : dragOver
                  ? "cursor-pointer border-brand-500 bg-brand-50"
                  : "cursor-pointer border-neutral-300 hover:border-brand-400 hover:bg-neutral-50",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              hidden
              disabled={!isPaid}
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <div
              className={cn(
                "flex size-12 items-center justify-center rounded-full",
                !isPaid
                  ? "bg-neutral-200 text-neutral-500"
                  : "bg-brand-50 text-brand-600",
              )}
            >
              {!isPaid ? (
                <Lock className="size-5" aria-hidden />
              ) : (
                <Upload className="size-5" aria-hidden />
              )}
            </div>
            <div>
              <p className="font-medium text-neutral-900">
                {!isPaid
                  ? "Upload terkunci"
                  : "Drop file Excel di sini"}
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                {!isPaid
                  ? "Upgrade ke Pro / Bisnis untuk membuka upload massal."
                  : "atau klik untuk pilih dari komputer"}
              </p>
            </div>
            <p className="text-xs text-neutral-500">
              .xlsx · maks. 8 MB · maks. {MAX_PRODUCTS} produk
            </p>
          </div>

          {file && (
            <div className="mt-4 flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
                <FileSpreadsheet className="size-5" aria-hidden />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-neutral-900">
                  {file.name}
                </p>
                <p className="text-xs text-neutral-500">
                  {(file.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-200"
                aria-label="Hapus file"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          )}

          
          <div className="mt-4 flex justify-end">
            <Button
              size="md"
              onClick={onUpload}
              disabled={!file || uploading || !isPaid}
              title={
                !isPaid
                  ? "Upgrade ke Pro untuk akses upload massal"
                  : undefined
              }
            >
              {!isPaid ? (
                <Lock className="size-4" aria-hidden />
              ) : (
                <Upload className="size-4" aria-hidden />
              )}
              {uploading
                ? "Mengirim…"
                : !isPaid
                  ? "Khusus Pro / Bisnis"
                  : "Mulai Upload"}
            </Button>
          </div>
          <p className="mt-3 text-xs text-neutral-500">
            {isPaid
              ? "Upload akan jalan di latar belakang. Kamu bebas pindah halaman — notifikasi progress akan terus terlihat di pojok kanan atas sampai selesai."
              : "Tier Gratis bisa lihat panduan + download template, tapi proses upload-nya dikunci. Upgrade ke Pro / Bisnis untuk membuka tombol ini."}
          </p>
        </Card>
      </div>
    </div>
    </>
  );
}
