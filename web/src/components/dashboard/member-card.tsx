"use client";

import { useState, useRef } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Award, IdCard, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/toast";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Props = {
  customerId: string;
  customerName: string;
  initialCode: string;
  tierName?: string;
};

// Member card: a scannable QR of the customer's member_code, printable for a
// physical card. Generates the code on demand if the customer has none.
export function MemberCard({ customerId, customerName, initialCode, tierName }: Props) {
  const [code, setCode] = useState(initialCode);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  const generate = async () => {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/customers/${customerId}/member-code`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        showError("Gagal membuat kartu member");
        return;
      }
      const data = await res.json();
      setCode(data.member_code as string);
    } catch {
      showError("Gagal membuat kartu member");
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    const node = cardRef.current;
    if (!node) return;
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win) return;
    win.document.write(
      `<html><head><title>Kartu Member</title></head><body style="margin:0;display:flex;align-items:center;justify-content:center;font-family:sans-serif">${node.outerHTML}</body></html>`,
    );
    win.document.close();
    win.focus();
    win.print();
  };

  if (!code) {
    return (
      <div className="flex flex-col items-start gap-2">
        <p className="text-sm text-neutral-500">
          Belum punya kartu member. Buat kartu ber-QR untuk identifikasi cepat di kasir.
        </p>
        <Button size="sm" onClick={generate} disabled={busy}>
          <IdCard className="size-4" aria-hidden />
          {busy ? "Membuat..." : "Buat Kartu Member"}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-3">
      <div
        ref={cardRef}
        className="w-64 rounded-xl border border-neutral-200 bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white shadow-card"
      >
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide">
            <Award className="size-3.5" aria-hidden /> Member
          </span>
          {tierName && (
            <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium">
              {tierName}
            </span>
          )}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="rounded-lg bg-white p-2">
            <QRCodeSVG value={code} size={84} />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{customerName}</p>
            <p className="mt-1 font-mono text-base tracking-widest">{code}</p>
          </div>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={print}>
        <Printer className="size-4" aria-hidden />
        Cetak Kartu
      </Button>
    </div>
  );
}
