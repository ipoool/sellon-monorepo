"use client";

import { useEffect, useRef, useState } from "react";
import { MapPin, Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { showError } from "@/lib/toast";
import { cn } from "@/lib/utils";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

type CityResult = {
  id: string;
  name: string;
  province: string;
  postal_code: string;
};

type Props = {
  label?: string;
  placeholder?: string;
  selectedID?: string;
  selectedName?: string;
  onChange: (id: string, displayName: string) => void;
  description?: string;
  disabled?: boolean;
};

// CityPicker is a debounced autocomplete backed by the public
// /api/v1/cities/search endpoint (which proxies RajaOngkir). The
// component holds its own input value; the parent only stores the
// resolved (id, displayName).
export function CityPicker({
  label = "Kota",
  placeholder = "Cari kota / kabupaten…",
  selectedID,
  selectedName,
  onChange,
  description,
  disabled,
}: Props) {
  const [query, setQuery] = useState(selectedName ?? "");
  const [results, setResults] = useState<CityResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  // True when /cities/search returns 503 - degrades to plain text input.
  const [noServer, setNoServer] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Re-sync the visible label whenever the parent provides a fresh
  // selectedName (e.g., when initial server data lands).
  useEffect(() => {
    if (selectedName !== undefined && !open) {
      setQuery(selectedName);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedName]);

  // Debounced fetch.
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      void fetch(
        `${apiBase}/api/v1/cities/search?q=${encodeURIComponent(query)}`,
        { signal: ctrl.signal },
      )
        .then(async (r) => {
          if (r.status === 503) {
            // Server has no API key - degrade to plain text input. The
            // parent receives the typed value via the keystroke handler
            // below.
            setNoServer(true);
            setOpen(false);
            setResults([]);
            // Push whatever the user already typed up to the parent
            // (BUG-018). Without this, anything entered before the 503
            // landed stays trapped in the picker's internal `query`
            // state and the parent form sees `city = ""` — causing
            // step 2 of the checkout wizard to falsely block.
            if (query.trim()) onChange("", query);
            return;
          }
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          const data = (await r.json()) as { cities: CityResult[] };
          setNoServer(false);
          setResults(data.cities ?? []);
        })
        .catch((err) => {
          if ((err as Error).name === "AbortError") return;
          showError("Gagal cari kota");
        })
        .finally(() => setLoading(false));
      setLoading(true);
    }, 250);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query, open]);

  // Close dropdown on outside click.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, []);

  function pick(c: CityResult) {
    onChange(c.id, c.name);
    setQuery(c.name);
    setOpen(false);
  }

  function clear() {
    onChange("", "");
    setQuery("");
    setResults([]);
  }

  return (
    <div className="flex flex-col gap-1.5" ref={containerRef}>
      {label && <Label>{label}</Label>}
      <div className="relative">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400"
        >
          {selectedID ? (
            <MapPin className="size-4 text-brand-600" />
          ) : (
            <Search className="size-4" />
          )}
        </span>
        <Input
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            // In degraded mode, propagate keystrokes as plain text so
            // the parent's onChange still fires (id stays empty).
            if (noServer) onChange("", v);
            setOpen(!noServer);
          }}
          onFocus={() => !noServer && setOpen(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-9 pr-9"
        />
        {selectedID && !disabled && (
          <button
            type="button"
            onClick={clear}
            aria-label="Hapus pilihan"
            className="absolute inset-y-0 right-0 flex items-center pr-2 text-neutral-400 hover:text-neutral-700"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}

        {open && (results.length > 0 || loading) && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-lg border border-neutral-200 bg-white shadow-popout"
          >
            {loading && (
              <li className="px-3 py-2 text-sm text-neutral-500">
                Mencari…
              </li>
            )}
                        {!loading && results.length === 0 && query && (
              <li className="px-3 py-2 text-sm text-neutral-500">
                Tidak ada kota cocok.
              </li>
            )}
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => pick(c)}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-brand-50",
                    selectedID === c.id && "bg-brand-50",
                  )}
                >
                  <span className="text-sm font-medium text-neutral-900">
                    {c.name}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {c.province}
                    {c.postal_code ? ` · ${c.postal_code}` : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {noServer ? (
        <p className="rounded-md border border-warning/40 bg-warning/10 px-2.5 py-1.5 text-xs text-neutral-700">
          Kalkulator ongkir belum aktif di toko ini. Lanjut ketik kota apa
          adanya - penjual akan konfirmasi alamat & ongkir lewat WhatsApp.
        </p>
      ) : description ? (
        <p className="text-xs text-neutral-500">{description}</p>
      ) : null}
    </div>
  );
}
