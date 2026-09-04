// Toast helpers — wrap sonner dengan layer "humanize" supaya pesan
// error teknis (HTTP status, JSON error from API, network fail) diubah
// ke bahasa awam Indonesia sebelum tampil ke user.
//
// Pemakaian:
//   import { showError, showSuccess } from "@/lib/toast";
//
//   try {
//     await fetch(...);
//   } catch (err) {
//     showError(err);
//   }
//
//   showSuccess("Tersimpan");

import { toast } from "sonner";

// Map technical error keywords/codes ke pesan ramah Indonesia. Match
// dilakukan secara case-insensitive + substring. Order matters — yang
// spesifik di atas, generic di bawah.
const ERROR_PATTERNS: Array<[RegExp, string]> = [
  [/fetch failed|network/i, "Tidak bisa terhubung ke server. Coba lagi sebentar."],
  [/connection\s*reset|refused|reset by peer/i, "Koneksi terputus. Cek internet kamu, lalu coba lagi."],
  [/timeout|deadline exceeded/i, "Server lama merespon. Coba lagi sebentar."],
  [/\bunauthorized\b|HTTP 401\b/i, "Sesi kamu sudah habis. Silakan login lagi."],
  [/forbidden|403/i, "Kamu tidak punya akses untuk aksi ini."],
  [/not\s*found|404/i, "Data tidak ditemukan."],
  [/conflict|409|duplicate|already exists/i, "Data ini sudah ada sebelumnya."],
  [/payment\s*required|402/i, "Fitur ini hanya tersedia di paket Pro atau Bisnis."],
  [/too many requests|429/i, "Terlalu banyak percobaan. Tunggu sebentar."],
  [/internal\s*server\s*error|500/i, "Ada masalah di sistem kami. Tim sudah ternotifikasi."],
  [/bad\s*gateway|502/i, "Server sedang bermasalah. Coba lagi sebentar."],
  [/service\s*unavailable|503/i, "Layanan sementara tidak tersedia. Coba lagi nanti."],
  [/http\s*\d{3}/i, "Permintaan gagal. Coba lagi."],
];

// Pesan English generic yang dipakai Go API di ratusan handler. Ini lolos
// dari heuristik pass-through di bawah (tidak mengandung "fetch"/"HTTP"/
// dll) sehingga dulu tampil apa adanya di UI berbahasa Indonesia. Dicek
// DULUAN, sebelum pass-through maupun ERROR_PATTERNS.
//
// Key = pesan backend di-lowercase + di-trim (match persis, bukan
// substring, supaya pesan Indonesia yang kebetulan memuat kata ini tetap
// lewat apa adanya).
const BACKEND_MESSAGES: Record<string, string> = {
  "internal error": "Ada masalah di sistem kami. Coba lagi sebentar.",
  "internal server error": "Ada masalah di sistem kami. Coba lagi sebentar.",
  "invalid body": "Data yang dikirim tidak lengkap atau formatnya salah.",
  "invalid request": "Data yang dikirim tidak lengkap atau formatnya salah.",
  "invalid id": "Data yang dituju tidak valid.",
  "id invalid": "Data yang dituju tidak valid.",
  "invalid uuid": "Data yang dituju tidak valid.",
  unauthorized: "Sesi kamu sudah habis. Silakan login lagi.",
  forbidden: "Kamu tidak punya akses untuk aksi ini.",
  "not found": "Data tidak ditemukan.",
  "bad request": "Permintaan tidak valid. Cek lagi isiannya.",
};

// Prefix English yang umum dari Go ("failed to save product", dst).
const BACKEND_PREFIXES: Array<[RegExp, string]> = [
  [/^failed to\b/i, "Aksi gagal diproses. Coba lagi sebentar."],
  [/^could not\b/i, "Aksi gagal diproses. Coba lagi sebentar."],
  [/^cannot\b/i, "Aksi ini tidak bisa dilakukan."],
  [/^missing\b/i, "Ada data wajib yang belum diisi."],
  [/^invalid\b/i, "Data yang dikirim tidak valid."],
];

// humanizeError converts an Error / string / unknown ke pesan ramah.
// Kalau pesan asli sudah berbahasa Indonesia dari backend (mis. "Limit
// produk tier free sudah tercapai..."), itu di-passthrough karena
// sudah human-readable.
export function humanizeError(err: unknown): string {
  const raw = errorMessage(err);
  const key = raw.trim().toLowerCase();

  // 1) Pesan English standar dari Go API — harus dicek sebelum
  //    pass-through, kalau tidak "internal error" / "invalid body" bocor
  //    mentah ke user.
  if (key in BACKEND_MESSAGES) return BACKEND_MESSAGES[key];
  for (const [pattern, friendly] of BACKEND_PREFIXES) {
    if (pattern.test(key)) return friendly;
  }

  // 2) Backend errors yang sudah Indonesian + jelas: pass-through.
  // Heuristik sederhana: ada huruf akar Indonesia + tidak mengandung
  // jejak technical (fetch, HTTP, dll).
  if (raw && !/fetch|HTTP|TypeError|undefined|null/i.test(raw)) {
    return raw;
  }

  for (const [pattern, friendly] of ERROR_PATTERNS) {
    if (pattern.test(raw)) return friendly;
  }

  // Last resort — pesan generic kalau tidak match apapun.
  return "Ada kendala. Coba lagi sebentar.";
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return "";
}

// Show an error toast. Auto-humanizes the message.
export function showError(err: unknown, opts?: { description?: string }) {
  toast.error(humanizeError(err), { description: opts?.description });
}

// Show a success toast.
export function showSuccess(message: string, opts?: { description?: string }) {
  toast.success(message, { description: opts?.description });
}

// Show a neutral info toast (rarely needed — prefer success/error).
export function showInfo(message: string, opts?: { description?: string }) {
  toast(message, { description: opts?.description });
}
