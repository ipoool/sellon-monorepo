"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useState,
} from "react";
import { Plus, Trash2, Star, QrCode } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ImageUploadInput } from "@/components/dashboard/image-upload-input";
import type { BankAccount } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const popularBanks = [
  "BCA", "Mandiri", "BRI", "BNI", "BSI", "CIMB Niaga",
  "Permata", "Danamon", "OCBC", "DBS", "Maybank", "Lainnya",
];

// One row of the inline editor. `id` is set for rows that came from the
// server; absent for unsaved drafts. `_deleted` marks server rows the user
// removed (kept in state so flush() knows to DELETE them).
type Draft = {
  key: string;
  id?: string;
  bank_name: string;
  holder_name: string;
  account_no: string;
  qris_url: string;
  is_primary: boolean;
  _initial?: BankAccount;
  _deleted?: boolean;
};

function emptyDraft(isFirst: boolean): Draft {
  return {
    key: `tmp-${Math.random().toString(36).slice(2, 10)}`,
    bank_name: "",
    holder_name: "",
    account_no: "",
    qris_url: "",
    is_primary: isFirst,
  };
}

function fromServer(a: BankAccount): Draft {
  return {
    key: a.id,
    id: a.id,
    bank_name: a.bank_name,
    holder_name: a.holder_name,
    account_no: a.account_no,
    qris_url: a.qris_url,
    is_primary: a.is_primary,
    _initial: a,
  };
}

function isDirty(d: Draft): boolean {
  if (!d._initial) return true; // new
  return (
    d.bank_name !== d._initial.bank_name ||
    d.holder_name !== d._initial.holder_name ||
    d.account_no !== d._initial.account_no ||
    d.qris_url !== d._initial.qris_url ||
    d.is_primary !== d._initial.is_primary
  );
}

export type BankAccountsManagerHandle = {
  flush: () => Promise<void>;
};

// Imperative-handle pattern lets the parent PaymentForm trigger a sync
// from its own submit handler — the user only sees one Simpan button for
// the whole Pembayaran page.
export const BankAccountsManager = forwardRef<BankAccountsManagerHandle>(
  function BankAccountsManager(_props, ref) {
    const [drafts, setDrafts] = useState<Draft[]>([]);
    const [loading, setLoading] = useState(true);

    async function refresh() {
      try {
        const res = await fetch(`${apiBase}/api/v1/bank-accounts`, {
          credentials: "include",
        });
        if (!res.ok) return;
        const data = (await res.json()) as { accounts: BankAccount[] };
        setDrafts((data.accounts ?? []).map(fromServer));
      } finally {
        setLoading(false);
      }
    }

    useEffect(() => {
      void refresh();
    }, []);

    function update(idx: number, patch: Partial<Draft>) {
      setDrafts((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], ...patch };
        // If is_primary toggled on, demote others.
        if (patch.is_primary === true) {
          for (let i = 0; i < next.length; i++) {
            if (i !== idx) next[i] = { ...next[i], is_primary: false };
          }
        }
        return next;
      });
    }

    function remove(idx: number) {
      setDrafts((prev) => {
        const d = prev[idx];
        if (!d) return prev;
        // For server rows, keep but mark deleted so flush() can DELETE
        // them. For unsaved drafts, drop in place.
        if (!d.id) return prev.filter((_, i) => i !== idx);
        const next = [...prev];
        next[idx] = { ...d, _deleted: true };
        return next;
      });
    }

    function add() {
      setDrafts((prev) => {
        const visible = prev.filter((d) => !d._deleted);
        return [...prev, emptyDraft(visible.length === 0)];
      });
    }

    useImperativeHandle(ref, () => ({
      async flush() {
        const ops: Promise<Response>[] = [];
        for (const d of drafts) {
          if (d._deleted && d.id) {
            ops.push(
              fetch(`${apiBase}/api/v1/bank-accounts/${d.id}`, {
                method: "DELETE",
                credentials: "include",
              }),
            );
            continue;
          }
          if (d._deleted) continue;
          // Skip blank unsaved drafts.
          if (!d.id) {
            const blank =
              !d.bank_name.trim() &&
              !d.account_no.trim() &&
              !d.qris_url.trim();
            if (blank) continue;
          }
          if (!isDirty(d)) continue;
          const body = {
            bank_name: d.bank_name.trim(),
            holder_name: d.holder_name.trim(),
            account_no: d.account_no.trim(),
            qris_url: d.qris_url.trim(),
            is_primary: d.is_primary,
          };
          if (d.id) {
            ops.push(
              fetch(`${apiBase}/api/v1/bank-accounts/${d.id}`, {
                method: "PUT",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }),
            );
          } else {
            ops.push(
              fetch(`${apiBase}/api/v1/bank-accounts`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
              }),
            );
          }
        }
        const responses = await Promise.all(ops);
        for (const r of responses) {
          if (!r.ok) {
            const data = await r.json().catch(() => ({}));
            throw new Error(data.error || `HTTP ${r.status}`);
          }
        }
        await refresh();
      },
    }));

    const visibleDrafts = drafts
      .map((d, i) => ({ d, i }))
      .filter(({ d }) => !d._deleted);

    return (
      <section className="border-t border-neutral-200 pt-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold text-neutral-900">
              Rekening Manual & QRIS Statis
            </h3>
            <p className="mt-0.5 text-sm text-neutral-600">
              Untuk pembeli yang transfer manual atau scan QRIS dari foto.
              Cocok untuk free tier yang belum pakai Midtrans.
            </p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={add}>
            <Plus className="size-4" aria-hidden />
            Tambah
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Memuat…</p>
        ) : visibleDrafts.length === 0 ? (
          <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center">
            <p className="text-sm text-neutral-600">
              Belum ada rekening manual. Tambah minimal satu untuk pembeli
              yang ingin transfer manual.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {visibleDrafts.map(({ d, i }) => (
              <li
                key={d.key}
                className="rounded-lg border border-neutral-200 bg-white p-4"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <QrCode
                      className="size-4 text-neutral-400"
                      aria-hidden
                    />
                    <p className="font-medium text-neutral-900">
                      {d.bank_name || "Rekening / QRIS baru"}
                    </p>
                    {d.is_primary && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                        <Star className="size-3" aria-hidden />
                        Utama
                      </span>
                    )}
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(i)}
                    className="text-danger hover:bg-danger/10"
                    aria-label="Hapus rekening"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </Button>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`bank_name_${d.key}`}>Nama Bank</Label>
                    <input
                      id={`bank_name_${d.key}`}
                      list={`bank-list-${d.key}`}
                      value={d.bank_name}
                      onChange={(e) =>
                        update(i, { bank_name: e.target.value })
                      }
                      placeholder="BCA, Mandiri, dll. (kosongkan kalau hanya QRIS)"
                      className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                    />
                    <datalist id={`bank-list-${d.key}`}>
                      {popularBanks.map((b) => (
                        <option key={b} value={b} />
                      ))}
                    </datalist>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`account_no_${d.key}`}>No. Rekening</Label>
                    <Input
                      id={`account_no_${d.key}`}
                      value={d.account_no}
                      onChange={(e) =>
                        update(i, { account_no: e.target.value })
                      }
                      placeholder="1234567890"
                      className="font-mono"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label htmlFor={`holder_name_${d.key}`}>
                      Nama Pemilik Rekening
                    </Label>
                    <Input
                      id={`holder_name_${d.key}`}
                      value={d.holder_name}
                      onChange={(e) =>
                        update(i, { holder_name: e.target.value })
                      }
                      placeholder="Sesuai buku tabungan"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5 sm:col-span-2">
                    <Label>Gambar QRIS Statis (opsional)</Label>
                    <ImageUploadInput
                      value={d.qris_url}
                      onChange={(url) => update(i, { qris_url: url })}
                      kind="qris"
                      shape="square"
                    />
                  </div>
                </div>

                <label className="mt-3 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-sm">
                  <div>
                    <p className="font-medium text-neutral-900">
                      Jadikan rekening utama
                    </p>
                    <p className="text-xs text-neutral-600">
                      Yang ditampilkan paling atas di halaman pembayaran buyer.
                    </p>
                  </div>
                  <Switch
                    size="sm"
                    checked={d.is_primary}
                    onChange={(e) =>
                      update(i, { is_primary: e.target.checked })
                    }
                  />
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  },
);
