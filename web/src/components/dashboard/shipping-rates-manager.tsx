"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Plus, Trash2, Truck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { showError, showSuccess } from "@/lib/toast";
import { formatRupiah } from "@/lib/format";
import type { ShippingRate } from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

/** A row being edited. `areasText` is the raw comma-separated input. */
type Draft = {
  name: string;
  priceRp: string;
  eta: string;
  areasText: string;
  isFallback: boolean;
  isActive: boolean;
};

const emptyDraft: Draft = {
  name: "",
  priceRp: "",
  eta: "",
  areasText: "",
  isFallback: false,
  isActive: true,
};

function toDraft(r: ShippingRate): Draft {
  return {
    name: r.name,
    priceRp: r.price_cents ? String(r.price_cents / 100) : "0",
    eta: r.eta,
    areasText: r.areas.join(", "),
    isFallback: r.is_fallback,
    isActive: r.is_active,
  };
}

function toBody(d: Draft, sortOrder: number) {
  return {
    name: d.name.trim(),
    price_cents: Math.max(0, Math.round(Number(d.priceRp || 0) * 100)),
    eta: d.eta.trim(),
    areas: d.isFallback
      ? []
      : d.areasText
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
    is_fallback: d.isFallback,
    is_active: d.isActive,
    sort_order: sortOrder,
  };
}

/**
 * Seller-defined ongkir.
 *
 * The headline rule is stated at the top rather than buried: once one rate
 * is active, automatic couriers disappear from this store's checkout. A
 * seller who adds "Ambil di toko" as an experiment and silently loses JNE
 * would rightly call that a bug.
 */
export function ShippingRatesManager({ initial }: { initial: ShippingRate[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rates, setRates] = useState<ShippingRate[]>(initial);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<ShippingRate | null>(null);

  const activeCount = rates.filter((r) => r.is_active).length;
  const hasFallback = rates.some((r) => r.is_active && r.is_fallback);

  const refresh = () => startTransition(() => router.refresh());

  async function save(id: string | null) {
    const body = toBody(draft, id ? 0 : rates.length + 1);
    if (!body.name) {
      showError("Nama ongkir wajib diisi");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        id ? `${apiBase}/api/v1/shipping-rates/${id}` : `${apiBase}/api/v1/shipping-rates`,
        {
          method: id ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        showError(data?.error || "Gagal menyimpan");
        return;
      }
      const saved = data.rate as ShippingRate;
      setRates((prev) =>
        id ? prev.map((r) => (r.id === id ? saved : r)) : [...prev, saved],
      );
      setAdding(false);
      setEditingId(null);
      setDraft(emptyDraft);
      showSuccess("Ongkir tersimpan");
      refresh();
    } catch {
      showError("Gagal menyimpan — periksa koneksi");
    } finally {
      setBusy(false);
    }
  }

  async function remove(rate: ShippingRate) {
    setBusy(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/shipping-rates/${rate.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        showError(d?.error || "Gagal menghapus");
        return;
      }
      setRates((prev) => prev.filter((r) => r.id !== rate.id));
      setDeleting(null);
      showSuccess("Ongkir dihapus");
      refresh();
    } catch {
      showError("Gagal menghapus — periksa koneksi");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Truck className="size-4 text-neutral-500" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Ongkir Sendiri</h2>
        </div>
        <Badge variant={activeCount > 0 ? "success" : "default"}>
          {activeCount > 0 ? `${activeCount} tarif aktif` : "Belum aktif"}
        </Badge>
      </div>

      <p className="mb-4 text-sm text-neutral-600">
        Tentukan ongkir kamu sendiri per area — misalnya antar dalam kota Rp
        10.000, luar kota Rp 25.000, atau ambil di toko gratis.{" "}
        <strong className="text-neutral-900">
          Selama ada minimal satu tarif aktif, kurir otomatis (JNE, J&amp;T,
          dll) tidak ditampilkan di checkout toko kamu.
        </strong>
      </p>

      {rates.length > 0 && (
        <ul className="mb-4 flex flex-col divide-y divide-neutral-200 rounded-lg border border-neutral-200">
          {rates.map((r) => (
            <li key={r.id} className="px-4 py-3">
              {editingId === r.id ? (
                <RateFields
                  draft={draft}
                  setDraft={setDraft}
                  hasFallback={hasFallback && !r.is_fallback}
                  busy={busy}
                  onSave={() => save(r.id)}
                  onCancel={() => {
                    setEditingId(null);
                    setDraft(emptyDraft);
                  }}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-neutral-900">
                        {r.name}
                      </span>
                      <span className="font-medium text-neutral-900">
                        {formatRupiah(r.price_cents)}
                      </span>
                      {r.eta && (
                        <span className="text-xs text-neutral-500">{r.eta}</span>
                      )}
                      {!r.is_active && <Badge variant="default">Nonaktif</Badge>}
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-xs text-neutral-500">
                      <MapPin className="size-3 shrink-0" aria-hidden />
                      {r.is_fallback
                        ? "Semua area lain"
                        : r.areas.length === 0
                          ? "Semua area"
                          : r.areas.join(", ")}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setAdding(false);
                        setEditingId(r.id);
                        setDraft(toDraft(r));
                      }}
                    >
                      Ubah
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={`Hapus ${r.name}`}
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {adding ? (
        <div className="rounded-lg border border-neutral-200 p-4">
          <RateFields
            draft={draft}
            setDraft={setDraft}
            hasFallback={hasFallback}
            busy={busy}
            onSave={() => save(null)}
            onCancel={() => {
              setAdding(false);
              setDraft(emptyDraft);
            }}
          />
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => {
            setEditingId(null);
            setDraft(emptyDraft);
            setAdding(true);
          }}
        >
          <Plus className="size-4" aria-hidden />
          Tambah tarif ongkir
        </Button>
      )}

      <p className="mt-3 text-xs text-neutral-500">
        Tiap tarif tersimpan sendiri begitu kamu klik Simpan di barisnya.
        Tombol Simpan di bagian bawah halaman mengurusi pengaturan kurir,
        bukan daftar ini.
      </p>
      {pending && <p className="mt-1 text-xs text-neutral-400">Menyegarkan…</p>}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && void remove(deleting)}
        title="Hapus tarif ongkir?"
        description={
          deleting
            ? `"${deleting.name}" akan dihapus. Pesanan yang sudah masuk tidak berubah.`
            : ""
        }
        confirmLabel="Hapus"
        kind="danger"
        busy={busy}
      />
    </Card>
  );
}

function RateFields({
  draft,
  setDraft,
  hasFallback,
  busy,
  onSave,
  onCancel,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  /** Another active fallback already exists, so this one can't be one too. */
  hasFallback: boolean;
  busy: boolean;
  onSave: () => void;
  onCancel: () => void;
}) {
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft({ ...draft, [k]: v });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate-name">Nama</Label>
          <Input
            id="rate-name"
            value={draft.name}
            placeholder="Kurir Toko"
            onChange={(e) => set("name", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate-price">Ongkir (Rp)</Label>
          <Input
            id="rate-price"
            inputMode="numeric"
            value={draft.priceRp}
            placeholder="10000"
            onChange={(e) => set("priceRp", e.target.value.replace(/[^0-9]/g, ""))}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate-eta">Estimasi</Label>
          <Input
            id="rate-eta"
            value={draft.eta}
            placeholder="1 hari"
            onChange={(e) => set("eta", e.target.value)}
          />
        </div>
      </div>

      <div className="flex items-start justify-between gap-3 rounded-lg bg-neutral-50 px-3 py-2.5">
        <div>
          <p className="text-sm font-medium text-neutral-900">
            Berlaku untuk semua area lain
          </p>
          <p className="mt-0.5 text-xs text-neutral-500">
            Dipakai saat kota pembeli tidak ada di tarif mana pun. Hanya boleh
            satu.
          </p>
        </div>
        <Switch
          checked={draft.isFallback}
          disabled={hasFallback && !draft.isFallback}
          onChange={(e) => set("isFallback", e.target.checked)}
          aria-label="Berlaku untuk semua area lain"
        />
      </div>

      {!draft.isFallback && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="rate-areas">Kota / kabupaten yang dilayani</Label>
          <Input
            id="rate-areas"
            value={draft.areasText}
            placeholder="Bandung, Cimahi, Sumedang"
            onChange={(e) => set("areasText", e.target.value)}
          />
          <p className="text-xs text-neutral-500">
            Pisahkan dengan koma. Kosongkan kalau tarif ini berlaku di semua
            kota — misalnya &ldquo;Ambil di toko&rdquo;.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <Switch
            checked={draft.isActive}
            onChange={(e) => set("isActive", e.target.checked)}
            aria-label="Aktif"
          />
          Aktif
        </label>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy}>
            Batal
          </Button>
          <Button size="sm" onClick={onSave} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Simpan
          </Button>
        </div>
      </div>
    </div>
  );
}
