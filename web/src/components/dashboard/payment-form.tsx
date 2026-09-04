"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { useRouter } from "next/navigation";
import {
  Lock,
  Save,
  PlugZap,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  Copy,
  Check,
  RefreshCw,
  Webhook,
  Info,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  BankAccountsManager,
  type BankAccountsManagerHandle,
} from "@/components/dashboard/bank-accounts-manager";
import { loadSnap } from "@/lib/load-snap";
import type { GatewayInfo } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

// Production-only seller integration (sandbox removed). Keys are validated with
// a real "Connect" flow: the backend creates a tiny dummy Snap transaction and
// the frontend opens the Snap popup with snap.js — the popup showing up confirms
// both keys. The seller just closes it; no payment needed.
export function PaymentForm({ initial }: { initial: GatewayInfo | null }) {
  const { refresh } = useRouter();
  const [pending, setPending] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectStatus, setConnectStatus] = useState<"ok" | "failed" | "idle">(
    initial?.is_configured && initial?.last_verify_status === "ok" ? "ok" : "idle",
  );

  // Derived from props, NOT useState: the API returns an empty
  // webhook_url until the gateway is configured, and a state initializer
  // only runs once — so after the first save + router.refresh() the "URL
  // Webhook" block stayed hidden until a hard reload and sellers never
  // pasted the notification URL into Midtrans. Every mutation here ends
  // in refresh(), which re-renders the parent with the current value.
  const webhookURL = initial?.webhook_url ?? "";
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [showWebhookGuide, setShowWebhookGuide] = useState(false);
  const webhookGuideRef = useRef<HTMLDialogElement>(null);

  const banksRef = useRef<BankAccountsManagerHandle>(null);

  useEffect(() => {
    const d = webhookGuideRef.current;
    if (!d) return;
    if (showWebhookGuide && !d.open) d.showModal();
    if (!showWebhookGuide && d.open) d.close();
  }, [showWebhookGuide]);

  useEffect(() => {
    const d = webhookGuideRef.current;
    if (!d) return;
    const onCancel = (e: Event) => { e.preventDefault(); setShowWebhookGuide(false); };
    const onClick = (e: MouseEvent) => { if (e.target === d) setShowWebhookGuide(false); };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, []);

  const isConfigured = initial?.is_configured ?? false;
  const hasStoredKey = initial?.has_server_key ?? false;
  const maskedKey = initial?.server_key_masked;

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const server_key = String(fd.get("server_key") ?? "").trim();
    const client_key = String(fd.get("client_key") ?? "").trim();
    // Midtrans is optional — a seller may only use manual transfer / QRIS. But if
    // they start configuring it fresh, both keys must come together (the gateway
    // needs the server key; Snap needs the client key).
    if (!hasStoredKey && (server_key !== "" || client_key !== "")) {
      if (!server_key) {
        showError("Server Key wajib diisi untuk mengaktifkan Midtrans");
        return;
      }
      if (!client_key) {
        showError("Client Key wajib diisi untuk mengaktifkan Midtrans");
        return;
      }
    }
    void doSave({ server_key, client_key });
  }

  async function doSave(body: { server_key: string; client_key: string }) {
    setPending(true);
    try {
      // Only hit the Midtrans endpoint when there's something to save there: a
      // new/updated key, or an existing config to keep. A seller who only manages
      // bank/QRIS (never configured Midtrans) skips it, so the backend's
      // "Server Key wajib diisi" guard can't block their Simpan.
      const touchMidtrans =
        hasStoredKey || body.server_key !== "" || body.client_key !== "";
      if (touchMidtrans) {
        const res = await fetch(`${apiBase}/api/v1/payments/midtrans`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      }
      // Flush bank-account drafts AFTER the Midtrans save so one Simpan covers
      // everything on the Pembayaran page.
      if (banksRef.current) {
        await banksRef.current.flush();
      }
      showSuccess("Konfigurasi pembayaran tersimpan");
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
    }
  }

  async function copyWebhookURL() {
    if (!webhookURL) return;
    try {
      await navigator.clipboard.writeText(webhookURL);
      setWebhookCopied(true);
      setTimeout(() => setWebhookCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  async function rotateWebhookURL() {
    setRotating(true);
    try {
      const res = await fetch(
        `${apiBase}/api/v1/payments/midtrans/rotate-webhook`,
        { method: "POST", credentials: "include" },
      );
      const data = (await res.json().catch(() => ({}))) as {
        webhook_url?: string;
        old_webhook_url?: string;
        store_set_offline?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // No local setState — refresh() below re-reads the rotated URL.
      showSuccess(
        data.store_set_offline
          ? "URL webhook baru ter-generate. Toko di-set offline — paste URL baru di Midtrans lalu buka kembali toko."
          : "URL webhook baru ter-generate. Jangan lupa update di dashboard Midtrans.",
      );
      setShowRotateConfirm(false);
      refresh();
    } catch (err) {
      showError(err);
    } finally {
      setRotating(false);
    }
  }

  // Connect: ask the backend to create a dummy Rp 1.000 Snap transaction with the
  // stored server key, then open the Snap popup with snap.js (client key). The
  // popup showing up = both keys valid. The seller just closes it — no payment.
  async function onConnect() {
    setConnecting(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/payments/midtrans/connect`, {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json().catch(() => ({}))) as {
        token?: string;
        client_key?: string;
        error?: string;
      };
      if (!res.ok || !data.token || !data.client_key) {
        // Bad/missing server key, or keys not saved yet.
        throw new Error(data.error || "Gagal membuat transaksi tes");
      }

      // Load snap.js with the client key, then open the popup.
      const snap = await loadSnap(data.client_key);
      snap.pay(data.token, {
        onSuccess: () => {
          setConnectStatus("ok");
          showSuccess("Midtrans tersambung — pembayaran tes berhasil.");
          refresh();
        },
        onPending: () => {
          setConnectStatus("ok");
          showSuccess("Midtrans tersambung.");
          refresh();
        },
        onClose: () => {
          // Popup rendered + closed = both keys valid (server key created the
          // token, client key rendered the popup). The backend already marked
          // it verified on token creation.
          setConnectStatus("ok");
          showSuccess("Midtrans tersambung — popup tes muncul. Tidak perlu menyelesaikan pembayaran.");
          refresh();
        },
        onError: () => {
          setConnectStatus("failed");
          showError("Snap menolak transaksi — periksa Client Key di dashboard Midtrans.");
        },
      });
      // Popup is open at this point; the callbacks above finalize the status.
      setConnectStatus("ok");
    } catch (err) {
      setConnectStatus("failed");
      showError(err);
    } finally {
      setConnecting(false);
    }
  }

  const connected = connectStatus === "ok";

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        {/* Midtrans — header + keys */}
        <Card>
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-neutral-900">Midtrans</h2>
              {isConfigured && connected && (
                <Badge variant="success">
                  <CheckCircle2 className="size-3" aria-hidden />
                  Terkoneksi
                </Badge>
              )}
              {isConfigured && !connected && (
                <Badge variant="warning">
                  <AlertTriangle className="size-3" aria-hidden />
                  Belum diverifikasi
                </Badge>
              )}
              {!isConfigured && (
                <Badge variant="default">Belum dikonfigurasi</Badge>
              )}
            </div>
            <a
              href="https://dashboard.midtrans.com/settings/access_keys"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Dapatkan API Key
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
          <p className="mt-1.5 text-sm text-neutral-500">
            Dana hasil penjualan langsung masuk ke rekeningmu — kami tidak pernah pegang uang pembeli.{" "}
            <span className="text-neutral-400">
              Opsional — lewati saja kalau cukup pakai transfer manual / QRIS di bawah.
            </span>
          </p>

          {/* API Keys */}
          <div className="mt-5 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="server_key">Server Key</Label>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">
                <Lock className="size-4 shrink-0 text-neutral-400" aria-hidden />
                <input
                  id="server_key"
                  name="server_key"
                  type="password"
                  placeholder={
                    hasStoredKey
                      ? maskedKey || "•••••••• tersimpan"
                      : "Mid-server-..."
                  }
                  className="h-full flex-1 bg-transparent font-mono text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                />
              </div>
              <p className="text-xs text-neutral-400">
                {hasStoredKey
                  ? "Sudah tersimpan (AES-GCM) — kosongkan untuk tetap pakai, isi untuk overwrite."
                  : "Disimpan terenkripsi. Ambil dari dashboard Midtrans (Settings → Access Keys)."}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client_key">Client Key</Label>
              <Input
                id="client_key"
                name="client_key"
                defaultValue={initial?.client_key ?? ""}
                placeholder="Mid-client-..."
                className="font-mono text-xs"
              />
            </div>
          </div>

          {/* Connect row */}
          <div className="mt-5 flex flex-col gap-2 border-t border-neutral-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs leading-relaxed text-neutral-500">
              Simpan dulu, lalu <strong>Connect</strong> untuk tes koneksi — cukup tutup popup-nya.
            </p>
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={onConnect}
              disabled={connecting || !isConfigured}
              className="shrink-0"
            >
              <PlugZap className="size-4" aria-hidden />
              {connecting ? "Menyambungkan…" : "Connect"}
            </Button>
          </div>

          {/* URL Webhook — muncul setelah gateway dikonfigurasi */}
          {webhookURL && isConfigured && (
            <div className="mt-5 border-t border-neutral-100 pt-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Webhook className="size-4 text-brand-600" aria-hidden />
                  <span className="font-semibold text-neutral-900">URL Webhook</span>
                  <Badge variant="brand">Penting</Badge>
                  <button
                    type="button"
                    onClick={() => setShowWebhookGuide(true)}
                    aria-label="Cara pasang URL webhook"
                    className="inline-flex size-7 items-center justify-center rounded-md text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-neutral-700"
                  >
                    <Info className="size-4" aria-hidden />
                  </button>
                </div>
                <a
                  href="https://dashboard.midtrans.com/settings/vtweb_configuration"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium text-brand-600 hover:text-brand-700 inline-flex items-center gap-1"
                >
                  Buka Midtrans
                  <ExternalLink className="size-3.5" aria-hidden />
                </a>
              </div>

              <div className="mt-3 flex items-stretch gap-2">
                <code className="flex flex-1 items-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50 px-3 font-mono text-xs text-neutral-800">
                  <span className="truncate">{webhookURL}</span>
                </code>
                <Button
                  type="button"
                  variant="outline"
                  size="md"
                  onClick={copyWebhookURL}
                  aria-label="Salin URL webhook"
                >
                  {webhookCopied ? (
                    <><Check className="size-4 text-success" aria-hidden />Tersalin</>
                  ) : (
                    <><Copy className="size-4" aria-hidden />Salin</>
                  )}
                </Button>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-100 pt-3">
                <p className="text-xs text-neutral-400">
                  Token rahasia per toko — jangan dibagikan publik.
                </p>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowRotateConfirm(true)}
                  disabled={rotating}
                  className="shrink-0 text-danger hover:bg-danger/10"
                >
                  <RefreshCw className="size-4" aria-hidden />
                  {rotating ? "Memproses…" : "Generate URL baru"}
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <BankAccountsManager ref={banksRef} />
        </Card>

        <div className="flex justify-end">
          <Button type="submit" size="md" disabled={pending}>
            <Save className="size-4" aria-hidden />
            {pending ? "Menyimpan…" : "Simpan"}
          </Button>
        </div>
      </form>

      {/* Webhook guide dialog */}
      <dialog
        ref={webhookGuideRef}
        aria-labelledby="webhook-guide-title"
        className="fixed left-1/2 top-1/2 m-0 w-[min(480px,95vw)] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/50 backdrop:backdrop-blur-sm"
      >
        <div className="flex items-center justify-between gap-3 border-b border-neutral-200 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-lg bg-brand-50">
              <Webhook className="size-4 text-brand-700" aria-hidden />
            </div>
            <h2 id="webhook-guide-title" className="font-display text-base font-semibold text-neutral-900">
              Cara Pasang URL Webhook
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setShowWebhookGuide(false)}
            aria-label="Tutup"
            className="inline-flex size-8 items-center justify-center rounded-md text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="px-6 py-5">
          <ol className="space-y-5">
            {[
              {
                title: "Salin URL Webhook",
                desc: "Klik tombol Salin di samping URL webhook yang tertera di pengaturan.",
              },
              {
                title: "Login ke dashboard Midtrans",
                desc: (
                  <>
                    Buka{" "}
                    <a
                      href="https://dashboard.midtrans.com/settings/vtweb_configuration"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-600 hover:underline"
                    >
                      dashboard Midtrans
                    </a>{" "}
                    dan masuk ke akun kamu.
                  </>
                ),
              },
              {
                title: "Buka halaman konfigurasi",
                desc: (
                  <>
                    Navigasi ke{" "}
                    <strong>Settings → Configuration</strong> dan cari field{" "}
                    <strong>Notification URL</strong> atau{" "}
                    <strong>Payment Notification URL</strong>.
                  </>
                ),
              },
              {
                title: "Paste dan simpan",
                desc: (
                  <>
                    Paste URL webhook ke field tersebut lalu klik{" "}
                    <strong>Update</strong>. Gunakan{" "}
                    <strong>Send Test Notification</strong> untuk memverifikasi
                    koneksi.
                  </>
                ),
              },
            ].map(({ title, desc }, i) => (
              <li key={i} className="flex items-start gap-4">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
                  {i + 1}
                </span>
                <div>
                  <p className="font-semibold text-neutral-900">{title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-neutral-500">{desc}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs text-neutral-500">
            <strong className="text-neutral-700">Catatan:</strong> URL mengandung token rahasia
            per toko. Jangan dibagikan publik. Jika bocor, generate URL baru dari pengaturan.
          </div>
        </div>
        <div className="flex justify-end border-t border-neutral-100 px-6 py-3">
          <Button size="sm" variant="ghost" type="button" onClick={() => setShowWebhookGuide(false)}>
            Tutup
          </Button>
        </div>
      </dialog>

      {/* Generate URL webhook baru — typed-phrase "GENERATE". */}
      <ConfirmDialog
        open={showRotateConfirm}
        onClose={() => !rotating && setShowRotateConfirm(false)}
        onConfirm={rotateWebhookURL}
        title="Generate URL Webhook Baru?"
        kind="danger"
        confirmLabel="Generate URL baru"
        cancelLabel="Batal"
        busy={rotating}
        confirmIcon={<RefreshCw className="size-4" aria-hidden />}
        requireTypedPhrase="GENERATE"
        description={
          <div className="space-y-2">
            <p>
              URL webhook lama akan <strong>langsung non-aktif</strong>.
              Notifikasi pembayaran dari Midtrans tidak akan sampai ke SellOn
              sampai kamu paste URL baru di dashboard Midtrans.
            </p>
            <p>
              Untuk mencegah pembeli order saat webhook patah,{" "}
              <strong className="text-danger">
                toko akan otomatis di-set offline
              </strong>
              . Buka kembali toko setelah URL baru sudah ter-update di
              Midtrans dan kamu sudah test <em>Send Test Notification</em>.
            </p>
          </div>
        }
      />
    </div>
  );
}
