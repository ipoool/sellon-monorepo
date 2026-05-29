"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Sparkles, UserPlus, X, ShoppingBag, ScanLine, Award } from "lucide-react";
import { formatRupiah } from "@/lib/format";
import { showError, showSuccess } from "@/lib/toast";
import { usePOS, type LoyaltyCustomer } from "./pos-context";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type Customer = LoyaltyCustomer & { total_spent_cents?: number };

type Props = {
  open: boolean;
  onClose: () => void;
};

export function CustomerPickerModal({ open, onClose }: Props) {
  const {
    loyaltyConfig,
    setLoyaltyCustomer,
    setCustomerName,
    setCustomerWA,
    setDiscount,
  } = usePOS();

  const [mode, setMode] = useState<"search" | "new">("search");
  const [scanCode, setScanCode] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState("");
  const [newWA, setNewWA] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      setMode("search");
      setQuery("");
      setNewName("");
      setNewWA("");
      // Focus search input shortly after dialog open
      setTimeout(() => searchInputRef.current?.focus(), 50);
    }
    if (!open && d.open) d.close();
  }, [open]);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener("cancel", onCancel);
    return () => d.removeEventListener("cancel", onCancel);
  }, [onClose]);

  // Debounced fetch
  useEffect(() => {
    if (!open || mode !== "search") return;
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(
        `${apiBase}/api/v1/pos/customers/search?q=${encodeURIComponent(query.trim())}&limit=20`,
        { credentials: "include" },
      )
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => setResults(d.customers || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, open, mode]);

  const selectExisting = (c: Customer) => {
    setLoyaltyCustomer({
      id: c.id,
      name: c.name,
      whatsapp_number: c.whatsapp_number,
      loyalty_points: c.loyalty_points,
      total_orders: c.total_orders,
    });
    setCustomerName(c.name);
    setCustomerWA(c.whatsapp_number);
    onClose();
  };

  // Scan/type a member card code → resolve customer + auto-apply tier discount.
  const resolveMember = async () => {
    const code = scanCode.trim().toUpperCase();
    if (!code) return;
    try {
      const res = await fetch(
        `${apiBase}/api/v1/pos/members/resolve/${encodeURIComponent(code)}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        showError("Kartu member tidak ditemukan");
        return;
      }
      const { member: m } = await res.json();
      setLoyaltyCustomer({
        id: m.id,
        name: m.name,
        whatsapp_number: m.whatsapp_number,
        loyalty_points: m.loyalty_points,
        total_orders: m.total_orders,
      });
      setCustomerName(m.name);
      setCustomerWA(m.whatsapp_number || "");
      const tier = m.tier_name ? ` ${m.tier_name}` : "";
      if (typeof m.discount_percent === "number" && m.discount_percent > 0) {
        setDiscount({ type: "percent", value: m.discount_percent });
        showSuccess(`Member${tier} — diskon ${m.discount_percent}% diterapkan`);
      } else {
        showSuccess(`Member${tier} terpasang`);
      }
      setScanCode("");
      onClose();
    } catch {
      showError("Gagal membaca kartu member");
    }
  };

  const submitNew = () => {
    const n = newName.trim();
    const wa = newWA.trim();
    if (!n && !wa) return;
    // Walk-in tanpa registrasi: hanya isi nama/WA, tidak set loyaltyCustomer.
    // Sistem POS akan auto-create/link customer via flow lookup waktu order dibuat.
    setLoyaltyCustomer(null);
    setCustomerName(n);
    setCustomerWA(wa);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-label="Pilih pelanggan"
      className="m-auto w-[min(560px,95vw)] max-h-[85vh] rounded-xl border border-neutral-200 bg-white p-0 shadow-popout backdrop:bg-neutral-900/40 backdrop:backdrop-blur-sm"
    >
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
          <div>
            <h2 className="font-display text-base font-semibold text-neutral-900">
              Pilih Pelanggan
            </h2>
            {loyaltyConfig?.enabled && (
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-brand-700">
                <Sparkles className="size-3" aria-hidden />
                Loyalty aktif — pelanggan terdaftar dapat poin otomatis
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100"
            aria-label="Tutup"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-neutral-200 px-5">
          <button
            onClick={() => setMode("search")}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              mode === "search"
                ? "border-brand-700 text-brand-700"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            <Search className="mr-1.5 inline-block size-3.5" aria-hidden />
            Cari Pelanggan
          </button>
          <button
            onClick={() => setMode("new")}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              mode === "new"
                ? "border-brand-700 text-brand-700"
                : "border-transparent text-neutral-500 hover:text-neutral-900"
            }`}
          >
            <UserPlus className="mr-1.5 inline-block size-3.5" aria-hidden />
            Pelanggan Baru
          </button>
        </div>

        {/* Body */}
        {mode === "search" ? (
          <div className="flex flex-col">
            <div className="px-5 pt-4">
              {/* Member card scan: a barcode scanner types fast + sends Enter. */}
              <div className="mb-3 rounded-lg border border-brand-200 bg-brand-50/60 p-2.5">
                <label className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-brand-800">
                  <Award className="size-3.5" aria-hidden />
                  Scan / ketik kode kartu member
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <ScanLine className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-400" aria-hidden />
                    <input
                      type="text"
                      value={scanCode}
                      onChange={(e) => setScanCode(e.target.value.toUpperCase())}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          resolveMember();
                        }
                      }}
                      placeholder="cth. K7M2QF8P"
                      className="h-10 w-full rounded-lg border border-brand-200 bg-white pl-9 pr-3 font-mono text-sm uppercase tracking-widest text-neutral-900 placeholder:font-sans placeholder:tracking-normal placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                    />
                  </div>
                  <button
                    onClick={resolveMember}
                    disabled={!scanCode.trim()}
                    className="rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 disabled:bg-neutral-300"
                  >
                    Pakai
                  </button>
                </div>
              </div>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-neutral-400"
                  aria-hidden
                />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Cari nama atau nomor WhatsApp…"
                  className="h-10 w-full rounded-lg border border-neutral-200 bg-white pl-9 pr-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
              <p className="mt-2 text-[11px] text-neutral-500">
                {query.trim() === ""
                  ? "Menampilkan pelanggan terakhir berbelanja."
                  : `Mencari "${query.trim()}"…`}
              </p>
            </div>

            <div className="max-h-[50vh] min-h-[200px] overflow-y-auto px-5 pb-5 pt-2">
              {loading && results.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-400">
                  Memuat…
                </p>
              ) : results.length === 0 ? (
                <div className="py-10 text-center">
                  <p className="text-sm text-neutral-500">
                    Tidak ada pelanggan yang cocok.
                  </p>
                  <button
                    onClick={() => {
                      setNewName(query.trim());
                      setMode("new");
                    }}
                    className="mt-2 text-xs font-medium text-brand-700 hover:underline"
                  >
                    + Buat pelanggan baru
                  </button>
                </div>
              ) : (
                <ul className="flex flex-col gap-1">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        onClick={() => selectExisting(c)}
                        className="flex w-full items-center justify-between gap-3 rounded-lg border border-transparent px-3 py-2.5 text-left transition-colors hover:border-brand-200 hover:bg-brand-50"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-900">
                            {c.name || "(Tanpa nama)"}
                          </p>
                          <p className="font-mono text-xs text-neutral-500">
                            {c.whatsapp_number || "—"}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-neutral-500">
                            <span className="inline-flex items-center gap-0.5">
                              <ShoppingBag className="size-3" aria-hidden />
                              {c.total_orders} order
                            </span>
                            {typeof c.total_spent_cents === "number" && (
                              <span>•</span>
                            )}
                            {typeof c.total_spent_cents === "number" && (
                              <span>{formatRupiah(c.total_spent_cents)}</span>
                            )}
                          </div>
                        </div>
                        {loyaltyConfig?.enabled && (
                          <div className="shrink-0 rounded-md bg-brand-100 px-2 py-1 text-right">
                            <p className="flex items-center gap-1 text-xs font-bold text-brand-800">
                              <Sparkles className="size-3" aria-hidden />
                              {c.loyalty_points.toLocaleString("id-ID")}
                            </p>
                            <p className="text-[9px] uppercase tracking-wider text-brand-700">
                              poin
                            </p>
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 px-5 py-5">
            <p className="text-xs text-neutral-500">
              Catat nama + nomor WA pembeli untuk struk. Sistem akan otomatis
              membuat profil pelanggan setelah transaksi sukses.
            </p>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Nama Pembeli
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="cth. Budi"
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-neutral-700">
                Nomor WhatsApp
              </label>
              <input
                type="tel"
                value={newWA}
                onChange={(e) => setNewWA(e.target.value)}
                placeholder="cth. 081234567890"
                className="h-10 w-full rounded-lg border border-neutral-200 bg-white px-3 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <button
              onClick={submitNew}
              disabled={!newName.trim() && !newWA.trim()}
              className="mt-1 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:bg-neutral-300"
            >
              Simpan & Lanjutkan
            </button>
          </div>
        )}
      </div>
    </dialog>
  );
}
