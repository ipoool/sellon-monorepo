package email

import (
	"fmt"
	"strings"
)

// WeeklyTip holds the content for one weekly marketing email.
// Primary source: TipGenerator (Claude API). Fallback: staticTipsPool.
type WeeklyTip struct {
	Subject   string
	Headline  string
	Intro     string
	Body      string
	QuickTips []string
	CTALabel  string
}

// StaticTipForWeek returns a tip from the built-in pool, keyed by ISO week
// number. Used as fallback when the Claude API is unavailable or unconfigured.
func StaticTipForWeek(weekNum int) WeeklyTip {
	idx := (weekNum - 1)
	if idx < 0 {
		idx = 0
	}
	return staticTipsPool[idx%len(staticTipsPool)]
}

// RenderWeeklyTips renders a WeeklyTip into (subject, plainText, htmlBody).
// The caller is responsible for choosing the tip (AI-generated or static).
func RenderWeeklyTips(tip WeeklyTip, firstName, dashboardURL string) (subject, text, htmlBody string) {
	if firstName == "" {
		firstName = "Pejuang UMKM"
	}
	subject = tip.Subject

	// Plain text
	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Halo %s!\n\n", firstName))
	sb.WriteString(tip.Headline + "\n")
	sb.WriteString(strings.Repeat("-", len(tip.Headline)) + "\n\n")
	sb.WriteString(tip.Intro + "\n\n")
	sb.WriteString(tip.Body + "\n\n")
	if len(tip.QuickTips) > 0 {
		sb.WriteString("Tips cepat:\n")
		for _, t := range tip.QuickTips {
			sb.WriteString("• " + t + "\n")
		}
		sb.WriteString("\n")
	}
	sb.WriteString(tip.CTALabel + ": " + dashboardURL + "\n\n")
	sb.WriteString("Semangat berjualan minggu ini!\n— Tim SellOn\n")
	text = sb.String()

	// HTML bullets
	var tipsHTML strings.Builder
	for _, t := range tip.QuickTips {
		tipsHTML.WriteString(fmt.Sprintf(
			`<li style="margin:0 0 8px;color:#334155;">%s</li>`, t,
		))
	}

	quickTipsBlock := ""
	if tipsHTML.Len() > 0 {
		quickTipsBlock = fmt.Sprintf(`
<div style="background:#f0fdf4;border-left:3px solid #10b981;border-radius:4px;padding:16px 20px;margin:0 0 28px;">
  <p style="margin:0 0 10px;font-weight:600;color:#0f172a;font-size:14px;">Tips cepat:</p>
  <ul style="margin:0;padding-left:20px;">%s</ul>
</div>`, tipsHTML.String())
	}

	htmlBody = WrapHTML(fmt.Sprintf(`
<p style="margin:0 0 4px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.06em;font-weight:600;">Tips Minggu Ini</p>
<h2 style="margin:0 0 20px;font-size:20px;line-height:1.35;color:#0f172a;">%s</h2>
<p style="margin:0 0 16px;color:#475569;line-height:1.6;">%s</p>
<p style="margin:0 0 24px;color:#334155;line-height:1.7;">%s</p>
%s
<p style="margin:0 0 28px;text-align:center;">
  <a href="%s" style="display:inline-block;background:#10b981;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px;">%s →</a>
</p>
<p style="margin:0;color:#94a3b8;font-size:12px;text-align:center;">Semangat berjualan minggu ini! 💪</p>`,
		tip.Headline,
		tip.Intro,
		tip.Body,
		quickTipsBlock,
		dashboardURL,
		tip.CTALabel,
	))

	return
}

// staticTipsPool is the fallback content used when the Claude API is
// unavailable. 8 tips rotate by week — sufficient for offline/no-key scenarios.
var staticTipsPool = []WeeklyTip{
	{
		Subject:  "Tips minggu ini: foto produk yang bikin orang langsung beli",
		Headline: "Foto produk yang bikin orang langsung beli",
		Intro:    "Selamat pagi! Foto adalah 'sales person' pertama yang dilihat calon pembeli — bahkan sebelum mereka membaca deskripsi.",
		Body:     "Kamu tidak butuh kamera mahal. Cukup manfaatkan cahaya alami dari jendela di pagi hari, gunakan alas foto berwarna netral (putih, abu muda, atau kayu), dan ambil dari beberapa sudut berbeda. Foto yang terang, fokus, dan konsisten langsung meningkatkan kepercayaan pembeli.",
		QuickTips: []string{
			"Ambil minimal 3 sudut: depan, samping, dan detail close-up.",
			"Hindari bayangan keras — jika kurang cahaya, gunakan lampu ring LED murah.",
			"Ukuran foto yang konsisten membuat tampilan toko lebih profesional.",
		},
		CTALabel: "Lihat tampilan tokomu",
	},
	{
		Subject:  "Tips minggu ini: deskripsi produk yang menjual tanpa hard-sell",
		Headline: "Deskripsi yang menjual tanpa hard-sell",
		Intro:    "Selamat pagi! Banyak penjual fokus pada spesifikasi — padahal pembeli membeli manfaat, bukan fitur.",
		Body:     "Coba formula: mulai dengan masalah yang diselesaikan produkmu, jelaskan manfaat utamanya, baru cantumkan spesifikasi. Contoh: 'Capek tumbler yang bocor? Produk ini dirancang dengan tutup double-lock.' Pembeli langsung tahu relevansinya untuk mereka.",
		QuickTips: []string{
			"Sertakan ukuran, bahan, dan warna tersedia — ini mengurangi pertanyaan di WA.",
			"Tambahkan skenario penggunaan nyata: 'cocok untuk anak kos', 'ideal untuk hadiah'.",
			"Akhiri dengan ajakan ringan: 'Ada pertanyaan? Chat kami langsung!'",
		},
		CTALabel: "Edit produkmu",
	},
	{
		Subject:  "Tips minggu ini: jam terbaik untuk posting",
		Headline: "Posting di jam yang tepat = jangkauan 2× lebih luas",
		Intro:    "Selamat pagi! Bukan hanya APA yang kamu posting, tapi KAPAN — ini sangat mempengaruhi siapa yang melihatnya.",
		Body:     "Ada tiga jendela emas: pagi (06.30–08.30 saat commute), siang (12.00–13.00 saat istirahat), dan malam (20.00–22.00 saat santai). Senin pagi cocok untuk produk baru, Kamis–Jumat untuk promo weekend.",
		QuickTips: []string{
			"Konsisten lebih penting dari timing sempurna.",
			"Cek statistik platform untuk tahu kapan audiensmu paling aktif.",
			"Jadwalkan posting agar tidak ketinggalan jam ramai.",
		},
		CTALabel: "Buka dasbor tokomu",
	},
	{
		Subject:  "Tips minggu ini: ubah pembeli lama jadi pelanggan setia",
		Headline: "Pelanggan lama lebih mudah diajak beli lagi",
		Intro:    "Selamat pagi! Biaya mendapatkan pelanggan baru bisa 5× lebih mahal dibanding mempertahankan yang sudah ada.",
		Body:     "Luangkan 15 menit tiap minggu untuk cek daftar pelangganmu. Kirim pesan personal ke mereka yang sudah 30+ hari tidak order — tanya kabar atau informasikan produk baru yang relevan. Ketulusan jauh lebih efektif dari promo massal.",
		QuickTips: []string{
			"Sebut nama pembeli di pesan WA — ini membuat pesan terasa personal.",
			"Tawarkan promo eksklusif 'khusus pelanggan setia' — mereka merasa dihargai.",
			"Tanyakan feedback — ini gratis dan sangat berharga.",
		},
		CTALabel: "Lihat daftar pelanggan",
	},
	{
		Subject:  "Tips minggu ini: promo yang benar-benar mendorong penjualan",
		Headline: "Promo efektif bukan hanya soal diskon besar",
		Intro:    "Selamat pagi! Banyak penjual terjebak perang diskon — padahal ada cara lebih cerdas untuk mendorong penjualan.",
		Body:     "Promo paling efektif menciptakan urgensi nyata dan memberikan nilai lebih. Coba variasikan: 'gratis ongkir di atas Rp 150.000', 'beli 2 gratis 1', atau 'harga spesial hanya hari ini'. Batasi durasi maksimal 3–5 hari agar tidak kehilangan efek urgensi.",
		QuickTips: []string{
			"Cantumkan tanggal berakhir promo untuk urgensi visual.",
			"Free ongkir sering lebih menarik daripada diskon harga — psikologis pembeli begitu.",
			"Buat kategori 'Promo' di toko agar mudah ditemukan.",
		},
		CTALabel: "Kelola promo",
	},
	{
		Subject:  "Tips minggu ini: kekuatan testimoni pelanggan",
		Headline: "Ulasan pelanggan adalah iklan terbaik yang kamu miliki",
		Intro:    "Selamat pagi! 93% pembeli online membaca ulasan sebelum memutuskan beli.",
		Body:     "Mulailah aktif meminta ulasan setelah pesanan terkirim. Kalimat yang simpel dan ramah jauh lebih efektif: 'Halo [nama], terima kasih sudah belanja! Kalau berkenan, boleh cerita pengalamannya?' Screenshot testimoni positif dan jadikan konten untuk menarik pembeli baru.",
		QuickTips: []string{
			"Minta ulasan 2–3 hari setelah produk diterima — saat kesan masih segar.",
			"Minta foto produk dari pelanggan — ini konten autentik paling dipercaya.",
			"Tanggapi setiap ulasan dengan sopan.",
		},
		CTALabel: "Lihat pesanan",
	},
	{
		Subject:  "Tips minggu ini: bundling produk untuk naikkan nilai transaksi",
		Headline: "Bundle produk: jual lebih banyak dalam satu transaksi",
		Intro:    "Selamat pagi! Cara termudah meningkatkan omzet bukan mencari pembeli baru — tapi membuat yang sudah ada belanja lebih.",
		Body:     "Bundling adalah menjual beberapa produk terkait sebagai satu paket dengan harga lebih menarik. Pembeli merasa mendapat nilai lebih, kamu meningkatkan nilai transaksi rata-rata. Contoh: jual skincare → buat paket 'Rutinitas Pagi' (pembersih + toner + sunscreen).",
		QuickTips: []string{
			"Bundel produk yang saling melengkapi, bukan asal gabung.",
			"Beri nama paket yang menarik dan relevan.",
			"Harga bundel 10–15% lebih murah dari beli satuan.",
		},
		CTALabel: "Tambah produk bundel",
	},
	{
		Subject:  "Tips minggu ini: ceritakan kisah di balik tokomu",
		Headline: "Storytelling: senjata UMKM mengalahkan merek besar",
		Intro:    "Selamat pagi! Merek besar punya anggaran iklan besar. Kamu punya sesuatu lebih berharga: kisah nyata.",
		Body:     "Pembeli Indonesia sangat menyukai produk dengan cerita personal. Bagikan perjalananmu di deskripsi toko, bio WA, atau broadcast sesekali: 'Ini toko yang dimulai dari dapur rumah saya, 3 tahun lalu...' Keaslian membangun kepercayaan yang tidak bisa dibeli dengan iklan.",
		QuickTips: []string{
			"Tulis bio toko dalam 2–3 kalimat tentang siapa kamu dan kenapa berjualan.",
			"Bagikan proses pembuatan produk — behind the scene selalu menarik.",
			"Tunjukkan nilai yang kamu pegang: bahan lokal, ramah lingkungan, dll.",
		},
		CTALabel: "Lengkapi profil toko",
	},
}
