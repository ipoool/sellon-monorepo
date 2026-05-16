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
  const [isSandbox, setIsSandbox] = useState(initial?.is_sandbox ?? true);
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

  // Confirm dialog state - opens at SAVE time when the mode in the form
  // differs from what's stored in the DB.
  const [pendingMode, setPendingMode] = useState<"sandbox" | "production" | null>(null);
  const [confirmInput, setConfirmInput] = useState("");
  const pendingPayloadRef = useRef<Record<string, unknown> | null>(null);
  const banksRef = useRef<BankAccountsManagerHandle>(null);
  const switchDialogRef = useRef<HTMLDialogElement>(null);

  // Open / close native dialog imperatively.
  useEffect(() => {
    const dialog = switchDialogRef.current;
    if (!dialog) return;
    if (pendingMode && !dialog.open) dialog.showModal();
    if (!pendingMode && dialog.open) dialog.close();
  }, [pendingMode]);

  // ESC + backdrop click cancels the dialog.
  useEffect(() => {
    const dialog = switchDialogRef.current;
    if (!dialog) return;
    const cancel = () => {
      setPendingMode(null);
      pendingPayloadRef.current = null;
      setConfirmInput("");
    };
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) cancel();
    };
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("click", onClick);
      dialog.removeEventListener("cancel", cancel);
    };
  }, []);

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

  const requiredPhrase = pendingMode === "production" ? "PRODUCTION" : "SANDBOX";
  const canConfirmSwitch = confirmInput === requiredPhrase;

  const isConfigured = initial?.is_configured ?? false;
  const lastStatus = initial?.last_verify_status || "";
  const hasSandboxKey = initial?.has_sandbox_server_key ?? false;
  const hasProdKey = initial?.has_prod_server_key ?? false;

  // Active env's metadata used for several UI bits below.
  const activeMaskedKey = isSandbox
    ? initial?.sandbox_server_key_masked
    : initial?.prod_server_key_masked;
  const activeHasStoredKey = isSandbox ? hasSandboxKey : hasProdKey;
  const activePlaceholder = isSandbox
    ? "SB-Mid-server-..."
    : "Mid-server-...";
  const activeClientPlaceholder = isSandbox
    ? "SB-Mid-client-..."
    : "Mid-client-...";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const fd = new FormData(e.currentTarget);
    const submittedServerKey = String(fd.get("server_key") ?? "").trim();
    const submittedClientKey = String(fd.get("client_key") ?? "").trim();

    // Detect whether the user has entered NEW key values (vs. leaving fields
    // blank to preserve the existing stored keys).
    const originalClientKey = isSandbox
      ? (initial?.client_key_sandbox ?? "")
      : (initial?.client_key_prod ?? "");
    const hasNewServerKey = submittedServerKey !== "";
    const hasNewClientKey = submittedClientKey !== originalClientKey;
    const hasDirtyKeys = hasNewServerKey || hasNewClientKey;

    // Determine which server/client key values to actually send.
    // If new keys were entered but not tested successfully → strip them and warn.
    let effectiveServerKey = submittedServerKey;
    let effectiveClientKey = submittedClientKey;

    if (hasDirtyKeys && keyTestStatus !== "ok") {
      if (keyTestStatus === "failed") {
        showError(
          "Koneksi gagal — server key & client key yang baru tidak disimpan. Konfigurasi lainnya tetap tersimpan.",
        );
      } else {
        showError(
          "Lakukan Tes Koneksi terlebih dahulu. Server key & client key tidak akan disimpan sampai koneksi berhasil diverifikasi.",
        );
      }
      effectiveServerKey = "";
      effectiveClientKey = originalClientKey;
    }

    // Build payload: server key empty = preserve existing (backend contract).
    const body: Record<string, unknown> = {
      is_sandbox: isSandbox,
      sandbox_server_key: isSandbox ? effectiveServerKey : "",
      prod_server_key: !isSandbox ? effectiveServerKey : "",
      sandbox_client_key: isSandbox
        ? effectiveClientKey
        : initial?.client_key_sandbox ?? "",
      prod_client_key: !isSandbox
        ? effectiveClientKey
        : initial?.client_key_prod ?? "",
    };

    // If the saved mode differs from what's in the form (and we already have
    // a config), require typed confirmation before committing the switch.
    const savedMode = initial?.is_sandbox ?? true;
    const modeIsChanging = (initial?.is_configured ?? false) && savedMode !== isSandbox;

    if (modeIsChanging) {
      setPendingMode(isSandbox ? "sandbox" : "production");
      pendingPayloadRef.current = body;
      setConfirmInput("");
      return;
    }

    void doSave(body);
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

  async function confirmModeSwitchAndSave() {
    const payload = pendingPayloadRef.current;
    if (!canConfirmSwitch || !payload) return;
    // Close dialog optimistically; doSave handles error state.
    setPendingMode(null);
    pendingPayloadRef.current = null;
    setConfirmInput("");
    await doSave(payload);
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
      setKeyTestStatus("ok");
      refresh();
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : "Gagal verify");
      setKeyTestStatus("failed");
    } finally {
      setVerifying(false);
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
              {!isConfigured && (
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

          {/* Mode segmented control */}
          <div className="mt-5 border-t border-neutral-100 pt-5">
            <div
              role="tablist"
              aria-label="Mode pembayaran"
              className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-1 gap-1"
            >
              {(
                [
                  { label: "Sandbox", sandbox: true, icon: FlaskConical, hasKey: hasSandboxKey },
                  { label: "Production", sandbox: false, icon: Rocket, hasKey: hasProdKey },
                ] as const
              ).map(({ label, sandbox, icon: Icon, hasKey }) => (
                <button
                  key={label}
                  type="button"
                  role="tab"
                  aria-selected={isSandbox === sandbox}
                  onClick={() => { setIsSandbox(sandbox); setKeyTestStatus("untested"); }}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                    isSandbox === sandbox
                      ? "bg-white text-neutral-900 shadow-sm"
                      : "text-neutral-500 hover:text-neutral-800",
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                  {hasKey && (
                    <span className="rounded-full bg-success/15 px-1.5 py-px text-[10px] font-semibold text-success">
                      ✓
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* API Keys */}
          <div className="mt-4 flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="server_key">
                Server Key {isSandbox ? "Sandbox" : "Production"}
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
                Client Key {isSandbox ? "Sandbox" : "Production"}
                <span className="ml-1 text-danger">*</span>
              </Label>
              <Input
                id="client_key"
                name="client_key"
                key={isSandbox ? "client-sandbox" : "client-prod"}
                required
                defaultValue={
                  isSandbox
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
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-100 pt-4">
            <span className="text-sm text-neutral-600">{verifyMsg}</span>
            {isConfigured && activeHasStoredKey && (
              <Button type="button" variant="outline" size="md" onClick={onVerify} disabled={verifying}>
                <PlugZap className="size-4" aria-hidden />
                {verifying ? "Menguji…" : "Tes Koneksi"}
              </Button>
            )}
          </div>

          {/* URL Webhook — hanya muncul setelah berhasil terkoneksi */}
          {webhookURL && keyTestStatus === "ok" && (
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

      {/* Mode-switch confirmation dialog */}
      <dialog
        ref={switchDialogRef}
        aria-labelledby="mode-switch-title"
        aria-describedby="mode-switch-description"
        className="fixed left-1/2 top-1/2 m-0 -translate-x-1/2 -translate-y-1/2 rounded-xl border border-neutral-200 bg-white p-0 shadow-elevated backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
      >
        <div className="w-[min(94vw,460px)] p-6">
          <div
            className={cn(
              "flex size-10 items-center justify-center rounded-lg",
              pendingMode === "production"
                ? "bg-danger/10 text-danger"
                : "bg-warning/15 text-neutral-800",
            )}
          >
            {pendingMode === "production" ? (
              <Rocket className="size-5" aria-hidden />
            ) : (
              <FlaskConical className="size-5" aria-hidden />
            )}
          </div>

          <h2
            id="mode-switch-title"
            className="mt-4 font-display text-lg font-semibold text-neutral-900"
          >
            {pendingMode === "production"
              ? "Pindah ke mode Production?"
              : "Pindah ke mode Sandbox?"}
          </h2>
          <p
            id="mode-switch-description"
            className="mt-2 text-sm leading-relaxed text-neutral-600"
          >
            {pendingMode === "production" ? (
              <>
                Mode <strong>Production</strong> akan memproses pembayaran{" "}
                <strong>asli</strong> dari pembeli. Pastikan kamu sudah:
                <br />
                • setup akun Midtrans production yang aktif,
                <br />
                • verifikasi rekening tujuan settlement,
                <br />
                • tes flow checkout di sandbox terlebih dahulu.
              </>
            ) : (
              <>
                Mode <strong>Sandbox</strong> hanya untuk uji coba - pembayaran
                tidak akan diproses sungguhan. Pembeli yang sedang checkout
                bisa terdampak.
              </>
            )}
          </p>

          <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
            <Label htmlFor="mode-confirm-input">
              Ketik <span className="font-mono text-brand-700">{requiredPhrase}</span>{" "}
              untuk konfirmasi
            </Label>
            <Input
              id="mode-confirm-input"

              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={confirmInput}
              onChange={(e) => setConfirmInput(e.target.value)}
              placeholder={requiredPhrase}
              className="mt-2 font-mono"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canConfirmSwitch) {
                  e.preventDefault();
                  void confirmModeSwitchAndSave();
                }
              }}
            />
            <p className="mt-2 text-xs text-neutral-500">
              Case-sensitive. Harus persis &ldquo;{requiredPhrase}&rdquo;.
            </p>
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={() => {
                setPendingMode(null);
                pendingPayloadRef.current = null;
                setConfirmInput("");
              }}
              disabled={pending}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant={pendingMode === "production" ? "destructive" : "default"}
              size="md"
              disabled={!canConfirmSwitch || pending}
              onClick={() => void confirmModeSwitchAndSave()}
            >
              {pendingMode === "production" ? (
                <Rocket className="size-4" aria-hidden />
              ) : (
                <FlaskConical className="size-4" aria-hidden />
              )}
              {pending
                ? "Menyimpan…"
                : `Konfirmasi & Simpan (${pendingMode === "production" ? "Production" : "Sandbox"})`}
            </Button>
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
