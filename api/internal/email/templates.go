package email

import (
	"fmt"
	"html"
	"strings"
)

// RenderRupiah formats a cents value into "Rp 1.234.567" with thousand
// separators. Exported so callers building email payloads can reuse
// the same formatting that templates use internally.
func RenderRupiah(cents int64) string {
	r := cents / 100
	s := fmt.Sprintf("%d", r)
	// Insert dots from the right.
	n := len(s)
	if n <= 3 {
		return "Rp " + s
	}
	var out strings.Builder
	out.Grow(n + n/3)
	first := n % 3
	if first == 0 {
		first = 3
	}
	out.WriteString(s[:first])
	for i := first; i < n; i += 3 {
		out.WriteByte('.')
		out.WriteString(s[i : i+3])
	}
	return "Rp " + out.String()
}

// === Templates ===

type NewOrderData struct {
	StoreName       string
	OrderNumber     string
	CustomerName    string
	CustomerWA      string
	TotalCents      int64
	ItemSummary     string // pre-formatted, one line per item
	PaymentMethod   string
	OrderDashboardURL string
}

func RenderNewOrder(d NewOrderData) (subject, text, htmlBody string) {
	subject = fmt.Sprintf("[%s] Pesanan baru #%s — %s",
		d.StoreName, d.OrderNumber, RenderRupiah(d.TotalCents))

	text = fmt.Sprintf(`Halo!

Ada pesanan baru masuk di toko %s.

Nomor pesanan : #%s
Pelanggan     : %s
WhatsApp      : %s
Metode bayar  : %s
Total         : %s

Detail produk:
%s

Buka dasbor untuk konfirmasi:
%s

— SellOn
`,
		d.StoreName, d.OrderNumber, d.CustomerName, d.CustomerWA,
		d.PaymentMethod, RenderRupiah(d.TotalCents),
		d.ItemSummary, d.OrderDashboardURL)

	htmlBody = wrapHTML(fmt.Sprintf(`
<h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Pesanan baru masuk 🎉</h2>
<p style="margin:0 0 24px;color:#475569;">Toko <strong>%s</strong> dapat order baru. Berikut detailnya:</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;border-collapse:collapse;background:#f8fafc;border-radius:8px;padding:16px;">
  <tr><td style="padding:6px 12px;color:#64748b;">No. pesanan</td><td style="padding:6px 12px;font-weight:600;color:#0f172a;">#%s</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b;">Pelanggan</td><td style="padding:6px 12px;color:#0f172a;">%s</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b;">WhatsApp</td><td style="padding:6px 12px;color:#0f172a;">%s</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b;">Metode bayar</td><td style="padding:6px 12px;color:#0f172a;">%s</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b;">Total</td><td style="padding:6px 12px;font-weight:700;color:#0f172a;">%s</td></tr>
</table>
<h3 style="margin:24px 0 8px;font-size:14px;text-transform:uppercase;letter-spacing:0.05em;color:#64748b;">Produk</h3>
<pre style="margin:0;white-space:pre-wrap;font-family:inherit;color:#1e293b;background:#f8fafc;padding:12px;border-radius:6px;">%s</pre>
<p style="margin:32px 0 0;text-align:center;">
  <a href="%s" style="display:inline-block;background:#10b981;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Buka dasbor</a>
</p>`,
		html.EscapeString(d.StoreName),
		html.EscapeString(d.OrderNumber),
		html.EscapeString(d.CustomerName),
		html.EscapeString(d.CustomerWA),
		html.EscapeString(d.PaymentMethod),
		html.EscapeString(RenderRupiah(d.TotalCents)),
		html.EscapeString(d.ItemSummary),
		html.EscapeString(d.OrderDashboardURL),
	))
	return
}

type PaymentReceivedData struct {
	StoreName         string
	OrderNumber       string
	CustomerName      string
	TotalCents        int64
	PaymentMethod     string
	OrderDashboardURL string
}

func RenderPaymentReceived(d PaymentReceivedData) (subject, text, htmlBody string) {
	subject = fmt.Sprintf("[%s] Pembayaran #%s diterima ✓",
		d.StoreName, d.OrderNumber)

	text = fmt.Sprintf(`Pembayaran masuk!

Toko       : %s
Pesanan    : #%s
Pelanggan  : %s
Metode     : %s
Jumlah     : %s

Dana sudah masuk ke akun PJP Anda. Pesanan siap diproses.

Buka dasbor:
%s

— SellOn
`,
		d.StoreName, d.OrderNumber, d.CustomerName,
		d.PaymentMethod, RenderRupiah(d.TotalCents), d.OrderDashboardURL)

	htmlBody = wrapHTML(fmt.Sprintf(`
<h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Pembayaran diterima ✓</h2>
<p style="margin:0 0 24px;color:#475569;">Pesanan <strong>#%s</strong> di toko <strong>%s</strong> sudah dibayar — siap diproses.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;border-collapse:collapse;background:#f0fdf4;border-radius:8px;padding:16px;">
  <tr><td style="padding:6px 12px;color:#166534;">Pelanggan</td><td style="padding:6px 12px;color:#0f172a;">%s</td></tr>
  <tr><td style="padding:6px 12px;color:#166534;">Metode bayar</td><td style="padding:6px 12px;color:#0f172a;">%s</td></tr>
  <tr><td style="padding:6px 12px;color:#166534;">Jumlah</td><td style="padding:6px 12px;font-weight:700;color:#0f172a;">%s</td></tr>
</table>
<p style="margin:24px 0 0;color:#475569;font-size:14px;">Dana sudah masuk ke akun PJP Anda sesuai jadwal settlement Midtrans.</p>
<p style="margin:32px 0 0;text-align:center;">
  <a href="%s" style="display:inline-block;background:#10b981;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Buka dasbor</a>
</p>`,
		html.EscapeString(d.OrderNumber),
		html.EscapeString(d.StoreName),
		html.EscapeString(d.CustomerName),
		html.EscapeString(d.PaymentMethod),
		html.EscapeString(RenderRupiah(d.TotalCents)),
		html.EscapeString(d.OrderDashboardURL),
	))
	return
}

// === Digital delivery ===

type DownloadLink struct {
	Name string
	URL  string
}

type DigitalDeliveryData struct {
	StoreName    string
	OrderNumber  string
	CustomerName string
	Links        []DownloadLink
}

func RenderDigitalDelivery(d DigitalDeliveryData) (subject, text, htmlBody string) {
	subject = fmt.Sprintf("[%s] Pesanan #%s siap diakses ✓",
		d.StoreName, d.OrderNumber)

	var textLinks strings.Builder
	for _, l := range d.Links {
		textLinks.WriteString("• ")
		textLinks.WriteString(l.Name)
		textLinks.WriteString("\n  ")
		textLinks.WriteString(l.URL)
		textLinks.WriteString("\n\n")
	}

	text = fmt.Sprintf(`Halo %s,

Pesanan kamu di %s sudah dibayar. Berikut link akses produk-mu:

%s

Link bersifat pribadi — jangan dibagikan. Tetap bisa diakses kapan saja
selama tab/tab terbuka.

Selamat menikmati!

— %s
`, d.CustomerName, d.StoreName, textLinks.String(), d.StoreName)

	var htmlLinks strings.Builder
	for _, l := range d.Links {
		htmlLinks.WriteString(fmt.Sprintf(`
<div style="margin:0 0 16px;padding:14px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;">
  <p style="margin:0 0 8px;font-weight:600;color:#0f172a;">%s</p>
  <a href="%s" style="display:inline-block;background:#10b981;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;font-weight:600;font-size:14px;">Buka halaman download →</a>
</div>`,
			html.EscapeString(l.Name),
			html.EscapeString(l.URL),
		))
	}

	htmlBody = wrapHTML(fmt.Sprintf(`
<h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Pesanan-mu siap diakses ✓</h2>
<p style="margin:0 0 24px;color:#475569;">Halo <strong>%s</strong>, pesanan <strong>#%s</strong> di toko <strong>%s</strong> sudah lunas. Klik link di bawah untuk mengakses produk:</p>
%s
<p style="margin:24px 0 0;color:#475569;font-size:13px;">Link bersifat pribadi — jangan dibagikan. Kalau ada masalah, balas saja email ini.</p>`,
		html.EscapeString(d.CustomerName),
		html.EscapeString(d.OrderNumber),
		html.EscapeString(d.StoreName),
		htmlLinks.String(),
	))
	return
}

// wrapHTML wraps a body fragment in a minimal email-safe shell — wide
// WrapHTML adalah versi exported dari wrapHTML — bisa dipanggil dari
// package lain (mis. handler) untuk re-use chrome SellOn yang sama.
func WrapHTML(body string) string { return wrapHTML(body) }

// table backgrounds, no JS, inline styles only. Tested-in-the-wild
// across Gmail, Outlook web, and Apple Mail.
func wrapHTML(body string) string {
	return `<!doctype html>
<html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;max-width:560px;width:100%;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.05);">
        <tr><td style="padding-bottom:16px;border-bottom:1px solid #e2e8f0;">
          <span style="font-weight:700;font-size:18px;color:#0f172a;">SellOn</span>
        </td></tr>
        <tr><td style="padding-top:24px;padding-bottom:28px;">
          ` + body + `
        </td></tr>
        <tr><td style="padding-top:24px;padding-bottom:4px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:12px;line-height:1.5;">
          Email ini dikirim otomatis oleh SellOn. Kalau ada pertanyaan, balas saja email ini.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

// === Staff invitation ===

type StaffInviteData struct {
	StoreName    string
	InviterName  string
	InviteeEmail string
	Role         string // "Staf" or "Admin"
	LoginURL     string
	ExpiryDays   int
}

func RenderStaffInvite(d StaffInviteData) (subject, text, htmlBody string) {
	subject = fmt.Sprintf("[%s] Kamu diundang bergabung sebagai %s Toko",
		d.StoreName, d.Role)

	accessDesc := "mengelola seluruh operasional toko"
	if d.Role == "Staf" {
		accessDesc = "mengelola pesanan dan produk toko"
	}

	text = fmt.Sprintf(`Halo!

%s mengundangmu untuk bergabung sebagai %s di toko "%s".

Sebagai %s, kamu bisa %s.

Cara bergabung:
1. Klik link di bawah (atau buka %s)
2. Login dengan akun Google yang menggunakan email %s
3. Kamu akan langsung masuk sebagai %s toko ini

%s

Undangan ini berlaku selama %d hari sejak dikirim.
Jika sudah kadaluarsa, minta pemilik toko untuk mengundang ulang.

— Tim SellOn
`,
		d.InviterName, d.Role, d.StoreName,
		d.Role, accessDesc,
		d.LoginURL, d.InviteeEmail, d.Role,
		d.LoginURL,
		d.ExpiryDays,
	)

	htmlBody = wrapHTML(fmt.Sprintf(`
<h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Kamu diundang! 🎉</h2>
<p style="margin:0 0 20px;color:#475569;">
  <strong>%s</strong> mengundangmu untuk bergabung sebagai <strong>%s</strong>
  di toko <strong>%s</strong>.
</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;border-collapse:collapse;background:#f8fafc;border-radius:8px;padding:16px;margin:0 0 24px;">
  <tr><td style="padding:6px 12px;color:#64748b;">Toko</td><td style="padding:6px 12px;font-weight:600;color:#0f172a;">%s</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b;">Role</td><td style="padding:6px 12px;color:#0f172a;">%s</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b;">Akses</td><td style="padding:6px 12px;color:#0f172a;">%s</td></tr>
  <tr><td style="padding:6px 12px;color:#64748b;">Email login</td><td style="padding:6px 12px;font-family:monospace;color:#0f172a;">%s</td></tr>
</table>

<h3 style="margin:0 0 12px;font-size:15px;color:#0f172a;">Cara bergabung:</h3>
<ol style="margin:0 0 24px;padding-left:20px;color:#334155;line-height:1.8;">
  <li>Klik tombol <strong>"Gabung ke Toko"</strong> di bawah</li>
  <li>Login dengan akun Google yang menggunakan email <strong>%s</strong></li>
  <li>Kamu akan langsung masuk sebagai <strong>%s</strong> toko ini</li>
</ol>

<p style="margin:0 0 28px;text-align:center;">
  <a href="%s" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">Gabung ke Toko →</a>
</p>

<p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
  Undangan ini berlaku <strong>%d hari</strong> sejak dikirim. Jika sudah kadaluarsa,
  minta pemilik toko untuk mengundang ulang.
</p>`,
		html.EscapeString(d.InviterName),
		html.EscapeString(d.Role),
		html.EscapeString(d.StoreName),
		html.EscapeString(d.StoreName),
		html.EscapeString(d.Role),
		html.EscapeString(accessDesc),
		html.EscapeString(d.InviteeEmail),
		html.EscapeString(d.InviteeEmail),
		html.EscapeString(d.Role),
		html.EscapeString(d.LoginURL),
		d.ExpiryDays,
	))
	return
}
