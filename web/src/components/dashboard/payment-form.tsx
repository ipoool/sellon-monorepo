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
  FlaskConical,
  Rocket,
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
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  BankAccountsManager,
  type BankAccountsManagerHandle,
} from "@/components/dashboard/bank-accounts-manager";
import { cn } from "@/lib/utils";
import type { GatewayInfo } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";


export function PaymentForm({ initial }: { initial: GatewayInfo | null }) {
  const { refresh } = useRouter();
  // isSandbox = mode AKTIF (dikontrol oleh toggle).
  const [isSandbox, setIsSandbox] = useState(initial?.is_sandbox ?? true);
  // activeKeyTab = tab kunci mana yang ditampilkan untuk entry/edit kunci (independen dari mode aktif).
  const [activeKeyTab, setActiveKeyTab] = useState<"sandbox" | "production">(
    (initial?.is_sandbox ?? true) ? "sandbox" : "production",
  );
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);
  // "ok"      = new keys have been successfully tested this session
  // "failed"  = test was run but failed
  // "untested"= user typed new keys but hasn't tested yet (or test not run)
  const [keyTestStatus, setKeyTestStatus] = useState<"ok" | "failed" | "untested">(
    (initial?.is_configured && initial?.last_verify_status === "ok") ? "ok" : "untested",
  );

  const [webhookURL, setWebhookURL] = useState(initial?.webhook_url ?? "");
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  // Buka ConfirmDialog typed-phrase "GENERATE" sebelum rotate.
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);
  const [showWebhookGuide, setShowWebhookGuide] = useState(false);
  const webhookGuideRef = useRef<HTMLDialogElement>(null);

  // Verify result dialog
  const [showVerifyResult, setShowVerifyResult] = useState(false);
  const verifyResultRef = useRef<HTMLDialogElement>(null);

  // Sandbox-switch confirmation dialog (shown when saving with mode live→sandbox)
  const [showSandboxConfirm, setShowSandboxConfirm] = useState(false);
  const sandboxConfirmRef = useRef<HTMLDialogElement>(null);
  const pendingSaveBody = useRef<Record<string, unknown> | null>(null);

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

  useEffect(() => {
    const d = verifyResultRef.current;
    if (!d) return;
    if (showVerifyResult && !d.open) d.showModal();
    if (!showVerifyResult && d.open) d.close();
  }, [showVerifyResult]);

  useEffect(() => {
    const d = verifyResultRef.current;
    if (!d) return;
    const onCancel = (e: Event) => { e.preventDefault(); setShowVerifyResult(false); };
    const onClick = (e: MouseEvent) => { if (e.target === d) setShowVerifyResult(false); };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, []);


  useEffect(() => {
    const d = sandboxConfirmRef.current;
    if (!d) return;
    if (showSandboxConfirm && !d.open) d.showModal();
    if (!showSandboxConfirm && d.open) d.close();
  }, [showSandboxConfirm]);

  useEffect(() => {
    const d = sandboxConfirmRef.current;
    if (!d) return;
    const onCancel = (e: Event) => { e.preventDefault(); setShowSandboxConfirm(false); };
    const onClick = (e: MouseEvent) => { if (e.target === d) setShowSandboxConfirm(false); };
    d.addEventListener("cancel", onCancel);
    d.addEventListener("click", onClick);
    return () => {
      d.removeEventListener("cancel", onCancel);
      d.removeEventListener("click", onClick);
    };
  }, []);

  const isConfigured = initial?.is_configured ?? false;
  const lastStatus = initial?.last_verify_status || "";
  const hasSandboxKey = initial?.has_sandbox_server_key ?? false;
  const hasProdKey = initial?.has_prod_server_key ?? false;


  // Metadata untuk tab kunci yang aktif (berdasarkan activeKeyTab, bukan isSandbox).
  const isTabSandbox = activeKeyTab === "sandbox";
  const activeMaskedKey = isTabSandbox
    ? initial?.sandbox_server_key_masked
    : initial?.prod_server_key_masked;
  const activeHasStoredKey = isTabSandbox ? hasSandboxKey : hasProdKey;
  const activePlaceholder = isTabSandbox ? "SB-Mid-server-..." : "Mid-server-...";
  const activeClientPlaceholder = isTabSandbox ? "SB-Mid-client-..." : "Mid-client-...";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    const submittedServerKey = String(fd.get("server_key") ?? "").trim();
    const submittedClientKey = String(fd.get("client_key") ?? "").trim();

    // Keys disubmit berdasarkan activeKeyTab (tab mana yang sedang dibuka),
    // sedangkan is_sandbox dari toggle mode aktif.
    const body: Record<string, unknown> = {
      is_sandbox: isSandbox,
      sandbox_server_key: isTabSandbox ? submittedServerKey : "",
      prod_server_key: !isTabSandbox ? submittedServerKey : "",
      sandbox_client_key: isTabSandbox
        ? submittedClientKey
        : initial?.client_key_sandbox ?? "",
      prod_client_key: !isTabSandbox
        ? submittedClientKey
        : initial?.client_key_prod ?? "",
    };

    // Switching from live → sandbox: warn seller before saving.
    const wasLive = !(initial?.is_sandbox ?? true);
    if (wasLive && isSandbox) {
      pendingSaveBody.current = body;
      setShowSandboxConfirm(true);
      return;
    }

    void doSave(body);
  }

  function handleModeToggle(newIsSandbox: boolean) {
    setIsSandbox(newIsSandbox);
    setActiveKeyTab(newIsSandbox ? "sandbox" : "production");
    setKeyTestStatus("untested");
  }

  async function doSave(body: Record<string, unknown>) {
    setPending(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/payments/midtrans`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      // Flush any bank-account drafts AFTER the Midtrans save so the user's
      // single Simpan covers everything on the Pembayaran page.
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
      if (data.webhook_url) setWebhookURL(data.webhook_url);
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

  async function onVerify() {
    setVerifying(true);
    setVerifyMsg(null);
    try {
      const res = await fetch(`${apiBase}/api/v1/payments/midtrans/verify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tab: activeKeyTab }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setVerifyMsg(data.message || "Koneksi OK");
      setKeyTestStatus("ok");
      refresh();
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : "Gagal verify");
      setKeyTestStatus("failed");
    } finally {
      setVerifying(false);
      setShowVerifyResult(true);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        {/* Midtrans — header, mode, keys merged into one card */}
        <Card>
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-semibold text-neutral-900">Midtrans</h2>
              {!isSandbox && isConfigured && lastStatus === "ok" && (
                <Badge variant="success">
                  <CheckCircle2 className="size-3" aria-hidden />
                  Terkoneksi
                </Badge>
              )}
              {!isSandbox && isConfigured && lastStatus !== "ok" && (
                <Badge variant="warning">
                  <AlertTriangle className="size-3" aria-hidden />
                  Belum diverifikasi
                </Badge>
              )}
              {!isSandbox && !isConfigured && (
                <Badge variant="default">Belum dikonfigurasi</Badge>
              )}
            </div>
            <a
              href={
                isSandbox
                  ? "https://dashboard.sandbox.midtrans.com/settings/access_keys"
                  : "https://dashboard.midtrans.com/settings/access_keys"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              Dapatkan API Key
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>
          <p className="mt-1.5 text-sm text-neutral-500">
            Dana hasil penjualan langsung masuk ke rekeningmu — kami tidak pernah pegang uang pembeli.
          </p>

          {/* Toggle mode aktif */}
          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-neutral-900">Mode aktif</p>
              <p className="mt-0.5 text-xs text-neutral-500">
                {isSandbox
                  ? "Sandbox — hanya untuk testing, pembeli tidak di-charge"
                  : "Live — transaksi nyata aktif"}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span className={cn("text-xs font-medium", isSandbox ? "text-warning" : "text-neutral-400")}>
                Sandbox
              </span>
              <Switch
                size="sm"
                checked={!isSandbox}
                onChange={(e) => handleModeToggle(!e.target.checked)}
                aria-label="Aktifkan mode live"
              />
              <span className={cn("text-xs font-medium", !isSandbox ? "text-success" : "text-neutral-400")}>
                Live
              </span>
            </div>
          </div>

          {/* Tab kunci — hanya untuk memilih kunci mana yang ingin diedit, tidak mengubah mode aktif */}
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium text-neutral-500">Edit kunci</p>
            <div
              role="tablist"
              aria-label="Pilih kunci"
              className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-1 gap-1"
            >
              {(
                [
                  { label: "Sandbox", tab: "sandbox" as const, icon: FlaskConical },
                  { label: "Production", tab: "production" as const, icon: Rocket },
                ]
              ).map(({ label, tab, icon: Icon }) => (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={activeKeyTab === tab}
                  onClick={() => { setActiveKeyTab(tab); setKeyTestStatus("untested"); }}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                    activeKeyTab === tab
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-800",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* API Keys */}
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="server_key">
                Server Key {isTabSandbox ? "Sandbox" : "Production"}
                <span className="ml-1 text-danger">*</span>
              </Label>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">
                <Lock className="size-4 shrink-0 text-neutral-400" aria-hidden />
                <input
                  id="server_key"
                  name="server_key"
                  type="password"
                  required={!activeHasStoredKey}
                  placeholder={
                    activeHasStoredKey
                      ? activeMaskedKey || "•••••••• tersimpan"
                      : activePlaceholder
                  }
                  onChange={() => setKeyTestStatus("untested")}
                  className="h-full flex-1 bg-transparent font-mono text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                />
              </div>
              <p className="text-xs text-neutral-400">
                {activeHasStoredKey
                  ? "Sudah tersimpan (AES-GCM) — kosongkan untuk tetap pakai, isi untuk overwrite."
                  : "Disimpan terenkripsi. Wajib diisi sebelum mode ini bisa dipakai."}
              </p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client_key">
                Client Key {isTabSandbox ? "Sandbox" : "Production"}
                <span className="ml-1 text-danger">*</span>
              </Label>
              <Input
                id="client_key"
                name="client_key"
                key={activeKeyTab}
                required
                defaultValue={
                  isTabSandbox
                    ? initial?.client_key_sandbox ?? ""
                    : initial?.client_key_prod ?? ""
                }
                placeholder={activeClientPlaceholder}
                className="font-mono text-xs"
                onChange={() => setKeyTestStatus("untested")}
              />
            </div>
          </div>

          {/* Tes Koneksi row */}
          <div className="mt-5 flex justify-end border-t border-neutral-100 pt-4">
            <Button type="button" variant="outline" size="md" onClick={onVerify} disabled={verifying}>
              <PlugZap className="size-4" aria-hidden />
              {verifying ? "Menguji…" : "Tes Koneksi"}
            </Button>
          </div>

          {/* URL Webhook — hanya muncul setelah berhasil terkoneksi */}
          {webhookURL && !isSandbox && (
            <div className="mt-5 border-t border-neutral-100 pt-5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Webhook className="size-4 text-brand-600" aria-hidden />
                  <span className="font-semibold text-neutral-900">URL Webhook</span>
                  <Badge variant="brand">Penting</Badge>
                  {/* Info button → opens guide dialog */}
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
                  href={
                    isSandbox
                      ? "https://dashboard.sandbox.midtrans.com/settings/vtweb_configuration"
                      : "https://dashboard.midtrans.com/settings/vtweb_configuration"
                  }
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
                      href={
                        isSandbox
                          ? "https://dashboard.sandbox.midtrans.com/settings/vtweb_configuration"
                          : "https://dashboard.midtrans.com/settings/vtweb_configuration"
                      }
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand-600 hover:underline"
                    >
                      dashboard {isSandbox ? "sandbox" : "production"} Midtrans
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

      {/* Verify result dialog */}
      <dialog
        ref={verifyResultRef}
        aria-labelledby="verify-result-title"
        className="fixed left-1/2 top-1/2 m-0 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-elevated backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="w-[min(94vw,440px)] p-6">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              keyTestStatus === "ok" ? "bg-success/10 text-success" : "bg-danger/10 text-danger",
            )}
          >
            {keyTestStatus === "ok" ? (
              <CheckCircle2 className="size-5" aria-hidden />
            ) : (
              <AlertTriangle className="size-5" aria-hidden />
            )}
          </div>

          <h2 id="verify-result-title" className="mt-4 font-display text-lg font-semibold text-neutral-900">
            {keyTestStatus === "ok" ? "Koneksi Berhasil" : "Koneksi Gagal"}
          </h2>

          <p className="mt-1 font-mono text-xs text-neutral-500 break-all">{verifyMsg}</p>

          <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm leading-relaxed text-neutral-600">
            {keyTestStatus === "ok" ? (
              <p>
                Kunci {isTabSandbox ? "Sandbox" : "Production"} berhasil terverifikasi.
                {!isSandbox && " Mode Live sudah aktif dan siap memproses transaksi nyata."}
                {isSandbox && isTabSandbox && " Kamu bisa mulai testing alur checkout."}
                {isSandbox && !isTabSandbox && " Toggle mode ke Live untuk mulai memproses transaksi nyata."}
              </p>
            ) : (() => {
              const msg = (verifyMsg ?? "").toLowerCase();
              if (msg.includes("belum dikonfigurasi") || msg.includes("not configured") || msg.includes("gateway")) {
                return <p><strong>Kunci belum tersimpan.</strong> Klik <em>Simpan</em> terlebih dahulu untuk menyimpan kunci ke server, lalu coba Tes Koneksi lagi.</p>;
              }
              if (msg.includes("401") || msg.includes("unauthorized") || msg.includes("invalid") || msg.includes("wrong key")) {
                return <p><strong>Server key tidak valid.</strong> Pastikan kunci yang dimasukkan sesuai dengan mode yang dipilih — kunci Sandbox diawali <code className="text-xs">SB-Mid-server-</code>, kunci Production diawali <code className="text-xs">Mid-server-</code>.</p>;
              }
              if (msg.includes("403") || msg.includes("forbidden") || msg.includes("not active")) {
                return <p><strong>Akun Midtrans belum aktif.</strong> Pastikan akun Midtrans kamu sudah diverifikasi dan disetujui, terutama untuk mode Production.</p>;
              }
              if (msg.includes("timeout") || msg.includes("connection") || msg.includes("refused") || msg.includes("network")) {
                return <p><strong>Tidak dapat terhubung ke Midtrans.</strong> Periksa koneksi internet dan coba beberapa saat lagi. Jika terus gagal, cek status Midtrans di <a href="https://status.midtrans.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">status.midtrans.com</a>.</p>;
              }
              return <p><strong>Verifikasi gagal.</strong> Periksa kembali Server Key dan Client Key di <a href={isTabSandbox ? "https://dashboard.sandbox.midtrans.com/settings/access_keys" : "https://dashboard.midtrans.com/settings/access_keys"} target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">dashboard Midtrans</a> lalu coba lagi.</p>;
            })()}
          </div>

          <div className="mt-6 flex justify-end">
            <Button type="button" size="md" onClick={() => setShowVerifyResult(false)}>
              Tutup
            </Button>
          </div>
        </div>
      </dialog>


      {/* Sandbox-switch confirmation dialog */}
      <dialog
        ref={sandboxConfirmRef}
        aria-labelledby="sandbox-confirm-title"
        className="fixed left-1/2 top-1/2 m-0 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-elevated backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="w-[min(94vw,420px)] p-6">
          <div className="flex size-10 items-center justify-center rounded-lg bg-warning/15 text-warning">
            <FlaskConical className="size-5" aria-hidden />
          </div>
          <h2 id="sandbox-confirm-title" className="mt-4 font-display text-lg font-semibold text-neutral-900">
            Pindah ke mode Sandbox?
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-neutral-600">
            Mode pembayaran Midtrans akan berubah ke <strong>Sandbox</strong>. Transaksi baru dari pembeli{" "}
            <strong>tidak akan diproses sungguhan</strong> sampai kamu kembali ke mode Live.
          </p>
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setShowSandboxConfirm(false); pendingSaveBody.current = null; }}
              className="inline-flex h-9 items-center rounded-lg border border-neutral-200 px-4 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50"
            >
              Batal
            </button>
            <button
              type="button"
              onClick={() => {
                setShowSandboxConfirm(false);
                if (pendingSaveBody.current) {
                  void doSave(pendingSaveBody.current);
                  pendingSaveBody.current = null;
                }
              }}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-warning px-4 text-sm font-semibold text-white transition-colors hover:bg-warning/90"
            >
              <FlaskConical className="size-4" aria-hidden />
              Ya, pindah ke Sandbox
            </button>
          </div>
        </div>
      </dialog>

      {/* Generate URL webhook baru — typed-phrase "GENERATE" untuk
          force seller membaca konsekuensinya (toko di-offline-kan
          sampai mereka paste URL baru di Midtrans). */}
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
