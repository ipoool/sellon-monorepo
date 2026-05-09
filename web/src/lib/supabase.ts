// Browser-side helpers for image uploads. The actual upload happens on
// the Go API (which holds the Supabase service key); this module only
// POSTs the file as multipart/form-data and surfaces any configuration /
// size / mime errors.

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export type UploadKind =
  | "product"
  | "logo"
  | "banner"
  | "qris"
  | "general";

export type UploadResult = {
  url: string;
  path: string;
};

export async function uploadImage(
  file: File,
  kind: UploadKind = "general",
): Promise<UploadResult> {
  if (!file.type.startsWith("image/")) {
    throw new Error("File harus berupa gambar (JPG/PNG/WebP)");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Ukuran maks 5 MB");
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("kind", kind);

  const res = await fetch(`${apiBase}/api/v1/uploads/image`, {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error ||
        (res.status === 503
          ? "Upload belum dikonfigurasi di server"
          : `Upload gagal (HTTP ${res.status})`),
    );
  }
  return { url: data.url, path: data.path };
}

// Backwards-compatible alias for the previous product-photo helper.
export const uploadProductPhoto = (file: File) => uploadImage(file, "product");
