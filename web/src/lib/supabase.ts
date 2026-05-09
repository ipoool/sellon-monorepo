import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export const SUPABASE_PRODUCTS_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_PRODUCTS_BUCKET || "products";

// Lazy singleton — created on first call so the module is import-safe even
// when env vars are missing (the produk-form just falls back to URL input).
let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

export function getSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) client = createClient(url!, anonKey!);
  return client;
}

// Random object key. Bucket should be PUBLIC so the resulting public URL
// can be embedded directly in <img src>.
function randomKey(file: File): string {
  const ext = file.name.includes(".")
    ? file.name.split(".").pop()!.toLowerCase()
    : "jpg";
  const stamp = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${stamp}-${rand}.${ext}`;
}

export type UploadResult = {
  url: string;
  path: string;
};

export async function uploadProductPhoto(file: File): Promise<UploadResult> {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase belum dikonfigurasi");
  if (!file.type.startsWith("image/")) {
    throw new Error("File harus berupa gambar (JPG/PNG/WebP)");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Ukuran maks 5 MB");
  }
  const path = randomKey(file);
  const { error } = await sb.storage
    .from(SUPABASE_PRODUCTS_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
  if (error) throw new Error(error.message);
  const { data } = sb.storage
    .from(SUPABASE_PRODUCTS_BUCKET)
    .getPublicUrl(path);
  return { url: data.publicUrl, path };
}
