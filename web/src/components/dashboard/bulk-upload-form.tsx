"use client";

import { useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Download,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const MAX_PRODUCTS = 100;
const MAX_BYTES = 8 * 1024 * 1024;

type RowError = { row: number; field: string; message: string };
type BulkResult = {
  total_rows: number;
  succeeded: number;
  failed: number;
  errors: RowError[];
};

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
];

export function BulkUploadForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkResult | null>(null);

  function pickFile(f: File | null) {
    setError(null);
    setResult(null);
    if (!f) {
      setFile(null);
      return;
    }
    if (!f.name.toLowerCase().endsWith(".xlsx")) {
      setError("Format harus .xlsx (Excel). File CSV / numbers belum didukung.");
      setFile(null);
      return;
    }
    if (f.size > MAX_BYTES) {
      setError("Ukuran file maks 8 MB.");
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
    setUploading(true);
    setError(null);
    setResult(null);

    const fd = new FormData();
    fd.append("file", file);

    try {
      const res = await fetch(`${apiBase}/api/v1/products/bulk`, {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setResult(data as BulkResult);
      if ((data as BulkResult).succeeded > 0) router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal upload");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-12">
      {/* LEFT: Instructions + Template */}
      <div className="flex flex-col gap-5 lg:col-span-7">
        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-neutral-900">Cara Pakai</h2>
              <p className="mt-1 text-sm text-neutral-600">
                Ikuti 3 langkah berikut untuk upload massal produk.
              </p>
            </div>
            <Badge variant="brand">Maks. {MAX_PRODUCTS} produk per upload</Badge>
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
                    <li>Mulai isi dari baris 2 (baris 1 adalah header — jangan diubah).</li>
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
                      Lebih dari itu akan ditolak — split jadi beberapa file.
                    </li>
                  </ul>
                ),
              },
              {
                title: "Upload file & cek hasil",
                body: (
                  <p>
                    Drop file ke kolom kanan atau klik untuk pilih file. Setiap
                    baris divalidasi — yang valid langsung tersimpan, yang
                    error akan muncul beserta alasannya. Anda bisa fix di file
                    Excel dan re-upload (slug yang sudah tersimpan tidak akan
                    duplikat).
                  </p>
                ),
              },
            ].map((step, i) => (
              <li key={i} className="flex gap-4">
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

          <div className="mt-4 overflow-hidden rounded-lg border border-neutral-200">
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
                    <td className="whitespace-nowrap px-4 py-2.5 font-medium text-neutral-900">
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
            role="button"
            tabIndex={0}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
            }}
            className={cn(
              "mt-4 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 text-center transition-colors",
              dragOver
                ? "border-brand-500 bg-brand-50"
                : "border-neutral-300 hover:border-brand-400 hover:bg-neutral-50",
            )}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              hidden
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            <div className="flex size-12 items-center justify-center rounded-full bg-brand-50 text-brand-600">
              <Upload className="size-5" aria-hidden />
            </div>
            <div>
              <p className="font-medium text-neutral-900">
                Drop file Excel di sini
              </p>
              <p className="mt-1 text-sm text-neutral-600">
                atau klik untuk pilih dari komputer
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

          {error && (
            <p className="mt-3 text-sm font-medium text-danger">{error}</p>
          )}

          <div className="mt-4 flex justify-end">
            <Button
              size="md"
              onClick={onUpload}
              disabled={!file || uploading}
            >
              <Upload className="size-4" aria-hidden />
              {uploading ? "Memproses…" : "Upload Sekarang"}
            </Button>
          </div>
        </Card>

        {result && (
          <Card variant={result.failed === 0 ? "default" : "default"}>
            <div className="flex items-center gap-3">
              {result.failed === 0 ? (
                <div className="flex size-10 items-center justify-center rounded-full bg-success/10 text-success">
                  <CheckCircle2 className="size-5" aria-hidden />
                </div>
              ) : (
                <div className="flex size-10 items-center justify-center rounded-full bg-warning/15 text-neutral-800">
                  <AlertTriangle className="size-5" aria-hidden />
                </div>
              )}
              <div className="flex-1">
                <p className="font-semibold text-neutral-900">
                  {result.failed === 0
                    ? "Semua produk berhasil di-upload"
                    : `${result.succeeded} berhasil, ${result.failed} gagal`}
                </p>
                <p className="text-sm text-neutral-600">
                  Total {result.total_rows} baris diproses
                </p>
              </div>
            </div>

            {result.errors.length > 0 && (
              <>
                <div className="mt-5 border-t border-neutral-200 pt-4">
                  <p className="text-sm font-semibold text-neutral-900">
                    Detail Error ({result.errors.length})
                  </p>
                  <ul className="mt-3 max-h-72 overflow-y-auto rounded-lg border border-neutral-200">
                    {result.errors.map((e, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-3 border-b border-neutral-200 px-3 py-2.5 text-sm last:border-b-0"
                      >
                        <span className="rounded bg-danger/10 px-1.5 py-0.5 text-xs font-mono font-medium text-danger">
                          Baris {e.row}
                        </span>
                        <div className="flex-1">
                          <p className="font-medium text-neutral-900">{e.field}</p>
                          <p className="mt-0.5 text-xs text-neutral-600">
                            {e.message}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <p className="mt-3 text-xs text-neutral-500">
                  Fix baris-baris di atas di file Excel-mu lalu upload ulang.
                  Produk yang sudah berhasil tidak akan ter-duplikasi.
                </p>
              </>
            )}

            {result.succeeded > 0 && (
              <div className="mt-5 flex justify-end">
                <a href="/dasbor/produk">
                  <Button variant="outline">
                    Lihat di Daftar Produk
                    <ArrowRight className="size-4" aria-hidden />
                  </Button>
                </a>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
