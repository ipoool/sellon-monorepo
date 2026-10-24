"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Landmark, Loader2, TriangleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError, showSuccess } from "@/lib/toast";
import type { BillingSettings } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/**
 * The destination account for every subscription payment.
 *
 * Manual bank transfer is the only way to pay for a subscription, so these
 * four strings are the most load-bearing in the product — a wrong digit
 * sends real money somewhere nobody can reconcile, and every seller who
 * opens the upgrade dialog sees it at once. Hence the typed confirmation:
 * this is the same weight of action as a bulk delete, and it deserves the
 * same pause.
 */
export function AdminBillingEditor({ initial }: { initial: BillingSettings }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<BillingSettings>(initial);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // The dialog is opened with showModal(), so it sits in the top layer and
  // a toast would render behind it. A failure while confirming has to be
  // shown inline or it is shown nowhere.
  const [dialogError, setDialogError] = useState("");

  const set = (k: keyof BillingSettings) => (v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const dirty =
    form.bank_name !== initial.bank_name ||
    form.account_number !== initial.account_number ||
    form.account_name !== initial.account_name ||
    form.support_whatsapp !== initial.support_whatsapp ||
    form.note !== initial.note;

  // Only the account itself is worth a typed confirmation. Fixing a typo
  // in the support number or the note should not feel like defusing a
  // bomb, or the gesture stops meaning anything.
  const accountChanged =
    form.bank_name !== initial.bank_name ||
    form.account_number !== initial.account_number ||
    form.account_name !== initial.account_name;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/admin/billing-settings`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = data?.error || "Gagal menyimpan";
        if (confirming) setDialogError(msg);
        else showError(msg);
        return;
      }
      if (data?.billing) setForm(data.billing as BillingSettings);
      showSuccess("Rekening pembayaran tersimpan");
      setConfirming(false);
      startTransition(() => router.refresh());
    } catch {
      const msg = "Gagal menyimpan — periksa koneksi";
      if (confirming) setDialogError(msg);
      else showError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-5">
      <div className="mb-1 flex items-center gap-2">
        <Landmark className="size-4 text-neutral-500" aria-hidden />
        <h2 className="font-display text-base font-bold text-neutral-900">
          Rekening pembayaran langganan
        </h2>
      </div>
      <p className="mb-4 text-sm text-neutral-600">
        Ini yang muncul di dialog upgrade seller. Berlaku seketika untuk
        semua toko — invoice yang sudah dibuat tidak berubah.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="bank-name"
          label="Nama bank"
          value={form.bank_name}
          onChange={set("bank_name")}
          placeholder="BCA"
        />
        <Field
          id="account-number"
          label="Nomor rekening"
          value={form.account_number}
          onChange={(v) => set("account_number")(v.replace(/[^0-9]/g, ""))}
          placeholder="2040144776"
          mono
          inputMode="numeric"
        />
        <Field
          id="account-name"
          label="Nama pemilik rekening"
          value={form.account_name}
          onChange={set("account_name")}
          placeholder="Nama sesuai buku tabungan"
        />
        <Field
          id="support-wa"
          label="WhatsApp support"
          value={form.support_whatsapp}
          onChange={set("support_whatsapp")}
          placeholder="08123456789"
          hint="Boleh 08… atau 628… — disimpan dalam format 628…"
          inputMode="tel"
        />
      </div>

      <div className="mt-4">
        <Field
          id="billing-note"
          label="Catatan tambahan"
          value={form.note}
          onChange={set("note")}
          placeholder="Mis. cantumkan nama toko di berita transfer"
          hint="Opsional. Tampil di bawah langkah-langkah transfer."
        />
      </div>

      {accountChanged && (
        <p className="mt-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-neutral-800">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-warning" aria-hidden />
          <span>
            Rekening tujuan berubah. Pastikan nomornya benar — seller akan
            transfer ke sini mulai detik ini juga.
          </span>
        </p>
      )}

      <div className="mt-4 flex items-center justify-end gap-2">
        {pending && (
          <span className="text-xs text-neutral-400">Menyegarkan…</span>
        )}
        <Button
          onClick={() => {
            if (!accountChanged) {
              void save();
              return;
            }
            setDialogError("");
            setConfirming(true);
          }}
          disabled={!dirty || busy}
        >
          {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
          Simpan
        </Button>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => void save()}
        title="Ganti rekening pembayaran?"
        description={`Semua seller akan diminta transfer ke ${form.bank_name} ${form.account_number} a/n ${form.account_name}. Ketik GANTI REKENING untuk melanjutkan.`}
        confirmLabel="Ganti rekening"
        requireTypedPhrase="GANTI REKENING"
        kind="danger"
        busy={busy}
        error={dialogError}
      />
    </Card>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  placeholder,
  hint,
  mono,
  inputMode,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  inputMode?: "numeric" | "tel";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        inputMode={inputMode}
        onChange={(e) => onChange(e.target.value)}
        className={mono ? "font-mono" : undefined}
      />
      {hint && <p className="text-xs text-neutral-500">{hint}</p>}
    </div>
  );
}
