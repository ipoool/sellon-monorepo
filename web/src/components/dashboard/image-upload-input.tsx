"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Upload, Loader2, X, ImageIcon, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImage, type UploadKind } from "@/lib/supabase";
import { showError } from "@/lib/toast";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (url: string) => void;
  kind: UploadKind;
  // Visual hint for placeholder height. "square" works for logo/QRIS,
  // "wide" for banners.
  shape?: "square" | "wide";
  label?: string;
  disabled?: boolean;
};

export function ImageUploadInput({
  value,
  onChange,
  kind,
  shape = "square",
  disabled,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  // Track per-URL broken state lewat React (bukan style.display mutation
  // langsung di DOM) supaya saat user upload ulang dengan URL baru,
  // state reset otomatis dan image baru bisa render.
  const [broken, setBroken] = useState(false);
  useEffect(() => {
    setBroken(false);
  }, [value]);

  // FE cap: logo + banner tidak boleh > 5 MB. Untuk product backend
  // sudah compress jadi cap di-skip (file besar di-resize otomatis).
  // QRIS / general dibatasi sama 5 MB juga supaya konsisten.
  const FE_MAX_BYTES = 5 * 1024 * 1024;
  const feCapped = kind !== "product";

  async function handleFile(file: File | undefined) {
    if (!file) return;

    if (feCapped && file.size > FE_MAX_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      showError(
        `Ukuran ${mb} MB melebihi batas 5 MB. Pakai gambar lebih kecil.`,
      );
      if (inputRef.current) inputRef.current.value = "";
      return;
    }

    setPending(true);
    try {
      const { url } = await uploadImage(file, kind);
      onChange(url);
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const isWide = shape === "wide";
  // Wide banner: full width sampai max ~md supaya tetap punya tinggi
  // dari aspect-ratio. Tanpa width explicit, Image fill di parent
  // tanpa intrinsic width = 0×0 (banner gak muncul setelah upload).
  // Square logo: width fix supaya thumbnail rapi di samping tombol.
  const aspect = isWide
    ? "aspect-[3/1] w-full sm:max-w-md"
    : "aspect-square w-32 sm:w-40";

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />

      {value ? (
        <div
          className={cn(
            "flex flex-col gap-2",
            // Square (logo): preview + tombol side-by-side di desktop.
            // Wide (banner): selalu stacked agar lebar banner penuh.
            !isWide && "sm:flex-row sm:items-center",
          )}
        >
          <div
            className={cn(
              "relative shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100",
              aspect,
            )}
          >
            {broken ? (
              <div className="flex size-full flex-col items-center justify-center gap-1 bg-neutral-100 text-neutral-500">
                <ImageOff className="size-5" aria-hidden />
                <span className="text-[10px] font-medium">
                  Gambar gagal dimuat
                </span>
              </div>
            ) : (
              <Image
                key={value}
                src={value}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 320px"
                className="object-cover"
                onError={() => setBroken(true)}
              />
            )}
            <button
              type="button"
              onClick={() => onChange("")}
              disabled={disabled || pending}
              className="absolute right-1.5 top-1.5 flex size-7 items-center justify-center rounded-full bg-neutral-900/70 text-white transition-colors hover:bg-danger"
              aria-label="Hapus gambar"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={disabled || pending}
            >
              {pending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Upload className="size-4" aria-hidden />
              )}
              {pending ? "Mengupload…" : "Ganti"}
            </Button>
            <p className="text-xs text-neutral-500">
              JPG/PNG/WebP, maks 5 MB.
            </p>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled || pending}
          className={cn(
            "flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-neutral-200 bg-neutral-50 p-6 text-sm text-neutral-600 transition-colors hover:border-brand-400 hover:bg-brand-50/30",
            shape === "wide" ? "aspect-[3/1] w-full" : "w-32 sm:w-40 aspect-square",
            disabled && "cursor-not-allowed opacity-50 hover:border-neutral-200 hover:bg-neutral-50",
          )}
        >
          {pending ? (
            <Loader2 className="size-6 animate-spin text-neutral-400" aria-hidden />
          ) : (
            <ImageIcon className="size-6 text-neutral-400" aria-hidden />
          )}
          <span className="text-xs font-medium">
            {pending ? "Mengupload…" : "Pilih file"}
          </span>
        </button>
      )}

    </div>
  );
}
