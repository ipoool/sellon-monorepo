"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Plus, Edit2, Trash2, Check, Star, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import type { BankAccount } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const popularBanks = [
  "BCA", "Mandiri", "BRI", "BNI", "BSI", "CIMB Niaga",
  "Permata", "Danamon", "OCBC", "DBS", "Maybank", "Lainnya",
];

type EditState = { mode: "new" } | { mode: "edit"; account: BankAccount } | null;

export function BankAccountsManager() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<EditState>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const res = await fetch(`${apiBase}/api/v1/bank-accounts`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const data = (await res.json()) as { accounts: BankAccount[] };
      setAccounts(data.accounts ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    setBusy(true);
    setError(null);

    const fd = new FormData(e.currentTarget);
    const body = {
      bank_name: String(fd.get("bank_name") ?? "").trim(),
      holder_name: String(fd.get("holder_name") ?? "").trim(),
      account_no: String(fd.get("account_no") ?? "").trim(),
      is_primary: fd.get("is_primary") === "on",
      qris_url: String(fd.get("qris_url") ?? "").trim(),
    };

    try {
      const isEditing = editing.mode === "edit";
      const url = isEditing
        ? `${apiBase}/api/v1/bank-accounts/${editing.account.id}`
        : `${apiBase}/api/v1/bank-accounts`;
      const res = await fetch(url, {
        method: isEditing ? "PUT" : "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setEditing(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan");
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(account: BankAccount) {
    if (!confirm(`Hapus rekening ${account.bank_name} - ${account.account_no}?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/bank-accounts/${account.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal hapus");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-t border-neutral-200 pt-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-neutral-900">
            Rekening Manual & QRIS Statis
          </h3>
          <p className="mt-0.5 text-sm text-neutral-600">
            Untuk pembeli yang transfer manual atau scan QRIS dari foto. Cocok
            untuk free tier yang belum pakai Midtrans.
          </p>
        </div>
        {!editing && (
          <Button
            type="button"
            size="sm"
            onClick={() => setEditing({ mode: "new" })}
          >
            <Plus className="size-4" aria-hidden />
            Tambah
          </Button>
        )}
      </div>

      {/* Existing accounts */}
      {!editing && (
        <>
          {loading ? (
            <p className="text-sm text-neutral-500">Memuat…</p>
          ) : accounts.length === 0 ? (
            <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center">
              <p className="text-sm text-neutral-600">
                Belum ada rekening manual. Tambah minimal satu untuk pembeli
                yang ingin transfer manual.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-2">
              {accounts.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3">
                    {a.qris_url ? (
                      <div className="flex size-12 items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={a.qris_url}
                          alt="QRIS"
                          className="size-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex size-12 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                        <QrCode className="size-5" aria-hidden />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-neutral-900">
                          {a.bank_name || "QRIS Statis"}
                        </p>
                        {a.is_primary && (
                          <Badge variant="brand">
                            <Star className="size-3" aria-hidden />
                            Utama
                          </Badge>
                        )}
                      </div>
                      {a.account_no && (
                        <p className="font-mono text-xs text-neutral-700">
                          {a.account_no} — a.n. {a.holder_name}
                        </p>
                      )}
                      {a.qris_url && !a.account_no && (
                        <p className="text-xs text-neutral-500 break-all">
                          QRIS: {a.qris_url}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing({ mode: "edit", account: a })}
                      disabled={busy}
                    >
                      <Edit2 className="size-3.5" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => onDelete(a)}
                      disabled={busy}
                      className="text-danger hover:bg-danger/10"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {/* Add/edit form */}
      {editing && (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bank_name">Nama Bank</Label>
              <input
                id="bank_name"
                name="bank_name"
                list="bank-list"
                defaultValue={editing.mode === "edit" ? editing.account.bank_name : ""}
                placeholder="BCA, Mandiri, dll. (kosongkan kalau hanya QRIS)"
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
              />
              <datalist id="bank-list">
                {popularBanks.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="account_no">No. Rekening</Label>
              <Input
                id="account_no"
                name="account_no"
                defaultValue={editing.mode === "edit" ? editing.account.account_no : ""}
                placeholder="1234567890"
                className="font-mono"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="holder_name">Nama Pemilik Rekening</Label>
              <Input
                id="holder_name"
                name="holder_name"
                defaultValue={editing.mode === "edit" ? editing.account.holder_name : ""}
                placeholder="Sesuai buku tabungan"
              />
            </div>
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="qris_url">URL Gambar QRIS Statis (opsional)</Label>
              <Input
                id="qris_url"
                name="qris_url"
                type="url"
                defaultValue={editing.mode === "edit" ? editing.account.qris_url : ""}
                placeholder="https://example.com/qris-toko.png"
              />
              <p className="text-xs text-neutral-500">
                Tempel URL gambar QR-nya. Pembeli scan QR ini saat checkout. Upload langsung akan tersedia setelah integrasi storage.
              </p>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-sm">
            <input
              type="checkbox"
              name="is_primary"
              defaultChecked={editing.mode === "edit" ? editing.account.is_primary : accounts.length === 0}
              className="size-4 rounded border-neutral-300 accent-brand-500 focus:ring-brand-500/30"
            />
            <div>
              <p className="font-medium text-neutral-900">Jadikan rekening utama</p>
              <p className="text-xs text-neutral-600">
                Yang ditampilkan paling atas di halaman pembayaran buyer.
              </p>
            </div>
          </label>

          {error && <p className="text-sm font-medium text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              Batal
            </Button>
            <Button type="submit" size="sm" disabled={busy}>
              <Check className="size-4" aria-hidden />
              {busy ? "Menyimpan…" : "Simpan"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
