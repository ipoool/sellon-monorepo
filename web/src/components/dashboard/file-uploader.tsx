"use client";

import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { showError } from "@/lib/toast";
import {
  DIGITAL_FILE_ACCEPT,
  DIGITAL_FILE_MAX_BYTES,
  uploadDigitalFile,
} from "@/lib/uploads";

type Props = {
  onUploaded: (url: string, fileName: string) => void;
  disabled?: boolean;
  label?: string;
};

// FileUploader uploads ONE digital deliverable (PDF, ZIP/EPUB, MP3, MP4,
// gambar, atau teks) via /uploads/file. Deliberately separate from
// PhotoUploader: that one only accepts images and the backend re-encodes them
// to JPEG, which would corrupt any non-image deliverable.
export function FileUploader({ onUploaded, disabled, label }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);

  async function handleFile(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    setPending(true);
    try {
      const { url } = await uploadDigitalFile(file);
      onUploaded(url, file.name);
    } catch (err) {
      showError(err);
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const maxMB = Math.round(DIGITAL_FILE_MAX_BYTES / (1024 * 1024));

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={inputRef}
        type="file"
        accept={DIGITAL_FILE_ACCEPT}
        className="hidden"
        onChange={(e) => handleFile(e.target.files)}
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
        {pending ? "Mengupload…" : (label ?? "Upload File")}
      </Button>
      <p className="text-xs text-neutral-500">
        PDF, ZIP/EPUB, MP3, MP4, gambar, atau teks (TXT/CSV). Maks {maxMB} MB.
      </p>
    </div>
  );
}
