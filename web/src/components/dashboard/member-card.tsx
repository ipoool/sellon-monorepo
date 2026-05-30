"use client";

import { useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QRCodeSVG } from "qrcode.react";
import { Award, IdCard, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { showError } from "@/lib/toast";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Escape user-supplied text before injecting into the print window's raw HTML.
function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
    // Rebuild the card with inline styles + a fresh QR so it survives the jump
    // to a new window (Tailwind classes don't apply there, and the old
    // outerHTML copy dropped the gradient/QR styling entirely).
    const qr = renderToStaticMarkup(<QRCodeSVG value={code} size={132} />);
    const tier = tierName
      ? `<span class="tier">${escapeHtml(tierName)}</span>`
      : "";
    const win = window.open("", "_blank", "width=420,height=560");
    if (!win) return;
    win.document.write(`<!doctype html><html><head><title>Kartu Member</title>
      <style>
        body{margin:0;font-family:system-ui,-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#fff}
        .card{width:340px;border-radius:16px;padding:20px;color:#fff;background:linear-gradient(135deg,#059669,#065f46)}
        .top{display:flex;align-items:center;justify-content:space-between;font-size:12px;text-transform:uppercase;letter-spacing:.05em;font-weight:600}
        .tier{background:rgba(255,255,255,.2);border-radius:999px;padding:3px 10px;font-size:10px;text-transform:none;letter-spacing:0}
        .row{margin-top:16px;display:flex;align-items:center;gap:14px}
        .qrbox{background:#fff;padding:8px;border-radius:10px;line-height:0}
        .qrbox svg{display:block;width:132px;height:132px}
        .name{font-size:15px;font-weight:600;margin:0}
        .code{font-family:monospace;font-size:18px;letter-spacing:.15em;margin:6px 0 0}
      </style></head>
      <body>
        <div class="card">
          <div class="top"><span>★ Member</span>${tier}</div>
          <div class="row">
            <div class="qrbox">${qr}</div>
            <div>
              <p class="name">${escapeHtml(customerName)}</p>
              <p class="code">${escapeHtml(code)}</p>
            </div>
          </div>
        </div>
      </body></html>`);
    win.document.close();
    win.focus();
    win.onload = () => win.print();
    setTimeout(() => {
      try {
        win.print();
      } catch {
        /* window may already be closed */
      }
    }, 300);
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
      <div className="w-64 rounded-xl border border-neutral-200 bg-gradient-to-br from-brand-600 to-brand-800 p-4 text-white shadow-card">
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
