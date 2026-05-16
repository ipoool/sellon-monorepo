package email

import (
	"context"
	"fmt"
	"html"
	"log/slog"
	"strings"
	"time"

	"github.com/sellon/sellon/api/internal/ai"
)

// ExpiryEmailData is the full context needed to compose a subscription-expiry email.
type ExpiryEmailData struct {
	StoreName     string
	OwnerName     string
	Plan          string    // "pro" or "bisnis" (raw from DB)
	ExpiresAt     time.Time // the actual expiry timestamp
	NotifType     string    // "h3" or "h0"
	DaysLeft      int       // 3 or 0
	TotalOrders   int
	RevenueCents  int64
	TopProduct    string // "" if no orders yet
	TopProductQty int
	RenewURL      string // e.g. https://sellon.id/settings/subscription
}

// ExpiryContent is the rendered output from the AI (or static fallback).
type ExpiryContent struct {
	Subject  string
	Headline string
	BodyHTML string // already HTML-safe
	CTALabel string
}

const expirySystemPrompt = `Kamu adalah email copywriter untuk SellOn, platform e-commerce untuk UMKM Indonesia.
Tulis dalam Bahasa Indonesia yang santai, hangat, dan supportif.
Fokus pada pencapaian nyata penjual menggunakan angka spesifik yang diberikan.
Jangan tulis subject, headline, atau tombol CTA — itu akan ditambahkan terpisah.
Output adalah HTML minimal (hanya <strong>, <br>, <p>) — jangan gunakan tag lain.`

// ExpiryGenerator creates personalized subscription-expiry email bodies via the Claude API.
type ExpiryGenerator struct {
	client *ai.AnthropicClient
	logger *slog.Logger
}

func NewExpiryGenerator(apiKey string, logger *slog.Logger) *ExpiryGenerator {
	return &ExpiryGenerator{
		client: ai.NewAnthropicClient(apiKey, logger),
		logger: logger,
	}
}

func (g *ExpiryGenerator) Configured() bool {
	return g.client.Configured()
}

// Generate calls Claude to write a personalized 3-paragraph body for the expiry email.
// Falls back to a static template if the API is unavailable or unconfigured.
func (g *ExpiryGenerator) Generate(ctx context.Context, d ExpiryEmailData) ExpiryContent {
	planLabel := planDisplayName(d.Plan)

	if g.client.Configured() {
		body, err := g.generateAI(ctx, d, planLabel)
		if err != nil {
			g.logger.Warn("expiry generator: AI failed, using static fallback",
				"store", d.StoreName, "err", err)
		} else {
			return buildContent(d, planLabel, body)
		}
	}

	return buildContent(d, planLabel, staticBody(d, planLabel))
}

func (g *ExpiryGenerator) generateAI(ctx context.Context, d ExpiryEmailData, planLabel string) (string, error) {
	wib, _ := time.LoadLocation("Asia/Jakarta")
	expiresStr := d.ExpiresAt.In(wib).Format("2 January 2006, 15:04 WIB")

	revenueStr := RenderRupiah(d.RevenueCents)

	topProductLine := "Belum ada data produk terlaris"
	if d.TopProduct != "" {
		topProductLine = fmt.Sprintf("%s (%d terjual)", d.TopProduct, d.TopProductQty)
	}

	var urgencyNote string
	if d.NotifType == "h0" {
		urgencyNote = "PENTING: langganan berakhir HARI INI — gunakan nada sangat mendesak namun tetap hangat."
	} else {
		urgencyNote = "Langganan berakhir 3 hari lagi — nada hangat dan mendorong, tidak panik."
	}

	userPrompt := fmt.Sprintf(`%s

Nama toko: %s
Paket: %s
Berakhir: %s
30 hari terakhir: %d pesanan, %s
Produk terlaris: %s

Tulis 3 paragraf body email:
1. Apresiasi pencapaian spesifik berdasarkan angka di atas
2. Manfaat plan %s yang akan hilang jika tidak perpanjang (fitur premium, batas lebih besar, dll.)
3. Ajakan perpanjang dengan nada hangat

Maksimal 200 kata. Output HTML minimal (<strong>, <br>).
JANGAN tulis subject, headline, atau tombol CTA.`,
		urgencyNote,
		d.StoreName, planLabel, expiresStr,
		d.TotalOrders, revenueStr, topProductLine,
		planLabel,
	)

	raw, err := g.client.Complete(ctx, ai.DefaultModel, expirySystemPrompt, userPrompt, 512)
	if err != nil {
		return "", err
	}
	// Strip markdown if Claude wraps anyway.
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "```") {
		raw = strings.TrimPrefix(raw, "```html")
		raw = strings.TrimPrefix(raw, "```")
		if idx := strings.LastIndex(raw, "```"); idx != -1 {
			raw = raw[:idx]
		}
		raw = strings.TrimSpace(raw)
	}
	return raw, nil
}

func buildContent(d ExpiryEmailData, planLabel, bodyHTML string) ExpiryContent {
	firstName := firstWordExpiry(d.OwnerName)

	var subject, headline, ctaLabel string
	if d.NotifType == "h0" {
		subject = fmt.Sprintf("Hari ini langganan %s kamu berakhir — jangan lewatkan, %s", planLabel, firstName)
		headline = fmt.Sprintf("Langganan %s kamu berakhir hari ini", planLabel)
		ctaLabel = "Perpanjang Sekarang →"
	} else {
		subject = fmt.Sprintf("Langganan %s kamu berakhir 3 hari lagi, %s 👀", planLabel, firstName)
		headline = fmt.Sprintf("Langganan %s kamu berakhir dalam 3 hari", planLabel)
		ctaLabel = "Perpanjang Sekarang →"
	}

	return ExpiryContent{
		Subject:  subject,
		Headline: headline,
		BodyHTML: bodyHTML,
		CTALabel: ctaLabel,
	}
}

func staticBody(d ExpiryEmailData, planLabel string) string {
	revenueStr := RenderRupiah(d.RevenueCents)

	var topLine string
	if d.TopProduct != "" {
		topLine = fmt.Sprintf(" Produk terlaris kamu, <strong>%s</strong>, sudah terjual <strong>%d kali</strong> — pencapaian yang luar biasa!",
			html.EscapeString(d.TopProduct), d.TopProductQty)
	}

	if d.NotifType == "h0" {
		return fmt.Sprintf(`<p>Hei <strong>%s</strong>! Dalam 30 hari terakhir, toko kamu sudah menerima <strong>%d pesanan</strong> dengan total omzet <strong>%s</strong>.%s Terima kasih sudah berjuang keras!</p>
<p>Sayangnya, langganan <strong>%s</strong> kamu berakhir <strong>hari ini</strong>. Tanpa perpanjang, fitur-fitur premium seperti laporan penjualan detail, manajemen tim, dan akses tidak terbatas akan langsung non-aktif. Pesanan baru tetap bisa masuk, tapi kemampuan kelola toko kamu akan sangat terbatas.</p>
<p>Jangan biarkan kerja kerasmu terhenti di sini. Perpanjang sekarang dan terus kembangkan toko <strong>%s</strong>-mu bersama SellOn!</p>`,
			html.EscapeString(firstWordExpiry(d.OwnerName)),
			d.TotalOrders, revenueStr, topLine,
			planLabel,
			html.EscapeString(d.StoreName),
		)
	}

	return fmt.Sprintf(`<p>Hei <strong>%s</strong>! 30 hari terakhir toko kamu sudah raih <strong>%d pesanan</strong> dengan omzet <strong>%s</strong>.%s Kamu sudah bekerja keras, dan hasilnya terlihat nyata!</p>
<p>Tapi ada kabar penting: langganan <strong>%s</strong> kamu akan berakhir <strong>3 hari lagi</strong>. Kalau belum diperpanjang, fitur premium — termasuk laporan penjualan, manajemen tim, dan batas produk yang lebih besar — akan non-aktif otomatis.</p>
<p>Yuk perpanjang sekarang sebelum ketinggalan! Cukup klik tombol di bawah dan toko <strong>%s</strong> terus jalan tanpa gangguan. 🚀</p>`,
		html.EscapeString(firstWordExpiry(d.OwnerName)),
		d.TotalOrders, revenueStr, topLine,
		planLabel,
		html.EscapeString(d.StoreName),
	)
}

// RenderSubscriptionExpiry renders ExpiryContent + ExpiryEmailData into
// (subject, plainText, htmlBody) ready to pass to Mailer.Send.
func RenderSubscriptionExpiry(content ExpiryContent, d ExpiryEmailData) (subject, text, htmlBody string) {
	subject = content.Subject
	planLabel := planDisplayName(d.Plan)
	firstName := firstWordExpiry(d.OwnerName)

	wib, _ := time.LoadLocation("Asia/Jakarta")
	expiresStr := d.ExpiresAt.In(wib).Format("2 January 2006")

	revenueStr := RenderRupiah(d.RevenueCents)

	topLine := ""
	if d.TopProduct != "" {
		topLine = fmt.Sprintf("\nProduk terlaris : %s (%d terjual)", d.TopProduct, d.TopProductQty)
	}

	text = fmt.Sprintf(`Halo %s!

%s

Performa toko %s — 30 hari terakhir:
  Pesanan total : %d
  Omzet         : %s%s

Langganan %s berakhir: %s

Perpanjang sekarang: %s

— Tim SellOn
`,
		firstName,
		content.Headline,
		d.StoreName,
		d.TotalOrders, revenueStr, topLine,
		planLabel, expiresStr,
		d.RenewURL,
	)

	topProductRow := ""
	if d.TopProduct != "" {
		topProductRow = fmt.Sprintf(
			`<tr><td style="padding:6px 12px;color:#166534;">Produk terlaris</td><td style="padding:6px 12px;color:#0f172a;">%s (%d terjual)</td></tr>`,
			html.EscapeString(d.TopProduct), d.TopProductQty,
		)
	}

	htmlBody = WrapHTML(fmt.Sprintf(`
<p style="margin:0 0 4px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Notifikasi Langganan</p>
<h2 style="margin:0 0 20px;font-size:20px;line-height:1.35;color:#0f172a;">%s</h2>
<div style="margin:0 0 24px;color:#334155;line-height:1.7;">%s</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%%;border-collapse:collapse;background:#f0fdf4;border-radius:8px;padding:16px;margin:0 0 28px;">
  <tr><td colspan="2" style="padding:6px 12px;font-weight:600;color:#166534;font-size:13px;text-transform:uppercase;letter-spacing:0.05em;">Performa toko %s — 30 hari terakhir</td></tr>
  <tr><td style="padding:6px 12px;color:#166534;">Pesanan</td><td style="padding:6px 12px;font-weight:700;color:#0f172a;">%d pesanan</td></tr>
  <tr><td style="padding:6px 12px;color:#166534;">Omzet</td><td style="padding:6px 12px;font-weight:700;color:#0f172a;">%s</td></tr>%s
</table>
<p style="margin:0 0 28px;text-align:center;">
  <a href="%s" style="display:inline-block;background:#10b981;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:15px;">%s</a>
</p>
<p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">Langganan %s berakhir pada %s.</p>`,
		html.EscapeString(content.Headline),
		content.BodyHTML,
		html.EscapeString(d.StoreName),
		d.TotalOrders,
		html.EscapeString(revenueStr),
		topProductRow,
		html.EscapeString(d.RenewURL),
		html.EscapeString(content.CTALabel),
		html.EscapeString(planLabel),
		html.EscapeString(expiresStr),
	))

	return
}

func planDisplayName(plan string) string {
	switch strings.ToLower(plan) {
	case "bisnis":
		return "Bisnis"
	default:
		return "Pro"
	}
}

func firstWordExpiry(s string) string {
	for i, r := range s {
		if r == ' ' {
			return s[:i]
		}
	}
	if s == "" {
		return "Pejuang UMKM"
	}
	return s
}
