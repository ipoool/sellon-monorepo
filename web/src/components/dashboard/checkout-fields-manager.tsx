"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Save, GripVertical, ArrowUp, ArrowDown, Mail, ListPlus } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { showError, showSuccess } from "@/lib/toast";
import type {
  CheckoutConfig,
  CheckoutField,
  CheckoutFieldType,
} from "@/lib/types";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

const FIELD_TYPES: { value: CheckoutFieldType; label: string }[] = [
  { value: "text", label: "Teks singkat" },
  { value: "textarea", label: "Paragraf" },
  { value: "select", label: "Pilihan (dropdown)" },
  { value: "number", label: "Angka" },
  { value: "date", label: "Tanggal" },
  { value: "checkbox", label: "Centang (ya/tidak)" },
];

type Row = CheckoutField & { _cid: string };

export function CheckoutFieldsManager({ initial }: { initial: CheckoutConfig }) {
  const router = useRouter();
  const cid = useRef(0);
  const newCid = () => `c${cid.current++}`;

  const [emailMode, setEmailMode] = useState<CheckoutConfig["email_mode"]>(
    initial.email_mode || "optional",
  );
  const [rows, setRows] = useState<Row[]>(() =>
    (initial.fields ?? []).map((f) => ({ ...f, _cid: newCid() })),
  );
  const [saving, setSaving] = useState(false);

  const update = (cidKey: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r._cid === cidKey ? { ...r, ...patch } : r)));

  const remove = (cidKey: string) =>
    setRows((rs) => rs.filter((r) => r._cid !== cidKey));

  const move = (i: number, dir: -1 | 1) =>
    setRows((rs) => {
      const j = i + dir;
      if (j < 0 || j >= rs.length) return rs;
      const next = [...rs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const add = () =>
    setRows((rs) => [
      ...rs,
      {
        _cid: newCid(),
        key: "",
        label: "",
        type: "text",
        step: "identity",
        required: false,
        placeholder: "",
        options: [],
      },
    ]);

  const save = async () => {
    // Validate: labels required; select needs ≥1 option.
    for (const r of rows) {
      if (!r.label.trim()) {
        showError("Setiap field harus punya nama/label");
        return;
      }
      if (r.type === "select" && r.options.filter((o) => o.trim()).length === 0) {
        showError(`Field "${r.label}" tipe dropdown butuh minimal 1 pilihan`);
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch(`${apiBase}/api/v1/store/checkout-config`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email_mode: emailMode,
          fields: rows.map((r) => ({
            key: r.key,
            label: r.label.trim(),
            type: r.type,
            step: r.step,
            required: r.required,
            placeholder: r.placeholder.trim(),
            options:
              r.type === "select" ? r.options.map((o) => o.trim()).filter(Boolean) : [],
          })),
        }),
      });
      if (res.status === 402) {
        showError("Fitur ini untuk plan Pro/Bisnis");
        return;
      }
      if (!res.ok) {
        showError("Gagal menyimpan");
        return;
      }
      showSuccess("Field checkout disimpan");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Built-in identity fields */}
      <Card>
        <h2 className="font-semibold text-neutral-900">Field bawaan (Identitas)</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Nama & Nomor WhatsApp selalu wajib (dipakai untuk konfirmasi pesanan).
          Atur perilaku Email di bawah.
        </p>
        <label className="mt-4 flex max-w-sm flex-col gap-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-neutral-600">
            <Mail className="size-3.5" aria-hidden /> Email pembeli
          </span>
          <Select
            value={emailMode}
            onChange={(e) => setEmailMode(e.target.value as CheckoutConfig["email_mode"])}
          >
            <option value="optional">Opsional (tampil, tidak wajib)</option>
            <option value="required">Wajib diisi</option>
            <option value="hidden">Sembunyikan</option>
          </Select>
          <span className="text-xs text-neutral-400">
            Catatan: produk digital tetap butuh email untuk kirim link download.
          </span>
        </label>
      </Card>

      {/* Custom fields */}
      <Card>
        <div className="mb-1 flex items-center gap-2">
          <ListPlus className="size-4 text-brand-600" aria-hidden />
          <h2 className="font-semibold text-neutral-900">Field tambahan</h2>
          <span className="text-xs text-neutral-400">{rows.length} field</span>
        </div>
        <p className="mb-4 text-sm text-neutral-500">
          Tambah pertanyaan/isian sesuai kebutuhan toko (mis. Instagram, catatan,
          ukuran, tanggal acara). Bisa ditaruh di langkah Identitas atau Pengiriman.
        </p>

        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-500">
            Belum ada field tambahan.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r, i) => (
              <div key={r._cid} className="rounded-xl border border-neutral-200 p-3">
                <div className="flex items-start gap-2">
                  <div className="mt-2 flex flex-col text-neutral-300">
                    <GripVertical className="size-4" aria-hidden />
                  </div>
                  <div className="grid flex-1 gap-2 sm:grid-cols-2">
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-neutral-500">Nama field</span>
                      <Input
                        value={r.label}
                        onChange={(e) => update(r._cid, { label: e.target.value })}
                        placeholder="mis. Akun Instagram"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-neutral-500">Tipe</span>
                      <Select
                        value={r.type}
                        onChange={(e) =>
                          update(r._cid, { type: e.target.value as CheckoutFieldType })
                        }
                      >
                        {FIELD_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-[11px] font-medium text-neutral-500">Tampil di langkah</span>
                      <Select
                        value={r.step}
                        onChange={(e) =>
                          update(r._cid, { step: e.target.value as CheckoutField["step"] })
                        }
                      >
                        <option value="identity">Identitas</option>
                        <option value="shipping">Pengiriman</option>
                      </Select>
                    </label>
                    {r.type !== "checkbox" && (
                      <label className="flex flex-col gap-1">
                        <span className="text-[11px] font-medium text-neutral-500">Placeholder (opsional)</span>
                        <Input
                          value={r.placeholder}
                          onChange={(e) => update(r._cid, { placeholder: e.target.value })}
                          placeholder="contoh isian / petunjuk"
                        />
                      </label>
                    )}
                    {r.type === "select" && (
                      <label className="flex flex-col gap-1 sm:col-span-2">
                        <span className="text-[11px] font-medium text-neutral-500">
                          Pilihan (satu per baris)
                        </span>
                        <textarea
                          value={r.options.join("\n")}
                          onChange={(e) =>
                            update(r._cid, { options: e.target.value.split("\n") })
                          }
                          rows={3}
                          placeholder={"Merah\nBiru\nHijau"}
                          className="w-full resize-y rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                        />
                      </label>
                    )}
                    <label className="flex items-center gap-2 text-sm text-neutral-700 sm:col-span-2">
                      <Switch
                        checked={r.required}
                        onChange={(e) => update(r._cid, { required: e.target.checked })}
                      />
                      Wajib diisi
                    </label>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(i, -1)}
                      disabled={i === 0}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
                      aria-label="Naik"
                    >
                      <ArrowUp className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, 1)}
                      disabled={i === rows.length - 1}
                      className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-30"
                      aria-label="Turun"
                    >
                      <ArrowDown className="size-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(r._cid)}
                      className="rounded p-1 text-neutral-400 hover:bg-danger/10 hover:text-danger"
                      aria-label="Hapus field"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button variant="outline" size="sm" onClick={add}>
            <Plus className="size-4" aria-hidden />
            Tambah Field
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            <Save className="size-4" aria-hidden />
            {saving ? "Menyimpan..." : "Simpan"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
