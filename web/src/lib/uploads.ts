// Browser-side helpers for file uploads. The actual upload happens on the Go
// API, which holds the object-storage credentials — they never reach the
// browser. This module only POSTs the file as multipart/form-data and
// surfaces configuration / size / mime errors.
//
// Storage backend is S3-compatible (see api/internal/storage). The endpoint
// contract is unchanged from the Supabase era: POST /uploads/image or
// /uploads/file, response {url, path}.

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

  return postUpload(`${apiBase}/api/v1/uploads/image`, fd);
}

// Digital deliverables (produk digital) are NOT images: they go to a separate
// endpoint that skips the image compression pipeline (which would re-encode a
// PDF/zip into a broken JPEG) and allows a bigger payload.
export const DIGITAL_FILE_MAX_BYTES = 25 * 1024 * 1024;

// Accept list for the <input type="file"> — mirrors the backend's sniffed
// content-type allowlist. The server still validates by magic bytes.
export const DIGITAL_FILE_ACCEPT =
  ".pdf,.zip,.epub,.mp3,.mp4,.png,.jpg,.jpeg,.webp,.csv,.txt";

export async function uploadDigitalFile(file: File): Promise<UploadResult> {
  if (file.size > DIGITAL_FILE_MAX_BYTES) {
    throw new Error("Ukuran maks 25 MB");
  }
  const fd = new FormData();
  fd.append("file", file);
  return postUpload(`${apiBase}/api/v1/uploads/file`, fd);
}

// postUpload POSTs a multipart body and normalizes the error shape shared by
// both upload endpoints.
async function postUpload(url: string, fd: FormData): Promise<UploadResult> {
  const res = await fetch(url, {
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

// deleteUploaded fires a best-effort delete on the storage object that
// `url` points to. Callers should not block UX on this — Promise yang
// gagal di-swallow (404/500/network). Backend has a cross-tenant guard.
export async function deleteUploaded(url: string): Promise<void> {
  if (!url) return;
  try {
    await fetch(`${apiBase}/api/v1/uploads/delete`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });
  } catch {
    // Swallow — orphan file di storage tidak mempengaruhi user flow.
  }
}
