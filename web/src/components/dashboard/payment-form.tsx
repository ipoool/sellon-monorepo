"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Lock,
  Save,
  PlugZap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { GatewayInfo } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const methodOptions = [
  { id: "qris", label: "QRIS" },
  { id: "bank_transfer", label: "Virtual Account / Bank Transfer" },
  { id: "gopay", label: "GoPay" },
  { id: "shopeepay", label: "ShopeePay" },
  { id: "credit_card", label: "Kartu Kredit/Debit" },
];

export function PaymentForm({ initial }: { initial: GatewayInfo | null }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const isConfigured = initial?.is_configured ?? false;
  const lastStatus = initial?.last_verify_status || "";

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setSavedFlash(false);

    const fd = new FormData(e.currentTarget);
    const enabledMethods = methodOptions
      .filter((m) => fd.get(`method_${m.id}`) === "on")
      .map((m) => m.id);

    const body = {
      server_key: String(fd.get("server_key") ?? ""),
      client_key: String(fd.get("client_key") ?? ""),
      is_sandbox: fd.get("is_sandbox") === "on",
      enabled_methods: enabledMethods,
    };

    if (!body.server_key) {
      setError("Server Key wajib diisi");
      setPending(false);
      return;
    }

    try {
      const res = await fetch(`${apiBase}/api/v1/payments/midtrans`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setSavedFlash(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setPending(false);
    }
  }

  async function onVerify() {
    setVerifying(true);
    setVerifyMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/payments/midtrans/verify`, {
        method: "POST",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setVerifyMsg(data.message || "Koneksi OK");
      router.refresh();
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : "Gagal verify");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-semibold text-neutral-900">Midtrans</h2>
              {isConfigured && lastStatus === "ok" && (
                <Badge variant="success">
                  <CheckCircle2 className="size-3" aria-hidden />
                  Terkoneksi
                </Badge>
              )}
              {isConfigured && lastStatus !== "ok" && (
                <Badge variant="warning">
                  <AlertTriangle className="size-3" aria-hidden />
                  Belum diverifikasi
                </Badge>
              )}
              {!isConfigured && <Badge variant="default">Belum dikonfigurasi</Badge>}
            </div>
            <p className="mt-2 text-sm text-neutral-600">
              Pakai akun Midtrans-mu sendiri. Dana hasil penjualan langsung
              masuk ke rekeningmu sesuai jadwal settlement Midtrans —
              kami tidak pernah pegang uang pembeli.
            </p>
          </div>
          <a
            href="https://dashboard.midtrans.com/settings/access_keys"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden text-sm font-medium text-brand-600 hover:text-brand-700 sm:inline-flex sm:items-center sm:gap-1"
          >
            Dapatkan API Key
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </Card>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        <Card>
          <div className="mb-4">
            <h3 className="font-semibold text-neutral-900">API Keys</h3>
            <p className="mt-0.5 text-sm text-neutral-500">
              Server Key disimpan terenkripsi (AES-GCM). Tidak akan ditampilkan
              ulang setelah disimpan — kamu bisa overwrite kapan saja.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="server_key">Server Key (Midtrans)</Label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <Input
                  id="server_key"
                  name="server_key"
                  type="password"
                  required={!isConfigured}
                  placeholder={
                    isConfigured
                      ? initial?.server_key_masked || "•••••••• tersimpan"
                      : "SB-Mid-server-..."
                  }
                  className="pl-9 font-mono text-xs"
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client_key">Client Key (opsional)</Label>
              <Input
                id="client_key"
                name="client_key"
                defaultValue={initial?.client_key ?? ""}
                placeholder="SB-Mid-client-..."
                className="font-mono text-xs"
              />
            </div>

            <label className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
              <input
                type="checkbox"
                name="is_sandbox"
                defaultChecked={initial?.is_sandbox ?? true}
                className="mt-0.5 size-4 rounded border-neutral-300 text-brand-500 focus:ring-brand-500/30"
              />
              <div>
                <p className="font-medium text-neutral-900">Mode Sandbox</p>
                <p className="text-xs text-neutral-600">
                  Aktifkan dulu untuk uji coba pakai akun sandbox Midtrans.
                  Matikan saat siap terima pembayaran asli.
                </p>
              </div>
            </label>
          </div>
        </Card>

        <Card>
          <div className="mb-4">
            <h3 className="font-semibold text-neutral-900">Metode Pembayaran</h3>
            <p className="mt-0.5 text-sm text-neutral-500">
              Pilih metode yang ingin diaktifkan untuk pembeli. Pastikan sudah
              di-enable juga di dashboard Midtrans-mu.
            </p>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {methodOptions.map((m) => (
              <label
                key={m.id}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 p-3 text-sm transition-colors hover:bg-neutral-50"
              >
                <input
                  type="checkbox"
                  name={`method_${m.id}`}
                  defaultChecked={initial?.enabled_methods?.includes(m.id) ?? (m.id === "qris" || m.id === "bank_transfer")}
                  className="size-4 rounded border-neutral-300 text-brand-500 focus:ring-brand-500/30"
                />
                <span className="font-medium text-neutral-900">{m.label}</span>
              </label>
            ))}
          </div>
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            {savedFlash && (
              <span className="font-medium text-success">✓ Konfigurasi tersimpan</span>
            )}
            {error && <span className="font-medium text-danger">{error}</span>}
            {verifyMsg && (
              <span className="font-medium text-neutral-700">{verifyMsg}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isConfigured && (
              <Button
                type="button"
                variant="outline"
                size="md"
                onClick={onVerify}
                disabled={verifying}
              >
                <PlugZap className="size-4" aria-hidden />
                {verifying ? "Menguji…" : "Tes Koneksi"}
              </Button>
            )}
            <Button type="submit" size="md" disabled={pending}>
              <Save className="size-4" aria-hidden />
              {pending ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </div>
      </form>

      <Card variant="ghost">
        <div className="flex items-start gap-3 text-sm text-neutral-600">
          <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
          <p>
            <strong>Catatan keamanan:</strong> Server Key Anda disimpan
            terenkripsi di database (AES-GCM, key derivasi dari secret
            aplikasi). Tim SellOn tidak bisa membaca raw key Anda. Tetap
            rotate key secara berkala lewat Midtrans dashboard.
          </p>
        </div>
      </Card>
    </div>
  );
}
