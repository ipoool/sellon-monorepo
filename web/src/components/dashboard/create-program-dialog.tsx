"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { showError } from "@/lib/toast";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export function CreateProgramDialog({ disabled = false }: { disabled?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/reseller/programs`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });
      if (res.status === 402) {
        showError("Fitur ini hanya tersedia untuk plan Pro dan Bisnis.");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal membuat program");
        return;
      }
      setOpen(false);
      setName("");
      setDescription("");
      router.refresh();
    } catch {
      showError("Gagal membuat program");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled} title={disabled ? "Upgrade ke Pro atau Bisnis untuk menggunakan fitur ini" : undefined}>
        <Plus className="size-4" aria-hidden />
        Buat Program
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-popout">
            <h2 className="font-display text-lg font-semibold text-neutral-900">
              Buat Program Reseller
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Kode undangan akan digenerate otomatis setelah disimpan.
            </p>

            <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="prog-name" className="text-sm font-medium text-neutral-700">
                  Nama Program <span className="text-danger">*</span>
                </label>
                <Input
                  id="prog-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Contoh: Program Reseller Reguler"
                  autoFocus
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="prog-desc" className="text-sm font-medium text-neutral-700">
                  Deskripsi{" "}
                  <span className="text-xs font-normal text-neutral-400">(opsional)</span>
                </label>
                <textarea
                  id="prog-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jelaskan program ini kepada calon reseller..."
                  rows={3}
                  className="w-full resize-none rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={loading}
                >
                  Batal
                </Button>
                <Button type="submit" disabled={loading || !name.trim()}>
                  {loading ? "Menyimpan..." : "Buat Program"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
