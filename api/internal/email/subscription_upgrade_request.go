package email

import (
	"fmt"
	"html"
)

// UpgradeRequestData drives the confirmation sent when a seller submits a
// manual-transfer upgrade request.
//
// Two audiences read the same message. The seller gets a receipt telling
// them the request is recorded and what happens next; the billing inbox is
// BCC'd, and for whoever is on that side this is the work item — so the
// store, the owner's contact details and whether a proof was attached all
// have to be in the body, not just in the dashboard.
type UpgradeRequestData struct {
	StoreName    string
	StoreSlug    string
	OwnerName    string
	OwnerEmail   string
	PlanLabel    string
	Months       int
	AmountCents  int64
	InvoiceID    string
	ProofURL     string // "" when the seller sent no receipt
	AdminURL     string // /platform/subscriptions
	DashboardURL string
}

func RenderSubscriptionUpgradeRequest(d UpgradeRequestData) (subject, text, htmlBody string) {
	subject = fmt.Sprintf("Permintaan upgrade %s — %s (%s)",
		d.PlanLabel, d.StoreName, RenderRupiah(d.AmountCents))

	proofLine := "Bukti transfer : belum dilampirkan"
	if d.ProofURL != "" {
		proofLine = "Bukti transfer : terlampir — " + d.ProofURL
	}

	text = fmt.Sprintf(`Permintaan upgrade tercatat.

Toko           : %s (/%s)
Pemilik        : %s <%s>
Paket          : %s
Durasi         : %d bulan
Nominal        : %s
%s
No. transaksi  : %s

Tim akan cek pembayaran dan mengaktifkan paket dalam 1x24 jam. Kamu tidak
perlu mengirim ulang permintaan ini.

Cek status langganan:
%s

— SellOn
`,
		d.StoreName, d.StoreSlug,
		d.OwnerName, d.OwnerEmail,
		d.PlanLabel, d.Months, RenderRupiah(d.AmountCents),
		proofLine, d.InvoiceID, d.DashboardURL)

	proofHTML := `<tr><td style="padding:6px 12px;color:#166534;">Bukti transfer</td><td style="padding:6px 12px;color:#b45309;">Belum dilampirkan</td></tr>`
	if d.ProofURL != "" {
		// Linked, not inlined: the receipt is a private-bucket object served
		// through the API proxy, and Gmail strips most remote images by
		// default anyway. The admin page renders it properly.
		proofHTML = fmt.Sprintf(
			`<tr><td style="padding:6px 12px;color:#166534;">Bukti transfer</td><td style="padding:6px 12px;"><a href="%s" style="color:#10b981;font-weight:600;">Lihat bukti transfer</a></td></tr>`,
			html.EscapeString(d.ProofURL))
	}

	htmlBody = wrapHTML(fmt.Sprintf(`
<h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Permintaan upgrade tercatat</h2>
<p style="margin:0 0 24px;color:#475569;">Paket <strong>%s</strong> untuk <strong>%s</strong> sedang menunggu verifikasi pembayaran.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;border-collapse:collapse;background:#f0fdf4;border-radius:8px;padding:16px;">
  <tr><td style="padding:6px 12px;color:#166534;">Toko</td><td style="padding:6px 12px;color:#0f172a;">%s <span style="color:#64748b;">/%s</span></td></tr>
  <tr><td style="padding:6px 12px;color:#166534;">Pemilik</td><td style="padding:6px 12px;color:#0f172a;">%s &lt;%s&gt;</td></tr>
  <tr><td style="padding:6px 12px;color:#166534;">Paket</td><td style="padding:6px 12px;color:#0f172a;">%s · %d bulan</td></tr>
  <tr><td style="padding:6px 12px;color:#166534;">Nominal</td><td style="padding:6px 12px;font-weight:700;color:#0f172a;">%s</td></tr>
  %s
</table>
<p style="margin:24px 0 0;color:#475569;font-size:14px;">Tim akan cek pembayaran dan mengaktifkan paket dalam 1&times;24 jam. Kamu tidak perlu mengirim ulang permintaan ini.</p>
<p style="margin:32px 0 0;text-align:center;">
  <a href="%s" style="display:inline-block;background:#10b981;color:#fff;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Cek status langganan</a>
</p>
<p style="margin:20px 0 0;color:#94a3b8;font-size:12px;">No. transaksi: %s</p>`,
		html.EscapeString(d.PlanLabel),
		html.EscapeString(d.StoreName),
		html.EscapeString(d.StoreName),
		html.EscapeString(d.StoreSlug),
		html.EscapeString(d.OwnerName),
		html.EscapeString(d.OwnerEmail),
		html.EscapeString(d.PlanLabel),
		d.Months,
		html.EscapeString(RenderRupiah(d.AmountCents)),
		proofHTML,
		html.EscapeString(d.DashboardURL),
		html.EscapeString(d.InvoiceID),
	))
	return
}
