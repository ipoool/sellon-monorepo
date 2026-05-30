package handler

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/ai"
	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/email"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// WIB is fixed +7 (Indonesia has no DST) — avoids a tzdata dependency in Go.
var wib = time.FixedZone("WIB", 7*3600)

type AnalyticsHandler struct {
	analytics *repository.AnalyticsRepo
	cash      *repository.CashEntryRepo
	stores    *repository.StoreRepo
	subs      *repository.SubscriptionRepo
	reports   *repository.ReportsRepo
	products  *repository.ProductRepo
	users     *repository.UserRepo
	anthropic *ai.AnthropicClient
	mailer    *email.Mailer
	webOrigin string
	audit     *audit.Logger
	logger    *slog.Logger
}

func NewAnalyticsHandler(analytics *repository.AnalyticsRepo, cash *repository.CashEntryRepo, stores *repository.StoreRepo, subs *repository.SubscriptionRepo, reports *repository.ReportsRepo, products *repository.ProductRepo, users *repository.UserRepo, anthropic *ai.AnthropicClient, mailer *email.Mailer, webOrigin string, audit *audit.Logger, logger *slog.Logger) *AnalyticsHandler {
	return &AnalyticsHandler{analytics: analytics, cash: cash, stores: stores, subs: subs, reports: reports, products: products, users: users, anthropic: anthropic, mailer: mailer, webOrigin: webOrigin, audit: audit, logger: logger}
}

func (h *AnalyticsHandler) requireStore(r *http.Request) (*repository.Store, error) {
	uid, _ := auth.UserIDFromContext(r.Context())
	return h.stores.FindByOwnerID(r.Context(), uid)
}

func (h *AnalyticsHandler) proBlocked(w http.ResponseWriter, r *http.Request, storeID uuid.UUID) bool {
	sub, err := h.subs.GetOrCreate(r.Context(), storeID)
	if err == nil && sub.Plan == "free" {
		response.JSON(w, http.StatusPaymentRequired, map[string]any{"error": "plan_required", "plan": "pro"})
		return true
	}
	return false
}

// dateWindow returns from (inclusive) + toExclusive (to + 1 day) as YYYY-MM-DD
// WIB strings, defaulting to the last 30 days.
func (h *AnalyticsHandler) dateWindow(r *http.Request) (string, string) {
	now := time.Now().In(wib)
	q := r.URL.Query()
	from := strings.TrimSpace(q.Get("from"))
	to := strings.TrimSpace(q.Get("to"))
	if from == "" {
		from = now.AddDate(0, 0, -29).Format("2006-01-02")
	}
	if to == "" {
		to = now.Format("2006-01-02")
	}
	toExcl := to
	if t, err := time.Parse("2006-01-02", to); err == nil {
		toExcl = t.AddDate(0, 0, 1).Format("2006-01-02")
	}
	return from, toExcl
}

// GET /api/v1/analytics/overview?from&to
func (h *AnalyticsHandler) Overview(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"overview": nil, "has_store": false})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	from, to := h.dateWindow(r)
	ov, err := h.analytics.Overview(r.Context(), store.ID, from, to)
	if err != nil {
		h.logger.Error("analytics overview", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"overview": ov, "has_store": true})
}

// GET /api/v1/cash-entries?from&to
func (h *AnalyticsHandler) ListCashEntries(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		response.JSON(w, http.StatusOK, map[string]any{"entries": []map[string]any{}})
		return
	}
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	// Cash ledger is a Pro/Bisnis feature — gate reads too (serverApi turns the
	// 402 into null, and the merged page hides the ledger for Free anyway).
	if h.proBlocked(w, r, store.ID) {
		return
	}
	from, to := h.dateWindow(r)
	rows, err := h.cash.ListByStore(r.Context(), store.ID, from, to)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, c := range rows {
		out = append(out, map[string]any{
			"id": c.ID.String(), "direction": c.Direction, "category": c.Category,
			"amount_cents": c.AmountCents, "occurred_on": c.OccurredOn.Format("2006-01-02"),
			"note": c.Note,
		})
	}
	response.JSON(w, http.StatusOK, map[string]any{"entries": out})
}

// POST /api/v1/cash-entries
func (h *AnalyticsHandler) CreateCashEntry(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	if h.proBlocked(w, r, store.ID) {
		return
	}
	var in struct {
		Direction   string `json:"direction"`
		Category    string `json:"category"`
		AmountCents int64  `json:"amount_cents"`
		OccurredOn  string `json:"occurred_on"`
		Note        string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid body")
		return
	}
	if in.Direction != "in" && in.Direction != "out" {
		response.Error(w, http.StatusBadRequest, "arah harus in/out")
		return
	}
	if in.AmountCents <= 0 {
		response.Error(w, http.StatusBadRequest, "nominal harus > 0")
		return
	}
	if _, perr := time.Parse("2006-01-02", in.OccurredOn); perr != nil {
		in.OccurredOn = time.Now().In(wib).Format("2006-01-02")
	}
	id, err := h.cash.Create(r.Context(), store.ID, in.Direction, strings.TrimSpace(in.Category), in.AmountCents, in.OccurredOn, strings.TrimSpace(in.Note))
	if err != nil {
		h.logger.Error("create cash entry", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal menyimpan")
		return
	}
	response.JSON(w, http.StatusCreated, map[string]any{"id": id.String()})
}

// DELETE /api/v1/cash-entries/{id}
func (h *AnalyticsHandler) DeleteCashEntry(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	// Cash ledger is Pro/Bisnis — gate writes server-side (matches Create).
	if h.proBlocked(w, r, store.ID) {
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "id invalid")
		return
	}
	if err := h.cash.Delete(r.Context(), store.ID, id); err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"ok": true})
}

const (
	aiSummaryModel     = "claude-haiku-4-5-20251001"
	aiSummaryMaxTokens = 5000
)

const analyticsAISystemPrompt = `Kamu adalah penasihat keuangan & bisnis untuk UMKM Indonesia yang ahli membaca laporan analytics toko.
Tugasmu: terjemahkan angka-angka mentah menjadi penjelasan yang jelas, ringkas, dan mudah dipahami pemilik toko awam — bukan akuntan.
Gaya: seperti mentor yang suportif, fokus pada apa artinya angka itu dan apa yang sebaiknya dilakukan. Hindari jargon. Gunakan satuan Rupiah yang gampang dibaca.
Balas HANYA dengan JSON berikut (tanpa markdown, tanpa teks tambahan):
{"ringkasan":"...","arus_kas":"...","tren":"...","pelanggan":"...","produk_restok":[{"nama":"...","detail":"..."}],"produk_optimasi":[{"nama":"...","detail":"..."}],"rekomendasi":["...","..."]}
- ringkasan: analisis menyeluruh & berbobot (4-6 kalimat, boleh 2 paragraf) tentang performa periode ini. Wajib mencakup: (1) angka inti — pendapatan, laba kotor, margin, jumlah order, AOV — beserta INTERPRETASINYA, bukan sekadar menyebut angka; (2) apa yang mendorong hasil tsb (produk/kategori terlaris, pola order, metode bayar); (3) satu kekuatan utama DAN satu risiko/kelemahan yang perlu diwaspadai (mis. konsentrasi penjualan, ketergantungan 1 produk, margin tipis, frekuensi order rendah); (4) konteks praktis: apa arti angka ini untuk keputusan pemilik toko ke depan. Setiap kalimat harus membawa insight, hindari basa-basi & pengulangan.
- arus_kas: kesehatan arus kas (kas masuk vs keluar, kas bersih) dan artinya.
- tren: tren penjualan dari data harian + komposisi metode pembayaran; sebut anomali/lonjakan/penurunan kalau ada.
- pelanggan: insight perilaku pelanggan dari data pelanggan teratas + status pesanan — apakah omzet bergantung pada sedikit pelanggan (konsentrasi), indikasi repeat order, kesehatan pemenuhan pesanan (banyak yang batal/menunggu?), plus 1 saran retensi/akuisisi. Kalau data pelanggan kosong, beri saran cara mulai mengumpulkan pelanggan.
- produk_restok: MAKSIMAL 5 produk paling mendesak (urutkan paling penting dulu) yang laris & stoknya menipis/habis. Untuk tiap item: "nama" = nama produk PERSIS seperti di data, "detail" = berapa terjual periode ini, sisa stok, dan kenapa mendesak (mis. "terjual 120, sisa stok 8 — bisa kehabisan dalam beberapa hari"). Kalau tidak ada yang mendesak, kembalikan array kosong [].
- produk_optimasi: MAKSIMAL 5 produk prioritas (urutkan paling penting dulu) yang perlu dioptimalkan — kurang/tidak laku, stok menumpuk, atau revenue rendah. Untuk tiap item: "nama" = nama produk PERSIS seperti di data, "detail" = masalahnya + saran konkret (mis. "stok 50 tapi 0 terjual bulan ini — coba foto ulang, turunkan harga, atau bundling dengan produk laris"). Kalau semua produk sehat, kembalikan array kosong [].
- rekomendasi: 3-4 langkah konkret lintas-aspek yang relevan dengan data.
Jaga total balasan tetap ringkas agar JSON utuh & valid.
Dasarkan daftar produk HANYA pada data produk yang diberikan; jangan mengarang nama produk.`

// rupiah formats integer cents into a readable "Rp 1.234.567" string.
func rupiah(cents int64) string {
	v := cents / 100
	neg := v < 0
	if neg {
		v = -v
	}
	s := fmt.Sprintf("%d", v)
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, c)
	}
	prefix := "Rp "
	if neg {
		prefix = "Rp -"
	}
	return prefix + string(out)
}

// gateErr carries a plan/availability rejection so each transport (JSON vs SSE)
// can render it appropriately.
type gateErr struct {
	status  int
	code    string
	message string
}

// summaryGate runs the shared access checks (store exists, plan is Pro/Bisnis,
// AI configured). Returns the store, or a gateErr to render.
func (h *AnalyticsHandler) summaryGate(r *http.Request) (*repository.Store, *gateErr) {
	store, err := h.requireStore(r)
	if errors.Is(err, repository.ErrStoreNotFound) {
		return nil, &gateErr{http.StatusBadRequest, "no_store", "toko belum dibuat"}
	}
	if err != nil {
		return nil, &gateErr{http.StatusInternalServerError, "internal", "internal error"}
	}
	sub, err := h.subs.GetOrCreate(r.Context(), store.ID)
	if err != nil {
		return nil, &gateErr{http.StatusInternalServerError, "internal", "internal error"}
	}
	if sub.Plan == "free" {
		return nil, &gateErr{http.StatusPaymentRequired, "plan_required", "Rangkuman AI tersedia di paket Pro atau Bisnis."}
	}
	if !h.anthropic.Configured() {
		return nil, &gateErr{http.StatusServiceUnavailable, "ai_not_configured", "Fitur rangkuman AI belum dikonfigurasi. Hubungi admin."}
	}
	return store, nil
}

// summaryInput is the fast-to-compute part of a summary request: the prompt fed
// to the model, its cache fingerprint, the display period, and a closure that
// bakes product IDs into the model's JSON output.
type summaryInput struct {
	prompt    string
	inputHash string
	from      string
	toDisplay string
	enrich    func(map[string]any)
}

// prepareSummaryInput gathers analytics + product data and builds the model
// prompt for a store/period. DB-only (fast) — safe to call before streaming.
func (h *AnalyticsHandler) prepareSummaryInput(r *http.Request, store *repository.Store) (summaryInput, error) {
	from, toExcl := h.dateWindow(r)
	ov, err := h.analytics.Overview(r.Context(), store.ID, from, toExcl)
	if err != nil {
		h.logger.Error("analytics ai summary: overview", "err", err)
		return summaryInput{}, err
	}

	// Display end-date = the inclusive `to` the user picked (dateWindow returns
	// to+1 as an exclusive bound).
	toDisplay := strings.TrimSpace(r.URL.Query().Get("to"))
	if toDisplay == "" {
		toDisplay = time.Now().In(wib).Format("2006-01-02")
	}

	var sb strings.Builder
	sb.WriteString(fmt.Sprintf("Data Analytics toko \"%s\" (periode %s s/d %s):\n\n", store.Name, from, toDisplay))
	sb.WriteString(fmt.Sprintf("PENDAPATAN: %s | Laba kotor: %s | Margin: %.1f%% | HPP: %s\n",
		rupiah(ov.RevenueCents), rupiah(ov.GrossProfitCents), ov.MarginPct, rupiah(ov.COGSCents)))
	sb.WriteString(fmt.Sprintf("ORDER: %d order | AOV (rata-rata per order): %s\n", ov.Orders, rupiah(ov.AOVCents)))
	sb.WriteString(fmt.Sprintf("ARUS KAS: masuk %s | keluar %s | kas bersih %s\n\n",
		rupiah(ov.CashInCents), rupiah(ov.CashOutCents), rupiah(ov.NetCashCents)))

	if len(ov.Payments) > 0 {
		sb.WriteString("METODE PEMBAYARAN (nominal):\n")
		for _, p := range ov.Payments {
			method := p.Method
			if method == "" {
				method = "(tidak diketahui)"
			}
			sb.WriteString(fmt.Sprintf("- %s: %s\n", method, rupiah(p.Cents)))
		}
		sb.WriteString("\n")
	}

	if len(ov.Series) > 0 {
		sb.WriteString("PENDAPATAN HARIAN (untuk lihat tren):\n")
		for _, d := range ov.Series {
			sb.WriteString(fmt.Sprintf("%s: %s\n", d.Date, rupiah(d.RevC)))
		}
		sb.WriteString("\n")
	}

	// Product-level data so the AI can recommend what to restock (fast movers
	// running low) and what to optimize (slow movers / overstock). from/toExcl
	// are WIB date strings; parse to instants matching the analytics window.
	sinceT, _ := time.ParseInLocation("2006-01-02", from, wib)
	untilT, _ := time.ParseInLocation("2006-01-02", toExcl, wib)
	sold, _ := h.reports.TopProducts(r.Context(), store.ID, sinceT, untilT, 100)
	active, _ := h.products.ListActiveByStore(r.Context(), store.ID)

	// Index current stock by product id (and collect the set of products that
	// actually sold in the period).
	type stockInfo struct {
		stock     int
		threshold int
	}
	stockByID := make(map[uuid.UUID]stockInfo, len(active))
	for _, p := range active {
		stockByID[p.ID] = stockInfo{stock: p.Stock, threshold: p.LowStockThreshold}
	}
	soldIDs := make(map[uuid.UUID]bool)

	if len(sold) > 0 {
		sb.WriteString("PRODUK TERLARIS (periode ini) — terjual | revenue | stok sekarang:\n")
		// Cap the explicit list so the prompt stays bounded; 20 is plenty.
		topN := sold
		if len(topN) > 20 {
			topN = topN[:20]
		}
		for i, p := range topN {
			if p.ProductID != nil {
				soldIDs[*p.ProductID] = true
			}
			stockStr := "stok tidak diketahui"
			if p.ProductID != nil {
				if si, ok := stockByID[*p.ProductID]; ok {
					stockStr = fmt.Sprintf("stok %d", si.stock)
					if si.threshold > 0 && si.stock <= si.threshold {
						stockStr += fmt.Sprintf(" (ambang %d — RENDAH/perlu restok)", si.threshold)
					} else if si.stock == 0 {
						stockStr += " (HABIS)"
					}
				}
			}
			sb.WriteString(fmt.Sprintf("%d. %s — %d terjual, %s, %s\n",
				i+1, p.ProductName, p.QtySold, rupiah(p.RevenueCents), stockStr))
		}
		// Mark remaining (21+) sold products so they don't show up as slow movers.
		for _, p := range sold {
			if p.ProductID != nil {
				soldIDs[*p.ProductID] = true
			}
		}
		sb.WriteString("\n")
	}

	// Slow movers: active products with zero sales in the period.
	var slow []repository.Product
	for _, p := range active {
		if !soldIDs[p.ID] {
			slow = append(slow, p)
		}
	}
	if len(slow) > 0 {
		sb.WriteString(fmt.Sprintf("PRODUK AKTIF TANPA PENJUALAN periode ini (%d produk) — nama | stok | harga:\n", len(slow)))
		listN := slow
		if len(listN) > 25 {
			listN = listN[:25]
		}
		for _, p := range listN {
			sb.WriteString(fmt.Sprintf("- %s — stok %d, %s\n", p.Name, p.Stock, rupiah(p.PriceCents)))
		}
		if len(slow) > len(listN) {
			sb.WriteString(fmt.Sprintf("(dan %d produk lain tanpa penjualan)\n", len(slow)-len(listN)))
		}
		sb.WriteString("\n")
	}

	// Customer + order-status context (from the Reports data set) so the unified
	// AI can also speak to customer behaviour and fulfilment health.
	if topCust, _ := h.reports.TopCustomers(r.Context(), store.ID, sinceT, untilT, 10); len(topCust) > 0 {
		sb.WriteString("PELANGGAN TERATAS (periode ini) — order | total belanja:\n")
		for i, c := range topCust {
			sb.WriteString(fmt.Sprintf("%d. %s — %d order, %s\n", i+1, c.Name, c.Orders, rupiah(c.TotalSpentCnt)))
		}
		sb.WriteString("\n")
	}
	if statusMap, _ := h.reports.CountByStatus(r.Context(), store.ID, sinceT, untilT); len(statusMap) > 0 {
		sb.WriteString("STATUS PESANAN (jumlah): ")
		for k, v := range statusMap {
			sb.WriteString(fmt.Sprintf("%s:%d ", k, v))
		}
		sb.WriteString("\n\n")
	}

	sb.WriteString("Jelaskan kondisi keuangan toko di periode ini dengan bahasa sederhana, sebutkan produk yang perlu di-restok dan yang perlu dioptimalkan secara spesifik, beri insight pelanggan, lalu beri rekomendasi konkret.")

	prompt := sb.String()
	inputHash := fmt.Sprintf("%x", sha256.Sum256([]byte(prompt)))

	// Map product names → id so the FE can deep-link each restok/optimasi item
	// to its edit page. Normalized (lowercase, unified dashes, collapsed
	// whitespace) to survive minor formatting differences from the model.
	dashReplacer := strings.NewReplacer("–", "-", "—", "-", "‐", "-", "−", "-")
	normName := func(s string) string {
		s = dashReplacer.Replace(strings.ToLower(strings.TrimSpace(s)))
		return strings.Join(strings.Fields(s), " ")
	}
	nameToID := make(map[string]string, len(active)+len(sold))
	for _, p := range active {
		nameToID[normName(p.Name)] = p.ID.String()
	}
	// Index sold-item snapshot names too, but ONLY when the product still exists
	// as an active product — so the edit link never points to a deleted /
	// free-text order item (those have a nil/dangling id).
	for _, p := range sold {
		if p.ProductID != nil {
			if _, exists := stockByID[*p.ProductID]; exists {
				nameToID[normName(p.ProductName)] = p.ProductID.String()
			}
		}
	}
	enrich := func(summary map[string]any) {
		for _, key := range []string{"produk_restok", "produk_optimasi"} {
			arr, ok := summary[key].([]any)
			if !ok {
				continue
			}
			for _, it := range arr {
				m, ok := it.(map[string]any)
				if !ok {
					continue
				}
				nama, _ := m["nama"].(string)
				if id, ok := nameToID[normName(nama)]; ok {
					m["product_id"] = id
				}
			}
		}
	}

	return summaryInput{prompt: prompt, inputHash: inputHash, from: from, toDisplay: toDisplay, enrich: enrich}, nil
}

// parsePersistSummary cleans the raw model output, validates JSON, bakes in
// product IDs, caches the enriched result, and emails it on the store's first
// summary. Returns the summary map (with cached_at set to now).
func (h *AnalyticsHandler) parsePersistSummary(ctx context.Context, store *repository.Store, in summaryInput, raw string) (map[string]any, error) {
	// Strip markdown fences if present.
	raw = strings.TrimSpace(raw)
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	if idx := strings.LastIndex(raw, "```"); idx > 0 {
		raw = raw[:idx]
	}
	raw = strings.TrimSpace(raw)

	var summary map[string]any
	if err := json.Unmarshal([]byte(raw), &summary); err != nil {
		h.logger.Error("analytics ai summary: invalid json from claude", "err", err)
		return nil, err
	}

	// Bake product IDs in BEFORE caching so cache hits can deep-link without
	// re-mapping names every time.
	in.enrich(summary)

	// First-ever summary for this store? (checked before we persist the new row)
	firstTime, _ := h.analytics.HasAnySummary(ctx, store.ID)
	firstTime = !firstTime

	// Persist the enriched JSON (with product_id), not the raw model output.
	toCache := raw
	if enriched, mErr := json.Marshal(summary); mErr == nil {
		toCache = string(enriched)
	}
	if cacheErr := h.analytics.SaveSummary(ctx, store.ID, in.from, in.toDisplay, in.inputHash, toCache); cacheErr != nil {
		h.logger.Warn("analytics ai summary: cache write failed", "err", cacheErr)
	}

	if firstTime {
		h.emailFirstSummary(store, summary, in.from, in.toDisplay)
	}

	// cached_at doubles as "last generated" — a fresh result was generated now.
	summary["cached_at"] = time.Now().Format(time.RFC3339)
	return summary, nil
}

// POST /api/v1/analytics/ai-summary?from&to
// Pro/Bisnis: reads the Analytics 360 data and asks Claude for a plain-language
// summary. Prefer the SSE variant (/stream) from the browser — it can't time
// out. This unary endpoint is kept for API/curl use.
func (h *AnalyticsHandler) AiSummary(w http.ResponseWriter, r *http.Request) {
	if rc := http.NewResponseController(w); rc != nil {
		_ = rc.SetWriteDeadline(time.Now().Add(120 * time.Second))
		_ = rc.SetReadDeadline(time.Now().Add(120 * time.Second))
	}

	store, gerr := h.summaryGate(r)
	if gerr != nil {
		response.JSON(w, gerr.status, map[string]any{"error": gerr.code, "message": gerr.message, "plan": "pro"})
		return
	}

	in, err := h.prepareSummaryInput(r, store)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}

	if cached, createdAt, found, _ := h.analytics.GetCachedSummary(r.Context(), store.ID, in.inputHash); found {
		var summary map[string]any
		if jsonErr := json.Unmarshal([]byte(cached), &summary); jsonErr == nil {
			summary["cached_at"] = createdAt.Format(time.RFC3339)
			response.JSON(w, http.StatusOK, summary)
			return
		}
	}

	raw, err := h.anthropic.Complete(r.Context(), aiSummaryModel, analyticsAISystemPrompt, in.prompt, aiSummaryMaxTokens)
	if err != nil {
		h.logger.Error("analytics ai summary: claude call failed", "err", err, "store", store.ID)
		response.JSON(w, http.StatusServiceUnavailable, map[string]any{
			"error":   "ai_error",
			"message": "Rangkuman AI sedang tidak tersedia. Coba lagi dalam beberapa menit.",
		})
		return
	}

	summary, err := h.parsePersistSummary(r.Context(), store, in, raw)
	if err != nil {
		response.JSON(w, http.StatusServiceUnavailable, map[string]any{
			"error":   "ai_error",
			"message": "Rangkuman tidak valid. Coba lagi.",
		})
		return
	}
	response.JSON(w, http.StatusOK, summary)
}

// GET /api/v1/analytics/ai-summary/stream?from&to
// SSE variant: the long Claude call runs server-side while a heartbeat keeps
// the connection alive, so no proxy/browser/server WriteTimeout can fire. The
// final summary is pushed as a `result` event; failures as a `failed` event.
func (h *AnalyticsHandler) AiSummaryStream(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}
	// Long-lived stream — clear the 10s global WriteTimeout (heartbeats below
	// keep it healthy regardless).
	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})

	send := func(event string, payload any) {
		b, _ := json.Marshal(payload)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, b)
		flusher.Flush()
	}

	store, gerr := h.summaryGate(r)
	if gerr != nil {
		send("failed", map[string]any{"error": gerr.code, "message": gerr.message})
		return
	}

	in, err := h.prepareSummaryInput(r, store)
	if err != nil {
		send("failed", map[string]any{"error": "internal", "message": "Gagal menyiapkan data analytics."})
		return
	}

	// Cache hit → push the stored (already enriched) summary immediately.
	if cached, createdAt, found, _ := h.analytics.GetCachedSummary(r.Context(), store.ID, in.inputHash); found {
		var summary map[string]any
		if jsonErr := json.Unmarshal([]byte(cached), &summary); jsonErr == nil {
			summary["cached_at"] = createdAt.Format(time.RFC3339)
			send("result", summary)
			return
		}
	}

	// Generate in the background; heartbeat until it's done. Tied to the request
	// context so a client disconnect (dialog closed) cancels the Claude call.
	type genResult struct {
		raw string
		err error
	}
	done := make(chan genResult, 1)
	go func() {
		raw, e := h.anthropic.Complete(r.Context(), aiSummaryModel, analyticsAISystemPrompt, in.prompt, aiSummaryMaxTokens)
		done <- genResult{raw: raw, err: e}
	}()

	ping := time.NewTicker(3 * time.Second)
	defer ping.Stop()
	for {
		select {
		case <-r.Context().Done():
			return
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		case res := <-done:
			if res.err != nil {
				h.logger.Error("analytics ai summary stream: claude failed", "err", res.err, "store", store.ID)
				send("failed", map[string]any{"error": "ai_error", "message": "Rangkuman AI sedang tidak tersedia. Coba lagi dalam beberapa menit."})
				return
			}
			summary, perr := h.parsePersistSummary(r.Context(), store, in, res.raw)
			if perr != nil {
				send("failed", map[string]any{"error": "ai_error", "message": "Rangkuman tidak valid. Coba lagi."})
				return
			}
			send("result", summary)
			return
		}
	}
}

// emailFirstSummary sends the AI summary to the store owner's email — fired
// only on the store's first-ever summary. Best-effort: failures are logged,
// never block the response. Runs in a goroutine so the HTTP call returns
// immediately (Mailer.Send is already async, but the user lookup isn't).
func (h *AnalyticsHandler) emailFirstSummary(store *repository.Store, summary map[string]any, from, to string) {
	if h.mailer == nil || !h.mailer.Configured() {
		return
	}
	go func() {
		ctx := context.Background()
		owner, err := h.users.FindByID(ctx, store.OwnerID)
		if err != nil || owner == nil || strings.TrimSpace(owner.Email) == "" {
			return
		}

		str := func(k string) string {
			if v, ok := summary[k].(string); ok {
				return v
			}
			return ""
		}
		// rekomendasi + product notes arrive as []any from the generic map.
		strs := func(k string) []string {
			out := []string{}
			if arr, ok := summary[k].([]any); ok {
				for _, it := range arr {
					if s, ok := it.(string); ok && strings.TrimSpace(s) != "" {
						out = append(out, s)
					}
				}
			}
			return out
		}
		notes := func(k string) []string {
			out := []string{}
			if arr, ok := summary[k].([]any); ok {
				for _, it := range arr {
					if m, ok := it.(map[string]any); ok {
						nama, _ := m["nama"].(string)
						detail, _ := m["detail"].(string)
						line := strings.TrimSpace(nama)
						if detail != "" {
							line += " — " + detail
						}
						if line != "" {
							out = append(out, line)
						}
					}
				}
			}
			return out
		}

		analyticsURL := h.webOrigin + "/analytics"
		subject := fmt.Sprintf("Rangkuman AI Analytics — %s", store.Name)

		html := buildAnalyticsSummaryHTML(store.Name, from, to, str, strs, notes, analyticsURL)
		text := buildAnalyticsSummaryText(store.Name, from, to, str, strs, notes, analyticsURL)

		h.mailer.Send(email.Message{
			To:       owner.Email,
			ToName:   owner.Name,
			Subject:  subject,
			Text:     text,
			HTML:     html,
			Category: "analytics_ai_summary",
		})
	}()
}

func buildAnalyticsSummaryText(storeName, from, to string, str func(string) string, strs, notes func(string) []string, url string) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("Rangkuman AI Analytics %s (periode %s s/d %s)\n\n", storeName, from, to))
	b.WriteString("RINGKASAN\n" + str("ringkasan") + "\n\n")
	b.WriteString("ARUS KAS\n" + str("arus_kas") + "\n\n")
	b.WriteString("TREN PENJUALAN\n" + str("tren") + "\n\n")
	if restok := notes("produk_restok"); len(restok) > 0 {
		b.WriteString("PRODUK PERLU RESTOK\n")
		for _, n := range restok {
			b.WriteString("- " + n + "\n")
		}
		b.WriteString("\n")
	}
	if opt := notes("produk_optimasi"); len(opt) > 0 {
		b.WriteString("PRODUK PERLU DIOPTIMALKAN\n")
		for _, n := range opt {
			b.WriteString("- " + n + "\n")
		}
		b.WriteString("\n")
	}
	if rek := strs("rekomendasi"); len(rek) > 0 {
		b.WriteString("REKOMENDASI AKSI\n")
		for i, n := range rek {
			b.WriteString(fmt.Sprintf("%d. %s\n", i+1, n))
		}
		b.WriteString("\n")
	}
	b.WriteString("Buka Analytics 360: " + url + "\n")
	return b.String()
}

func buildAnalyticsSummaryHTML(storeName, from, to string, str func(string) string, strs, notes func(string) []string, url string) string {
	esc := html.EscapeString
	var b strings.Builder
	b.WriteString(fmt.Sprintf(`<h1 style="margin:0 0 4px;font-size:20px;color:#0f172a;">Rangkuman AI Analytics</h1>`))
	b.WriteString(fmt.Sprintf(`<p style="margin:0 0 20px;color:#64748b;font-size:13px;">%s · periode %s s/d %s</p>`, esc(storeName), esc(from), esc(to)))

	section := func(title, body string) {
		if strings.TrimSpace(body) == "" {
			return
		}
		b.WriteString(fmt.Sprintf(`<h2 style="margin:18px 0 6px;font-size:15px;color:#0f172a;">%s</h2>`, esc(title)))
		b.WriteString(fmt.Sprintf(`<p style="margin:0;color:#334155;font-size:14px;line-height:1.6;">%s</p>`, esc(body)))
	}
	listSection := func(title string, items []string, numbered bool) {
		if len(items) == 0 {
			return
		}
		b.WriteString(fmt.Sprintf(`<h2 style="margin:18px 0 6px;font-size:15px;color:#0f172a;">%s</h2>`, esc(title)))
		tag := "ul"
		if numbered {
			tag = "ol"
		}
		b.WriteString(fmt.Sprintf(`<%s style="margin:0;padding-left:20px;color:#334155;font-size:14px;line-height:1.6;">`, tag))
		for _, it := range items {
			b.WriteString("<li>" + esc(it) + "</li>")
		}
		b.WriteString("</" + tag + ">")
	}

	section("Ringkasan", str("ringkasan"))
	section("Arus Kas", str("arus_kas"))
	section("Tren Penjualan", str("tren"))
	listSection("Produk Perlu Restok", notes("produk_restok"), false)
	listSection("Produk Perlu Dioptimalkan", notes("produk_optimasi"), false)
	listSection("Rekomendasi Aksi", strs("rekomendasi"), true)

	b.WriteString(fmt.Sprintf(`<div style="margin-top:24px;"><a href="%s" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px;font-weight:600;">Buka Analytics 360</a></div>`, esc(url)))
	return email.WrapHTML(b.String())
}
