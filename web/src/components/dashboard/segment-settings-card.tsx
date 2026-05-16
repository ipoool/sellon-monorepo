"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Crown, Save, Lock, Settings2, X } from "lucide-react";
import { showError, showSuccess } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { usePlan } from "@/components/dashboard/plan-context";
import Link from "next/link";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  initialVip: number;
  initialLoyal: number;
  initialBaruName: string;
  initialRegulerName: string;
  initialLoyalName: string;
  initialVipName: string;
};

export function SegmentSettingsButton({
  initialVip, initialLoyal,
  initialBaruName, initialRegulerName, initialLoyalName, initialVipName,
}: Props) {
  const { refresh } = useRouter();
  const plan = usePlan();
  const isPaid = plan === "pro" || plan === "bisnis";

  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);

  const [vip, setVip] = useState(String(initialVip));
  const [loyal, setLoyal] = useState(String(initialLoyal));
  const [baruName, setBaruName] = useState(initialBaruName);
  const [regulerName, setRegulerName] = useState(initialRegulerName);
  const [loyalName, setLoyalName] = useState(initialLoyalName);
  const [vipName, setVipName] = useState(initialVipName);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onClick = (e: MouseEvent) => { if (e.target === d) setOpen(false); };
    const onCancel = () => setOpen(false);
    d.addEventListener("click", onClick);
    d.addEventListener("cancel", onCancel);
    return () => {
      d.removeEventListener("click", onClick);
      d.removeEventListener("cancel", onCancel);
    };
  }, []);

  async function save() {
    const vipNum = parseInt(vip, 10);
    const loyalNum = parseInt(loyal, 10);
    if (!vipNum || !loyalNum || vipNum < 1 || loyalNum < 1) {
      showError("Threshold harus angka minimal 1.");
      return;
    }
    if (loyalNum >= vipNum) {
      showError(`Threshold ${loyalName || "Loyal"} harus lebih kecil dari ${vipName || "VIP"}.`);
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/segments`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vip_threshold: vipNum,
          loyal_threshold: loyalNum,
          baru_name: baruName.trim() || "Baru",
          reguler_name: regulerName.trim() || "Reguler",
          loyal_name: loyalName.trim() || "Loyal",
          vip_name: vipName.trim() || "VIP",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      showSuccess("Pengaturan segmen disimpan.");
      setOpen(false);
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  }

  const loyalNum = parseInt(loyal || "3", 10);
  const vipNum = parseInt(vip || "10", 10);

  const levels = [
    { name: baruName || "Baru",     desc: "0 order",                         color: "bg-neutral-100 text-neutral-600" },
    { name: regulerName || "Reguler", desc: `1–${Math.max(1, loyalNum - 1)} order`, color: "bg-neutral-100 text-neutral-600" },
    { name: loyalName || "Loyal",   desc: `≥${loyalNum} order`,              color: "bg-success/10 text-success" },
    { name: vipName || "VIP",       desc: `≥${vipNum} order`,                color: "bg-brand-50 text-brand-700" },
  ];

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Settings2 className="size-4" aria-hidden />
        Segmen
      </Button>

      <dialog
        ref={dialogRef}
        aria-labelledby="seg-dialog-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(600px,95vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 text-left shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-6 py-4">
          <div>
            <h2 id="seg-dialog-title" className="font-display text-base font-semibold text-neutral-900">
              Pengaturan Segmen
            </h2>
            <p className="text-xs text-neutral-500">
              Atur nama dan batas minimal order untuk setiap level segmen pelanggan.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Tutup"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          {/* Preview */}
          <div className="mb-6 grid grid-cols-4 gap-2 text-center text-xs">
            {levels.map((l) => (
              <div key={l.name} className={`rounded-lg px-2 py-2.5 ${l.color}`}>
                <p className="font-semibold">{l.name}</p>
                <p className="mt-0.5 opacity-75">{l.desc}</p>
              </div>
            ))}
          </div>

          {/* Nama segmen */}
          <div className="mb-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Nama Segmen</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { id: "seg_name_baru",    label: "Baru",    value: baruName,    set: setBaruName },
                { id: "seg_name_reguler", label: "Reguler", value: regulerName, set: setRegulerName },
                { id: "seg_name_loyal",   label: "Loyal",   value: loyalName,   set: setLoyalName },
                { id: "seg_name_vip",     label: "VIP",     value: vipName,     set: setVipName },
              ].map((f) => (
                <div key={f.id} className="flex flex-col gap-1.5">
                  <Label htmlFor={f.id} className="text-xs text-neutral-500">{f.label}</Label>
                  <Input
                    id={f.id}
                    value={f.value}
                    maxLength={20}
                    onChange={(e) => f.set(e.target.value)}
                    disabled={!isPaid}
                    className={!isPaid ? "opacity-60" : ""}
                    placeholder={f.label}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Threshold */}
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Minimal Order</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="seg_loyal" className="text-xs">
                  {loyalName || "Loyal"} — minimal order
                </Label>
                <Input
                  id="seg_loyal"
                  type="number"
                  min={1}
                  value={loyal}
                  onChange={(e) => setLoyal(e.target.value)}
                  disabled={!isPaid}
                  className={!isPaid ? "opacity-60" : ""}
                />
                <p className="text-xs text-neutral-400">Saat ini ≥ {initialLoyal} order</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="seg_vip" className="text-xs">
                  {vipName || "VIP"} — minimal order
                </Label>
                <Input
                  id="seg_vip"
                  type="number"
                  min={2}
                  value={vip}
                  onChange={(e) => setVip(e.target.value)}
                  disabled={!isPaid}
                  className={!isPaid ? "opacity-60" : ""}
                />
                <p className="text-xs text-neutral-400">Saat ini ≥ {initialVip} order</p>
              </div>
            </div>
          </div>

          {!isPaid && (
            <div className="mt-5 flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning/5 px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-neutral-700">
                <Lock className="size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  Kustomisasi segmen hanya untuk <strong>Pro</strong> &{" "}
                  <strong>Bisnis</strong>.
                </span>
              </div>
              <Link href="/settings/subscription" onClick={() => setOpen(false)}>
                <Button size="sm" variant="outline" className="shrink-0 border-warning/40 text-warning hover:bg-warning/10">
                  <Crown className="size-3.5" aria-hidden />
                  Upgrade
                </Button>
              </Link>
            </div>
          )}
        </div>

        {/* Footer */}
        {isPaid && (
          <div className="flex justify-end gap-2 border-t border-neutral-200 bg-neutral-50 px-6 py-3">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Batal
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              <Save className="size-4" aria-hidden />
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        )}
      </dialog>
    </>
  );
}
