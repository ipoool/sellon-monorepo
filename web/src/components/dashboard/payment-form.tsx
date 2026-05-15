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

const methodOptions = [
  { id: "qris", label: "QRIS" },
  { id: "bank_transfer", label: "Virtual Account / Bank Transfer" },
  { id: "gopay", label: "GoPay" },
  { id: "shopeepay", label: "ShopeePay" },
  { id: "credit_card", label: "Kartu Kredit/Debit" },
];

export function PaymentForm({ initial }: { initial: GatewayInfo | null }) {
  const { refresh } = useRouter();
  const [isSandbox, setIsSandbox] = useState(initial?.is_sandbox ?? true);
  const [pending, setPending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyMsg, setVerifyMsg] = useState<string | null>(null);

  const [webhookURL, setWebhookURL] = useState(initial?.webhook_url ?? "");
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  // Buka ConfirmDialog typed-phrase "GENERATE" sebelum rotate.
  const [showRotateConfirm, setShowRotateConfirm] = useState(false);

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
    const enabledMethods = methodOptions.reduce<string[]>((acc, m) => {
      if (fd.get(`method_${m.id}`) === "on") acc.push(m.id);
      return acc;
    }, []);

    const submittedServerKey = String(fd.get("server_key") ?? "").trim();
    const submittedClientKey = String(fd.get("client_key") ?? "").trim();

    // Build payload: only set the env's fields the user is currently editing.
    // Server keys: empty = preserve existing. Client keys: always sent (we
    // overwrite with what's in the field for the active env).
    const body: Record<string, unknown> = {
      is_sandbox: isSandbox,
      enabled_methods: enabledMethods,
      sandbox_server_key: isSandbox ? submittedServerKey : "",
      prod_server_key: !isSandbox ? submittedServerKey : "",
      sandbox_client_key: isSandbox
        ? submittedClientKey
        : initial?.client_key_sandbox ?? "",
      prod_client_key: !isSandbox
        ? submittedClientKey
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
      refresh();
    } catch (err) {
      setVerifyMsg(err instanceof Error ? err.message : "Gagal verify");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
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
        <p className="mt-2 text-sm text-neutral-600">
          Pakai akun Midtrans-mu sendiri. Dana hasil penjualan langsung masuk
          ke rekeningmu sesuai jadwal settlement Midtrans - kami tidak pernah
          pegang uang pembeli.
        </p>
        <a
          href={
            isSandbox
              ? "https://dashboard.sandbox.midtrans.com/settings/access_keys"
              : "https://dashboard.midtrans.com/settings/access_keys"
          }
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex w-fit items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-medium text-brand-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
        >
          Dapatkan API Key
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </Card>

      <form onSubmit={onSubmit} className="flex flex-col gap-5">
        {/* Mode switcher */}
        <Card>
          <h3 className="font-semibold text-neutral-900">Mode</h3>
          <p className="mt-0.5 text-sm text-neutral-500">
            Tiap mode punya pasangan API key sendiri. Pindah mode tidak akan
            menghapus key untuk mode lainnya.
          </p>

          <div
            role="tablist"
            aria-label="Mode pembayaran"
            className="mt-4 grid grid-cols-2 gap-2"
          >
            <ModeOption
              icon={FlaskConical}
              label="Sandbox"
              description="Uji coba dengan akun sandbox Midtrans"
              active={isSandbox}
              hasKey={hasSandboxKey}
              onClick={() => setIsSandbox(true)}
            />
            <ModeOption
              icon={Rocket}
              label="Production"
              description="Pembayaran asli dari pembeli"
              active={!isSandbox}
              hasKey={hasProdKey}
              onClick={() => setIsSandbox(false)}
            />
          </div>
        </Card>

        {/* API Keys for the currently selected mode */}
        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-neutral-900">
                  API Keys -{" "}
                  <span className="text-brand-700">
                    {isSandbox ? "Sandbox" : "Production"}
                  </span>
                </h3>
                <Badge variant={isSandbox ? "warning" : "brand"}>
                  Sedang aktif
                </Badge>
              </div>
              <p className="mt-0.5 text-sm text-neutral-500">
                Server Key disimpan terenkripsi (AES-GCM). Tidak ditampilkan
                ulang setelah disimpan - kamu bisa overwrite kapan saja.
                {!activeHasStoredKey && (
                  <>
                    {" "}
                    Wajib diisi sebelum mode {isSandbox ? "Sandbox" : "Production"} bisa dipakai.
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="server_key">
                Server Key {isSandbox ? "Sandbox" : "Production"}
                {!activeHasStoredKey && <span className="ml-1 text-danger">*</span>}
              </Label>
              <div className="flex h-10 items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 transition-colors focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-500/30">
                <Lock
                  className="size-4 shrink-0 text-neutral-400"
                  aria-hidden
                />
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
                  className="h-full flex-1 bg-transparent font-mono text-xs text-neutral-900 placeholder:text-neutral-400 focus:outline-none"
                />
              </div>
              {activeHasStoredKey && (
                <p className="text-xs text-neutral-500">
                  Sudah tersimpan - kosongkan field ini untuk pakai key yang
                  ada, atau isi nilai baru untuk overwrite.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="client_key">
                Client Key {isSandbox ? "Sandbox" : "Production"} (opsional)
              </Label>
              <Input
                id="client_key"
                name="client_key"
                key={isSandbox ? "client-sandbox" : "client-prod"}
                defaultValue={
                  isSandbox
                    ? initial?.client_key_sandbox ?? ""
                    : initial?.client_key_prod ?? ""
                }
                placeholder={activeClientPlaceholder}
                className="font-mono text-xs"
              />
            </div>
          </div>

          <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-xs text-neutral-700">
            <AlertTriangle
              className="mt-0.5 size-4 shrink-0 text-warning"
              aria-hidden
            />
            <p>
              <strong>Catatan keamanan:</strong> Server Key disimpan terenkripsi
              (AES-GCM, key derivasi dari secret aplikasi). Tim SellOn tidak
              bisa membaca raw key Anda. Tetap rotate key secara berkala lewat
              Midtrans dashboard.
            </p>
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
                  defaultChecked={
                    initial?.enabled_methods?.includes(m.id) ??
                    (m.id === "qris" || m.id === "bank_transfer")
                  }
                  className="size-4 rounded border-neutral-300 accent-brand-500 focus:ring-brand-500/30"
                />
                <span className="font-medium text-neutral-900">{m.label}</span>
              </label>
            ))}
          </div>

          <BankAccountsManager ref={banksRef} />
        </Card>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm">
            {verifyMsg && (
              <span className="font-medium text-neutral-700">{verifyMsg}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {isConfigured && activeHasStoredKey && (
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

      {/* Webhook URL - only after first save (token exists) */}
      {webhookURL && (
        <Card>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Webhook className="size-4 text-brand-600" aria-hidden />
                <h3 className="font-semibold text-neutral-900">URL Webhook</h3>
                <Badge variant="brand">Penting</Badge>
              </div>
              <p className="mt-1 text-sm text-neutral-600">
                Masukkan URL ini di Midtrans dashboard supaya status pembayaran
                ter-update otomatis di SellOn saat pembeli bayar.
              </p>
            </div>
            <a
              href={
                isSandbox
                  ? "https://dashboard.sandbox.midtrans.com/settings/vtweb_configuration"
                  : "https://dashboard.midtrans.com/settings/vtweb_configuration"
              }
              target="_blank"
              rel="noopener noreferrer"
              className="hidden text-sm font-medium text-brand-600 hover:text-brand-700 sm:inline-flex sm:items-center sm:gap-1"
            >
              Buka Midtrans
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          </div>

          <div className="flex items-stretch gap-2">
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
                <>
                  <Check className="size-4 text-success" aria-hidden />
                  Tersalin
                </>
              ) : (
                <>
                  <Copy className="size-4" aria-hidden />
                  Salin
                </>
              )}
            </Button>
          </div>

          <ol className="mt-5 flex flex-col gap-2 text-sm text-neutral-700">
            <li className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                1
              </span>
              <span>
                Salin URL di atas. Login ke{" "}
                <strong>
                  dashboard{isSandbox ? " sandbox" : ""} Midtrans
                </strong>
                .
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                2
              </span>
              <span>
                Buka <strong>Settings → Configuration → Notification URL</strong>{" "}
                (atau <strong>Payment Notification URL</strong>).
              </span>
            </li>
            <li className="flex gap-3">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
                3
              </span>
              <span>
                Paste URL ke field tersebut, klik <strong>Update</strong>. Test
                dengan <strong>Send Test Notification</strong> di Midtrans.
              </span>
            </li>
          </ol>

          <div className="mt-5 flex items-center justify-between border-t border-neutral-200 pt-4">
            <p className="text-xs text-neutral-500">
              URL berisi token rahasia per toko. Jangan dibagikan publik. Kalau
              kena leak, generate URL baru.
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowRotateConfirm(true)}
              disabled={rotating}
              className="text-danger hover:bg-danger/10"
            >
              <RefreshCw className="size-4" aria-hidden />
              {rotating ? "Memproses…" : "Generate URL baru"}
            </Button>
          </div>
        </Card>
      )}


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

function ModeOption({
  icon: Icon,
  label,
  description,
  active,
  hasKey,
  onClick,
}: {
  icon: typeof FlaskConical;
  label: string;
  description: string;
  active: boolean;
  hasKey: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-start gap-3 rounded-xl border p-4 text-left transition-all",
        active
          ? "border-brand-500 bg-brand-50/50 ring-2 ring-brand-500/20"
          : "border-neutral-200 bg-white hover:bg-neutral-50",
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          active ? "bg-brand-500 text-white" : "bg-neutral-100 text-neutral-600",
        )}
      >
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-semibold text-neutral-900">{label}</p>
          {hasKey ? (
            <Badge variant="success">Tersimpan</Badge>
          ) : (
            <Badge variant="default">Belum diisi</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-600">{description}</p>
      </div>
    </button>
  );
}
