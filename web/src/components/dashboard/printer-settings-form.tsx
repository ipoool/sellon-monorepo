"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Printer,
  Save,
  Bluetooth,
  Monitor,
  Wifi,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { showError, showSuccess } from "@/lib/toast";
import {
  isBluetoothSupported,
  connectPrinter,
  printTestBluetooth,
  connectedPrinterName,
} from "@/lib/bluetooth-printer";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Config = {
  method: "browser" | "bluetooth" | string;
  paper_width: "58" | "80" | string;
  auto_print: boolean;
  copies: number;
  header: string;
  footer: string;
};

export function PrinterSettingsForm({ initial }: { initial: Config }) {
  const router = useRouter();
  const [method, setMethod] = useState<"browser" | "bluetooth">(
    initial.method === "bluetooth" ? "bluetooth" : "browser",
  );
  const [paperWidth, setPaperWidth] = useState<"58" | "80">(
    initial.paper_width === "80" ? "80" : "58",
  );
  const [autoPrint, setAutoPrint] = useState(initial.auto_print);
  const [copies, setCopies] = useState<number>(initial.copies || 1);
  const [header, setHeader] = useState(initial.header ?? "");
  const [footer, setFooter] = useState(initial.footer ?? "");
  const [saving, setSaving] = useState(false);

  // Bluetooth state (client-only).
  const [btSupported, setBtSupported] = useState(false);
  const [btName, setBtName] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    setBtSupported(isBluetoothSupported());
    setBtName(connectedPrinterName());
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const name = await connectPrinter();
      setBtName(name);
      showSuccess(`Terhubung ke ${name}`);
    } catch (e) {
      // Cancelling the device chooser isn't an error — stay silent.
      if (e instanceof Error && e.name === "CancelledError") return;
      showError(e instanceof Error ? e.message : "Gagal menghubungkan printer");
    } finally {
      setConnecting(false);
    }
  };

  const handleTestPrint = async () => {
    setTesting(true);
    try {
      if (method === "bluetooth") {
        await printTestBluetooth(paperWidth);
        showSuccess("Test print terkirim ke printer");
      } else {
        browserTestPrint(paperWidth, header, footer);
      }
    } catch (e) {
      if (e instanceof Error && e.name === "CancelledError") return;
      showError(e instanceof Error ? e.message : "Gagal test print");
    } finally {
      setTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/pos/printer/config`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          paper_width: paperWidth,
          auto_print: autoPrint,
          copies: Math.max(1, Math.min(5, copies)),
          header: header.trim(),
          footer: footer.trim(),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        showError(err.error || "Gagal menyimpan");
        return;
      }
      showSuccess("Pengaturan printer disimpan");
      router.refresh();
    } catch {
      showError("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
      {/* Metode cetak */}
      <Card>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
          <Printer className="size-4 text-brand-600" aria-hidden />
          Metode Cetak
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          Pilih bagaimana struk dicetak dari mode kasir.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <MethodCard
            active={method === "browser"}
            onClick={() => setMethod("browser")}
            icon={Monitor}
            title="Print Dialog Browser"
            desc="Pakai dialog cetak bawaan. Jalan di semua perangkat termasuk iPad."
          />
          <MethodCard
            active={method === "bluetooth"}
            onClick={() => setMethod("bluetooth")}
            icon={Bluetooth}
            title="Bluetooth Langsung"
            desc="Cetak ke printer thermal ESC/POS tanpa dialog. Hanya Chrome / Android."
          />
        </div>

        {method === "bluetooth" && !btSupported && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <span>
              Browser ini tidak mendukung Web Bluetooth (mis. Safari/iPad). Saat
              transaksi, sistem otomatis fallback ke print dialog browser.
            </span>
          </div>
        )}
      </Card>

      {/* Ukuran kertas + salinan */}
      <Card>
        <h3 className="text-sm font-semibold text-neutral-900">Kertas & Salinan</h3>
        <div className="mt-4 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-medium text-neutral-800">
              Lebar kertas
            </label>
            <div className="inline-flex gap-2">
              {(["58", "80"] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => setPaperWidth(w)}
                  className={
                    "rounded-lg border px-5 py-2 text-sm font-medium transition-colors " +
                    (paperWidth === w
                      ? "border-brand-500 bg-brand-50 text-brand-700"
                      : "border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50")
                  }
                >
                  {w}mm
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <label className="text-sm font-medium text-neutral-800">
                Auto-print setelah transaksi
              </label>
              <p className="text-xs text-neutral-500">
                Struk langsung tercetak begitu pembayaran selesai.
              </p>
            </div>
            <Switch
              checked={autoPrint}
              onChange={(e) => setAutoPrint(e.target.checked)}
            />
          </div>

          <div className="flex items-center justify-between gap-4">
            <label className="text-sm font-medium text-neutral-800">
              Jumlah salinan
            </label>
            <Input
              type="number"
              min={1}
              max={5}
              value={copies}
              onChange={(e) =>
                setCopies(Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 1)))
              }
              className="h-9 w-20 text-center"
            />
          </div>
        </div>
      </Card>

      {/* Header / footer */}
      <Card>
        <h3 className="text-sm font-semibold text-neutral-900">
          Teks Tambahan Struk
        </h3>
        <p className="mt-1 text-sm text-neutral-500">
          Opsional. Muncul di atas (header) dan bawah (footer) struk.
        </p>
        <div className="mt-4 flex flex-col gap-3">
          <div>
            <label className="text-xs font-medium text-neutral-600">
              Header (mis. alamat / promo)
            </label>
            <Input
              value={header}
              maxLength={200}
              onChange={(e) => setHeader(e.target.value)}
              placeholder="Jl. Merdeka No. 1, Jakarta"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-neutral-600">
              Footer (mis. kebijakan retur)
            </label>
            <Input
              value={footer}
              maxLength={200}
              onChange={(e) => setFooter(e.target.value)}
              placeholder="Barang yang sudah dibeli tidak dapat ditukar."
              className="mt-1"
            />
          </div>
        </div>
      </Card>

      {/* Bluetooth koneksi */}
      {method === "bluetooth" && (
        <Card>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
            <Wifi className="size-4 text-brand-600" aria-hidden />
            Koneksi Printer Bluetooth
          </h3>
          <p className="mt-1 text-sm text-neutral-500">
            Pasangkan printer thermal Bluetooth-mu. Karena keamanan browser,
            pemasangan diminta ulang tiap sesi baru.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={handleConnect}
              disabled={!btSupported || connecting}
            >
              <Bluetooth className="size-4" aria-hidden />
              {connecting ? "Menghubungkan…" : "Hubungkan Printer"}
            </Button>
            {btName ? (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                <CheckCircle2 className="size-4" aria-hidden />
                {btName}
              </span>
            ) : (
              <span className="text-sm text-neutral-400">Belum terhubung</span>
            )}
          </div>
        </Card>
      )}

      {/* Actions */}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={saving}>
          <Save className="size-4" aria-hidden />
          {saving ? "Menyimpan…" : "Simpan"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={handleTestPrint}
          disabled={testing}
        >
          <Printer className="size-4" aria-hidden />
          {testing ? "Mengetes…" : "Test Print"}
        </Button>
      </div>
    </form>
  );
}

function MethodCard({
  active,
  onClick,
  icon: Icon,
  title,
  desc,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Monitor;
  title: string;
  desc: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "flex flex-col gap-1.5 rounded-xl border-2 p-4 text-left transition-colors " +
        (active
          ? "border-brand-500 bg-brand-50"
          : "border-neutral-200 bg-white hover:border-neutral-300")
      }
    >
      <Icon
        className={"size-5 " + (active ? "text-brand-600" : "text-neutral-400")}
        aria-hidden
      />
      <span className="text-sm font-semibold text-neutral-900">{title}</span>
      <span className="text-xs leading-relaxed text-neutral-500">{desc}</span>
    </button>
  );
}

// Browser test print: open a minimal sample receipt sized to the paper width
// and trigger the print dialog — verifies paper size + dialog flow.
function browserTestPrint(paperWidth: string, header: string, footer: string) {
  const w = paperWidth === "80" ? "80mm" : "58mm";
  const win = window.open("", "_blank", "width=400,height=600");
  if (!win) return;
  const safe = (s: string) =>
    s.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  win.document.write(`<!doctype html><html><head><meta charset="utf-8">
    <title>Test Print</title>
    <style>
      @page { size: ${w} auto; margin: 0; }
      body { width: ${w}; margin: 0; padding: 4mm; font-family: monospace; font-size: 11px; }
      .c { text-align: center; }
      .b { font-weight: bold; }
      hr { border: none; border-top: 1px dashed #000; margin: 6px 0; }
    </style></head>
    <body>
      <div class="c b" style="font-size:14px;">TEST PRINT</div>
      <div class="c">SellOn Kasir</div>
      ${header ? `<div class="c">${safe(header)}</div>` : ""}
      <hr/>
      <div>Printer dialog berfungsi.</div>
      <div>Lebar kertas: ${w}</div>
      <hr/>
      <div class="c">Siap dipakai!</div>
      ${footer ? `<div class="c">${safe(footer)}</div>` : ""}
    </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => {
    win.print();
  }, 300);
}
