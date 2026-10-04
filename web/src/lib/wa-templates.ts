/**
 * Default bodies for the seller's WhatsApp message templates.
 *
 * These live here because TWO places need the same text and used to keep
 * their own copy: Pengaturan → WhatsApp renders them in the editor, and the
 * order detail page sends them whenever the seller has not customised that
 * key. The copies drifted the first time one was edited — the editor showed a
 * body with the order link in it while the message actually sent did not.
 *
 * Placeholders are filled by `fillTemplate` (lib/whatsapp.ts). Buyer-facing
 * templates use Indonesian variable names; `order_link` is the exception,
 * kept as-is because the owner alert template and the in-app guides already
 * document that spelling.
 */
export const WA_TEMPLATE_DEFAULTS = {
  new_order_alert: `🛒 *Pesanan baru!*

No: *{{order_number}}*
Dari: {{customer_name}} ({{customer_whatsapp}})
Total: *Rp {{total}}*
Metode bayar: {{payment_method}}

Lihat detail: {{order_link}}`,

  order_confirmation: `Hai {{nama_pembeli}}! 👋

Pesananmu sudah masuk:

📦 Pesanan: {{nomor_pesanan}}
{{ringkasan_produk}}

💰 Total: {{total}}
🚚 Kurir: {{kurir}}

Cek status pesanan kamu di sini:
{{order_link}}

Terima kasih sudah pesan di {{nama_toko}}.`,

  payment_link: `Halo {{nama_pembeli}}, ini link pembayaran untuk pesanan {{nomor_pesanan}}:

{{link_pembayaran}}

Total: {{total}}`,

  shipping_update: `Halo {{nama_pembeli}}! Pesananmu {{nomor_pesanan}} sudah saya kirim. 📦

🚚 Kurir: {{kurir}}
📋 Nomor Resi: {{nomor_resi}}

Estimasi sampai 2-4 hari. Makasih! 🙏`,
} as const;

export type WATemplateKey = keyof typeof WA_TEMPLATE_DEFAULTS;
