package email

import (
	"fmt"
	"html"
	"strings"
)

// PartnerCommissionData drives the note a partner gets each time someone they
// referred starts paying.
//
// Deliberately absent: the customer's name and email. The partner is owed a
// commission, not a copy of a stranger's personal data — the store name and
// plan are enough to recognise the conversion, and the admin console keeps
// the rest.
type PartnerCommissionData struct {
	PartnerName string
	ContactName string

	StoreName string
	Plan      string
	Months    int

	BaseAmountCents int64
	CommissionBps   int
	CommissionCents int64

	// Everything earned and not yet paid out, including this commission.
	TotalOwedCents int64
}

// RenderPartnerCommission builds the conversion notification.
//
// It leads with the amount earned and closes with the running total, because
// those are the two numbers a partner checks — and publishing the running
// total on every conversion is what keeps the monthly settlement from
// becoming a negotiation.
func RenderPartnerCommission(d PartnerCommissionData) (subject, text, htmlBody string) {
	greeting := strings.TrimSpace(d.ContactName)
	if greeting == "" {
		greeting = strings.TrimSpace(d.PartnerName)
	}
	if greeting == "" {
		greeting = "Partner"
	}

	rate := formatRate(d.CommissionBps)
	period := fmt.Sprintf("%d bulan", d.Months)
	if d.Months == 1 {
		period = "1 bulan"
	}
	// Guarded: plan is a snapshot off the invoice and an empty one must not
	// panic a notification that is already past the point of no return.
	planLabel := "Langganan"
	if p := strings.TrimSpace(d.Plan); p != "" {
		planLabel = strings.ToUpper(p[:1]) + p[1:]
	}

	subject = fmt.Sprintf("Komisi baru %s dari link kamu", RenderRupiah(d.CommissionCents))

	text = fmt.Sprintf(`Halo %s,

Ada yang berlangganan lewat link kamu.

Toko        : %s
Paket       : %s (%s)
Nilai       : %s
Rate komisi : %s
Komisi kamu : %s

Total komisi belum dibayar: %s

Angka ini ikut terupdate tiap ada langganan baru dari link kamu.
Kalau ada yang tidak cocok, balas email ini.

— SellOn
`,
		greeting, d.StoreName, planLabel, period,
		RenderRupiah(d.BaseAmountCents), rate,
		RenderRupiah(d.CommissionCents), RenderRupiah(d.TotalOwedCents))

	htmlBody = wrapHTML(fmt.Sprintf(`
<h2 style="margin:0 0 8px;font-size:20px;color:#0f172a;">Komisi baru dari link kamu 🎉</h2>
<p style="margin:0 0 24px;color:#475569;">Halo %s, satu toko baru saja berlangganan lewat link kamu.</p>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;border-collapse:collapse;background:#f0fdf4;border-radius:8px;padding:16px;">
  <tr><td style="padding:6px 12px;color:#166534;">Toko</td><td style="padding:6px 12px;color:#0f172a;">%s</td></tr>
  <tr><td style="padding:6px 12px;color:#166534;">Paket</td><td style="padding:6px 12px;color:#0f172a;">%s &middot; %s</td></tr>
  <tr><td style="padding:6px 12px;color:#166534;">Nilai transaksi</td><td style="padding:6px 12px;color:#0f172a;">%s</td></tr>
  <tr><td style="padding:6px 12px;color:#166534;">Rate komisi</td><td style="padding:6px 12px;color:#0f172a;">%s</td></tr>
  <tr><td style="padding:10px 12px;color:#166534;font-weight:700;border-top:1px solid #bbf7d0;">Komisi kamu</td><td style="padding:10px 12px;font-weight:700;font-size:18px;color:#0f172a;border-top:1px solid #bbf7d0;">%s</td></tr>
</table>

<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;border-collapse:collapse;margin-top:16px;background:#f8fafc;border-radius:8px;">
  <tr>
    <td style="padding:14px 12px;color:#475569;">Total komisi belum dibayar</td>
    <td style="padding:14px 12px;text-align:right;font-weight:700;font-size:18px;color:#0f172a;">%s</td>
  </tr>
</table>

<p style="margin:24px 0 0;color:#475569;font-size:14px;">Angka ini ikut terupdate tiap ada langganan baru dari link kamu. Kalau ada yang tidak cocok, balas email ini.</p>`,
		html.EscapeString(greeting),
		html.EscapeString(d.StoreName),
		html.EscapeString(planLabel),
		html.EscapeString(period),
		html.EscapeString(RenderRupiah(d.BaseAmountCents)),
		html.EscapeString(rate),
		html.EscapeString(RenderRupiah(d.CommissionCents)),
		html.EscapeString(RenderRupiah(d.TotalOwedCents)),
	))
	return
}

// formatRate turns basis points into something a person reads: 2000 -> "20%",
// 1750 -> "17,5%". Indonesian decimal comma, and no trailing ",0".
func formatRate(bps int) string {
	whole := bps / 100
	frac := bps % 100
	switch {
	case frac == 0:
		return fmt.Sprintf("%d%%", whole)
	case frac%10 == 0:
		return fmt.Sprintf("%d,%d%%", whole, frac/10)
	default:
		return fmt.Sprintf("%d,%02d%%", whole, frac)
	}
}
