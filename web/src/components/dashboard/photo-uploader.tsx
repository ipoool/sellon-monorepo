"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { isSupabaseConfigured, uploadProductPhoto } from "@/lib/supabase";

type Props = {
  onUploaded: (url: string) => void;
  disabled?: boolean;
  // When false (default), the component renders nothing. Caller checks
  // configured() first and falls back to the URL input.
};

export function isPhotoUploadEnabled(): boolean {
  return isSupabaseConfigured();
}

export function PhotoUploader({ onUploaded, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setPending(true);
    setError(null);
    try {
      // Upload sequentially so one bad file doesn't kill the rest.
      for (const file of Array.from(files)) {
        const { url } = await uploadProductPhoto(file);
        onUploaded(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload gagal");
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
      {error && (
        <p className="text-xs font-medium text-danger">{error}</p>
      )}
    </div>
  );
}
