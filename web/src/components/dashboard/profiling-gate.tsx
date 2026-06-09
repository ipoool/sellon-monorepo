"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { showError } from "@/lib/toast";
import { ProfilingForm, type ProfilingResult } from "@/components/onboarding/profiling-form";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Non-skippable profiling dialog for existing sellers who registered before this
// feature (profiling_completed_at IS NULL). Mounted by the dashboard layout only
// for the owner; blocks Escape + backdrop-click and has no close button.
export function ProfilingGate() {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = (e: Event) => e.preventDefault(); // block Escape
    const onClick = (e: MouseEvent) => {
      if (e.target === d) e.preventDefault(); // block backdrop click
    };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, []);

  async function submit(r: ProfilingResult) {
    setSubmitting(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/profiling`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cap_pos: r.caps.pos,
          cap_reseller: r.caps.reseller,
          cap_digital: r.caps.digital,
          cap_materials: r.caps.materials,
          seller_types: r.seller_types,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showError(data.error || "Gagal menyimpan");
        return;
      }
      dialogRef.current?.close();
      router.refresh(); // re-runs the layout → profiling_completed_at set → gate gone
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="profiling-gate-title"
      className="no-scrollbar fixed left-1/2 top-1/2 m-0 max-h-[92vh] w-[min(620px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/60 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col gap-5 p-6">
        <header className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
            <SlidersHorizontal className="size-5" aria-hidden />
          </div>
          <div>
            <h2 id="profiling-gate-title" className="font-display text-lg font-semibold text-neutral-900">
              Atur menu sesuai tokomu
            </h2>
            <p className="mt-0.5 text-sm text-neutral-500">
              Sebentar saja — biar sidebar cuma menampilkan fitur yang kamu pakai.
              Bisa diubah lagi kapan saja di Pengaturan → Tampilan Menu.
            </p>
          </div>
        </header>

        <ProfilingForm submitting={submitting} onSubmit={submit} submitLabel="Simpan & Lanjut" />
      </div>
    </dialog>
  );
}
