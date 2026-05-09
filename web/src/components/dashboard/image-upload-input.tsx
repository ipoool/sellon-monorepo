"use client";

import { useRef, useState } from "react";
import { Upload, Loader2, X, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadImage, type UploadKind } from "@/lib/supabase";
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
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const { url } = await uploadImage(file, kind);
      onChange(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload gagal");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const aspect =
    shape === "wide" ? "aspect-[3/1]" : "aspect-square w-32 sm:w-40";

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
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div
            className={cn(
              "relative shrink-0 overflow-hidden rounded-lg border border-neutral-200 bg-neutral-100",
              aspect,
            )}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={value}
              alt=""
              className="size-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
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

      {error && <p className="text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}
