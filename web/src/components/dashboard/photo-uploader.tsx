"use client";

import { useRef, useState } from "react";
import { showError, showSuccess } from "@/lib/toast";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadProductPhoto } from "@/lib/supabase";

type Props = {
  onUploaded: (url: string) => void;
  disabled?: boolean;
};

export function PhotoUploader({ onUploaded, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPending(true);
    try {
      // Upload in parallel — failures are surfaced via Promise.all rejection.
      const urls = await Promise.all(
        Array.from(files).map((file) => uploadProductPhoto(file)),
      );
      for (const { url } of urls) onUploaded(url);
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || pending}
      >
        {pending ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Upload className="size-4" aria-hidden />
        )}
        {pending ? "Mengupload…" : "Upload Foto"}
      </Button>
      <p className="text-xs text-neutral-500">
        JPG/PNG/WebP, maks 5 MB per foto. Bisa pilih beberapa sekaligus.
      </p>
          </div>
  );
}
