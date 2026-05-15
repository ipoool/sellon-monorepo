package email

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"

	"github.com/sellon/sellon/api/internal/ai"
)

// weeklyThemes defines 52 unique marketing topics — one per ISO week.
// Claude writes fresh prose for each theme on every run, so even if the
// same week number recurs next year, the email content will differ.
var weeklyThemes = [52]string{
	// Foto & visual produk (1–4)
	"teknik foto produk dengan cahaya alami dan background sederhana di rumah",
	"flat lay photography untuk produk — komposisi, props, dan warna",
	"foto lifestyle: tunjukkan produk dalam konteks penggunaan nyata",
	"membangun konsistensi visual brand agar toko mudah dikenali",
	// Copywriting & deskripsi (5–8)
	"menulis deskripsi produk yang berfokus pada manfaat, bukan spesifikasi",
	"judul produk yang mudah dicari dan meyakinkan pembeli",
	"copywriting untuk broadcast WhatsApp yang dibaca, bukan diabaikan",
	"menggunakan angka dan data spesifik untuk meningkatkan kredibilitas toko",
	// Media sosial & konten (9–12)
	"menemukan jam terbaik untuk posting konten di media sosial dan WA",
	"konten behind the scenes yang membangun kepercayaan pembeli",
	"membuat video pendek produk yang mendorong pembelian",
	"memanfaatkan foto dan ulasan dari pelanggan sebagai konten organik",
	// WhatsApp marketing (13–16)
	"membuat template pesan WA yang hemat waktu namun tetap terasa personal",
	"strategi menggunakan Status WA sebagai mini-toko gratis setiap hari",
	"follow-up setelah pesanan terkirim untuk mendorong repeat order",
	"membangun grup WA pelanggan setia yang aktif dan tidak menjadi spam",
	// Pengelolaan pelanggan (17–20)
	"program loyalitas sederhana tanpa software canggih untuk UMKM",
	"cara meminta dan memanfaatkan testimoni pelanggan secara aktif",
	"menangani komplain pelanggan agar mereka justru menjadi lebih loyal",
	"personalisasi kecil dalam pengalaman belanja yang membuat pelanggan merasa spesial",
	// Promo & penjualan (21–24)
	"menjalankan flash sale yang menciptakan urgensi nyata, bukan gimmick",
	"strategi free ongkir: psikologi di baliknya dan cara kalkulasi yang tepat",
	"bundling produk untuk meningkatkan nilai rata-rata per transaksi",
	"memanfaatkan kalender momen spesial (harbolnas, lebaran, hari ibu) untuk penjualan",
	// Operasional toko (25–28)
	"manajemen stok sederhana agar produk terlaris tidak pernah kehabisan",
	"packing produk yang berkesan dan mendorong unboxing experience positif",
	"mengurangi pesanan yang dibatalkan atau tidak dibayar",
	"menetapkan jam operasional yang transparan untuk mengelola ekspektasi pembeli",
	// Pengiriman & logistik (29–32)
	"memilih kurir yang paling sesuai untuk karakteristik produkmu",
	"cara menyampaikan update resi yang membuat pembeli merasa tenang",
	"teknik packing aman untuk produk fragile dan mudah rusak",
	"kalkulasi ambang free ongkir yang menguntungkan toko sekaligus menarik pembeli",
	// Produk & pengembangan (33–36)
	"validasi produk baru dengan stok terbatas sebelum investasi besar",
	"mengembangkan produk berdasarkan pertanyaan dan keluhan yang sering muncul",
	"pre-order sebagai strategi marketing sekaligus permodalan produksi",
	"mengenali dan mempersiapkan produk musiman dengan tepat waktu",
	// Keuangan & harga (37–40)
	"cara menentukan harga jual yang menutup semua biaya sekaligus menguntungkan",
	"mengenali tanda-tanda sudah waktunya menaikkan harga tanpa kehilangan pelanggan",
	"memahami dan menjaga margin keuntungan yang sehat untuk UMKM",
	"memisahkan keuangan toko dan pribadi sebagai fondasi bisnis yang sehat",
	// Brand & kepercayaan (41–44)
	"membangun nama dan identitas toko yang mudah diingat dan dipercaya",
	"legalitas usaha (NIB, PIRT) sebagai faktor pembeda kepercayaan",
	"kecepatan respons pesan sebagai faktor penentu konversi yang sering diremehkan",
	"kemasan sebagai brand ambassador: investasi kecil dampak besar",
	// Momen spesial (45–48)
	"strategi dan persiapan Harbolnas (11.11, 12.12) agar tidak ketinggalan",
	"memaksimalkan penjualan di bulan Ramadan dan periode Lebaran",
	"memanfaatkan momentum tahun baru untuk akuisisi pelanggan pertama",
	"menjadikan momen personal (hari ibu, wisuda, ulang tahun) peluang penjualan",
	// Mindset & motivasi (49–52)
	"membangun mindset pertumbuhan: setiap hasil adalah data, bukan kegagalan",
	"belajar secara strategis dari kompetitor tanpa takut atau terjebak membandingkan",
	"mengapa konsistensi membangun bisnis lebih kuat daripada mengejar viral",
	"istirahat dan keberlanjutan diri sebagai strategi bisnis jangka panjang",
}

const tipSystemPrompt = `Kamu adalah konsultan marketing digital yang membantu pemilik UMKM Indonesia berjualan lebih efektif secara online.

Platform SellOn adalah aplikasi toko online berbasis WhatsApp untuk UMKM kecil Indonesia — bukan marketplace besar, bukan brand korporasi.

Gaya penulisan yang diharapkan:
- Bahasa Indonesia santai, hangat, bersahabat — seperti ngobrol dengan teman yang paham bisnis
- Nada mentor yang supportif, bukan guru yang menggurui
- Contoh konkret dan spesifik yang relevan untuk UMKM kecil (bukan perusahaan besar)
- Tips yang bisa langsung dipraktikkan hari ini, bukan teori abstrak
- Hindari jargon berat: 'engagement rate', 'konversi', 'ROI', 'optimasi' — ganti dengan bahasa sehari-hari
- Hindari kata 'strategi' — ganti dengan 'cara', 'tips', 'langkah'
- Emoji boleh digunakan 1–2 kali di seluruh teks, tapi tidak wajib`

// TipGenerator creates fresh email content via the Claude API.
// Falls back gracefully to the static pool if the API is unavailable.
type TipGenerator struct {
	client *ai.AnthropicClient
	logger *slog.Logger
}

// NewTipGenerator constructs a generator. If apiKey is empty, Generate()
// always returns ErrNotConfigured and callers should use the static pool.
func NewTipGenerator(apiKey string, logger *slog.Logger) *TipGenerator {
	return &TipGenerator{
		client: ai.NewAnthropicClient(apiKey, logger),
		logger: logger,
	}
}

func (g *TipGenerator) Configured() bool {
	return g.client.Configured()
}

// generatedTipJSON mirrors the JSON structure Claude is asked to return.
type generatedTipJSON struct {
	Subject   string   `json:"subject"`
	Headline  string   `json:"headline"`
	Intro     string   `json:"intro"`
	Body      string   `json:"body"`
	QuickTips []string `json:"quick_tips"`
	CTALabel  string   `json:"cta_label"`
}

// Generate calls Claude to write a unique marketing email tip for the given
// ISO week number and year. The theme is selected deterministically from
// weeklyThemes so each week in the year covers a different topic.
func (g *TipGenerator) Generate(ctx context.Context, weekNum, year int) (WeeklyTip, error) {
	theme := weeklyThemes[(weekNum-1)%len(weeklyThemes)]

	userPrompt := fmt.Sprintf(`Topik minggu ini: %s
Minggu ke-%d, tahun %d.

Tulis konten email marketing dalam format JSON berikut.
Balas HANYA dengan JSON murni — tanpa markdown, tanpa penjelasan, tanpa blok kode.

{
  "subject": "subjek email yang menarik perhatian (awali dengan 'Tips minggu ini:', max 70 karakter)",
  "headline": "headline utama yang menarik dan relevan dengan topik (max 65 karakter)",
  "intro": "1–2 kalimat pembuka yang engaging, awali dengan 'Selamat pagi!'",
  "body": "paragraf utama berisi penjelasan tips yang praktis (120–200 kata, ditulis sebagai satu paragraf)",
  "quick_tips": [
    "tip ringkas dan bisa langsung dipraktikkan (1 kalimat)",
    "tip ringkas dan bisa langsung dipraktikkan (1 kalimat)",
    "tip ringkas dan bisa langsung dipraktikkan (1 kalimat)"
  ],
  "cta_label": "label tombol CTA yang relevan dengan topik (max 35 karakter)"
}`, theme, weekNum, year)

	raw, err := g.client.Complete(ctx, ai.DefaultModel, tipSystemPrompt, userPrompt, 1024)
	if err != nil {
		return WeeklyTip{}, fmt.Errorf("tip generator: API call failed: %w", err)
	}

	// Strip markdown code fences if Claude wraps the JSON anyway.
	raw = strings.TrimSpace(raw)
	if strings.HasPrefix(raw, "```") {
		raw = strings.TrimPrefix(raw, "```json")
		raw = strings.TrimPrefix(raw, "```")
		if idx := strings.LastIndex(raw, "```"); idx != -1 {
			raw = raw[:idx]
		}
		raw = strings.TrimSpace(raw)
	}

	var result generatedTipJSON
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		return WeeklyTip{}, fmt.Errorf("tip generator: parse JSON: %w (raw: %.300s)", err, raw)
	}

	if result.Subject == "" || result.Headline == "" || result.Body == "" {
		return WeeklyTip{}, fmt.Errorf("tip generator: incomplete response (subject/headline/body empty)")
	}

	g.logger.Info("tip generator: content generated",
		"week", weekNum, "year", year,
		"theme", theme,
		"subject", result.Subject,
	)

	return WeeklyTip{
		Subject:   result.Subject,
		Headline:  result.Headline,
		Intro:     result.Intro,
		Body:      result.Body,
		QuickTips: result.QuickTips,
		CTALabel:  result.CTALabel,
	}, nil
}
