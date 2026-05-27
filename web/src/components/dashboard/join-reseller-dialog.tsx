"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Store, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showSuccess, showError } from "@/lib/toast";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type ProgramPreview = {
  name: string;
  description: string;
  supplier_name: string;
  product_count: number;
};

export function JoinResellerDialog({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [preview, setPreview] = useState<ProgramPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [joinLoading, setJoinLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  const handleClose = () => {
    setOpen(false);
    setCode("");
    setPreview(null);
    setPreviewError("");
  };

  const handlePreview = async () => {
    if (!code.trim()) return;
    setPreviewLoading(true);
    setPreviewError("");
    setPreview(null);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/reseller/invite/preview?code=${encodeURIComponent(code.trim())}`,
        { credentials: "include" },
      );
      if (res.status === 404) {
        setPreviewError("Kode tidak ditemukan atau sudah tidak aktif.");
        return;
      }
      if (!res.ok) throw new Error();
      const data = await res.json();
      setPreview(data.program);
    } catch {
      setPreviewError("Gagal memverifikasi kode. Coba lagi.");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleJoin = async () => {
    setJoinLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/reseller/join`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invite_code: code.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal bergabung");
        return;
      }
      showSuccess("Berhasil bergabung ke program!");
      handleClose();
      router.refresh();
    } catch {
      showError("Gagal bergabung ke program");
    } finally {
      setJoinLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? "Upgrade ke Pro atau Bisnis untuk menggunakan fitur ini" : undefined}>
        <Plus className="size-4" aria-hidden />
        Gabung Program Baru
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && handleClose()}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-popout">
            <h2 className="font-display text-lg font-semibold text-neutral-900">
              Gabung Program Reseller
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Masukkan kode undangan dari supplier.
            </p>

            <div className="mt-5 flex flex-col gap-4">
              <div className="flex gap-2">
                <Input
                  value={code}
                  onChange={(e) => {
                    setCode(e.target.value.toUpperCase());
                    setPreview(null);
                    setPreviewError("");
                  }}
                  onKeyDown={(e) => e.key === "Enter" && handlePreview()}
                  placeholder="Contoh: SLNABC123"
                  className="font-mono tracking-widest uppercase"
                  autoFocus
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handlePreview}
                  disabled={previewLoading || !code.trim()}
                >
                  <Search className="size-4" aria-hidden />
                  Cek
                </Button>
              </div>

              {previewError && (
                <p className="text-sm text-danger">{previewError}</p>
              )}

              {preview && (
                <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                      <Store className="size-4" aria-hidden />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-neutral-900">{preview.name}</p>
                      <p className="text-sm text-neutral-500">oleh {preview.supplier_name}</p>
                      {preview.description && (
                        <p className="mt-1 text-sm text-neutral-600">{preview.description}</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-1.5 text-sm text-neutral-600">
                        <Package className="size-3.5" aria-hidden />
                        {preview.product_count} produk tersedia
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <p className="text-xs text-neutral-400">
                Kode bisa didapat langsung dari supplier via WhatsApp atau media sosial mereka.
              </p>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleClose} disabled={joinLoading}>
                Batal
              </Button>
              {preview ? (
                <Button onClick={handleJoin} disabled={joinLoading}>
                  {joinLoading ? "Bergabung..." : "Gabung Sekarang"}
                </Button>
              ) : (
                <Button onClick={handlePreview} disabled={previewLoading || !code.trim()}>
                  Cek Kode
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
