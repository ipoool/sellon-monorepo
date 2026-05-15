package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/xuri/excelize/v2"

	"github.com/sellon/sellon/api/internal/audit"
	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/events"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

const (
	bulkMaxRows         = 100
	bulkMaxUploadBytes  = 8 << 20 // 8 MB
	bulkSheetName       = "Produk"
	bulkInstructionName = "Petunjuk"
)

// Column order — must match the template Sheet "Produk".
var bulkColumns = []string{
	"Nama Produk",  // 0
	"URL Slug",     // 1
	"Deskripsi",    // 2
	"Harga (Rp)",   // 3
	"Stok",         // 4
	"Status",       // 5  — active | inactive | sold_out (default: active)
	"Berat (gram)", // 6
	"Panjang (cm)", // 7
	"Lebar (cm)",   // 8
	"Tinggi (cm)",  // 9
	"Foto URL 1",   // 10
	"Foto URL 2",   // 11
	"Foto URL 3",   // 12
	"Foto URL 4",   // 13
	"Foto URL 5",   // 14
	"Varian",       // 15  — "Nama:Harga:Stok[:SKU]" entries, dipisah ';' (kosongkan kalau tidak pakai)
}

// GET /api/v1/products/bulk/template — generates XLSX template
func (h *ProductHandler) BulkTemplate(w http.ResponseWriter, r *http.Request) {
	f := excelize.NewFile()
	defer f.Close()

	// Sheet 1: produk template with headers + example rows
	_, _ = f.NewSheet(bulkSheetName)
	f.DeleteSheet("Sheet1")

	// Header row
	for i, col := range bulkColumns {
		cell, _ := excelize.CoordinatesToCellName(i+1, 1)
		_ = f.SetCellValue(bulkSheetName, cell, col)
	}

	// Header style
	headerStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Color: "FFFFFF"},
		Fill:      excelize.Fill{Type: "pattern", Color: []string{"2D7A6B"}, Pattern: 1},
		Alignment: &excelize.Alignment{Vertical: "center"},
	})
	lastCol, _ := excelize.ColumnNumberToName(len(bulkColumns))
	_ = f.SetCellStyle(bulkSheetName, "A1", lastCol+"1", headerStyle)
	_ = f.SetRowHeight(bulkSheetName, 1, 22)

	// Example rows
	examples := [][]any{
		{
			"Keripik Singkong Pedas 500g",
			"keripik-singkong-pedas-500g",
			"Keripik singkong renyah dengan bumbu cabai pilihan. Tahan 30 hari.",
			35000, 50, "active", 500, 25, 18, 5,
			"https://example.com/keripik-1.jpg", "", "", "", "",
			"", // tanpa varian
		},
		{
			"Sambal Bawang Goreng",
			"", // kosong = auto-generate dari nama
			"Sambal bawang khas warung, level 3.",
			28000, 30, "active", 250, 12, 8, 8,
			"", "", "", "", "",
			"", // tanpa varian
		},
		{
			"Kaos Polos Premium",
			"kaos-polos-premium",
			"Kaos cotton combed 30s. Pilih ukuran sesuai bodymu.",
			85000, 0, "active", 200, 30, 25, 2,
			"https://example.com/kaos.jpg", "", "", "", "",
			"S:85000:5;M:85000:10;L:90000:8:KP-L;XL:95000:3",
		},
	}
	for r, row := range examples {
		for c, val := range row {
			cell, _ := excelize.CoordinatesToCellName(c+1, r+2)
			_ = f.SetCellValue(bulkSheetName, cell, val)
		}
	}

	// Column widths — generous so users can read example text
	widths := map[string]float64{"A": 30, "B": 25, "C": 45, "D": 14, "E": 8, "F": 12, "G": 14, "H": 14, "I": 14, "J": 14}
	for col, w := range widths {
		_ = f.SetColWidth(bulkSheetName, col, col, w)
	}
	for i := 11; i <= 15; i++ {
		colName, _ := excelize.ColumnNumberToName(i)
		_ = f.SetColWidth(bulkSheetName, colName, colName, 38)
	}
	// Varian column — wider so the "Nama:Harga:Stok" entries don't overflow.
	varianCol, _ := excelize.ColumnNumberToName(len(bulkColumns))
	_ = f.SetColWidth(bulkSheetName, varianCol, varianCol, 55)

	// Sheet 2: instructions
	_, _ = f.NewSheet(bulkInstructionName)
	instructionStyle, _ := f.NewStyle(&excelize.Style{
		Font:      &excelize.Font{Bold: true, Size: 12},
		Alignment: &excelize.Alignment{Vertical: "center"},
	})
	instructions := []struct {
		key, value string
	}{
		{"PETUNJUK BULK UPLOAD PRODUK", ""},
		{"", ""},
		{"1. Cara Pakai", ""},
		{"", "• Buka sheet 'Produk' di file ini."},
		{"", "• Mulai isi dari baris 2 (baris 1 adalah header — jangan diubah)."},
		{"", "• Kolom yang wajib: Nama Produk, Harga, Stok."},
		{"", "• URL Slug bisa dikosongkan — sistem akan auto-generate dari nama."},
		{"", "• Hapus baris contoh (baris 2 dan 3) sebelum upload."},
		{"", "• Maksimal 100 produk per upload."},
		{"", ""},
		{"2. Format Kolom", ""},
		{"Nama Produk *", "Wajib. Maksimal 200 karakter."},
		{"URL Slug", "Optional. Hanya huruf kecil, angka, dan tanda hubung. Auto dari nama jika kosong."},
		{"Deskripsi", "Optional. Boleh panjang."},
		{"Harga (Rp) *", "Wajib. Angka tanpa titik atau koma. Contoh: 35000 (bukan Rp 35.000)."},
		{"Stok *", "Wajib. Angka bulat ≥ 0."},
		{"Status", "active | inactive | sold_out. Default: active."},
		{"Berat, Dimensi", "Optional. Angka dalam gram dan cm. Dipakai hitung ongkir."},
		{"Foto URL 1–5", "Optional. URL gambar (https://...). Maks 5 foto. Upload langsung akan tersedia setelah integrasi storage."},
		{"Varian", "Optional. Format: 'Nama:Harga:Stok[:SKU]' tiap entri, dipisah ';'. Contoh: 'S:85000:5;M:85000:10;L:90000:8:KP-L'. Saat ada varian, kolom Harga/Stok parent jadi default — pembeli akan pilih varian saat checkout."},
		{"", ""},
		{"3. Setelah Upload", ""},
		{"", "• Sistem validasi setiap baris."},
		{"", "• Baris yang valid akan tersimpan, baris error akan dilaporkan beserta alasannya."},
		{"", "• Anda bisa fix baris error di file Excel dan re-upload — yang sudah tersimpan tidak akan duplikat (slug unique per toko)."},
		{"", ""},
		{"4. Tips", ""},
		{"", "• Buat slug yang singkat dan deskriptif (mis. 'keripik-pedas-500g')."},
		{"", "• Foto pakai aspect ratio 1:1 (kotak), minimal 800×800px untuk hasil terbaik."},
		{"", "• Periksa dulu beberapa produk via single-create sebelum bulk besar."},
		{"", "• Butuh bantuan? Email halo@sellon.id"},
	}
	for i, line := range instructions {
		_ = f.SetCellValue(bulkInstructionName, fmt.Sprintf("A%d", i+1), line.key)
		_ = f.SetCellValue(bulkInstructionName, fmt.Sprintf("B%d", i+1), line.value)
	}
	_ = f.SetCellStyle(bulkInstructionName, "A1", "A1", instructionStyle)
	_ = f.SetColWidth(bulkInstructionName, "A", "A", 30)
	_ = f.SetColWidth(bulkInstructionName, "B", "B", 80)

	// Set Produk as the active sheet
	if idx, err := f.GetSheetIndex(bulkSheetName); err == nil {
		f.SetActiveSheet(idx)
	}

	w.Header().Set("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
	w.Header().Set("Content-Disposition", `attachment; filename="sellon-bulk-produk-template.xlsx"`)
	if err := f.Write(w); err != nil {
		h.logger.Error("write template", "err", err)
	}
}

type bulkRowError struct {
	Row     int    `json:"row"`
	Field   string `json:"field"`
	Message string `json:"message"`
}

type bulkResultDTO struct {
	TotalRows int            `json:"total_rows"`
	Succeeded int            `json:"succeeded"`
	Failed    int            `json:"failed"`
	Errors    []bulkRowError `json:"errors"`
}

// POST /api/v1/products/bulk — multipart/form-data with field "file" (xlsx)
//
// Async: parses XLSX synchronously (small data; cheap), creates a
// bulk_jobs row, then spawns a goroutine to insert rows. Responds 202
// with {job_id} immediately so the client can navigate away and watch
// progress via GET /products/bulk/jobs/active.
func (h *ProductHandler) BulkUpload(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat — buat dulu di Pengaturan")
		return
	}

	// Plan gate: bulk upload hanya untuk Pro / Bisnis.
	sub, _ := h.subs.GetOrCreate(r.Context(), store.ID)
	if sub == nil || sub.Plan == "free" {
		response.Error(w, http.StatusPaymentRequired,
			"Upload massal hanya tersedia untuk paket Pro & Bisnis. Upgrade dulu untuk akses fitur ini.")
		return
	}

	// Limit upload size at the multipart level.
	r.Body = http.MaxBytesReader(w, r.Body, bulkMaxUploadBytes)
	if err := r.ParseMultipartForm(bulkMaxUploadBytes); err != nil {
		response.Error(w, http.StatusBadRequest, "file terlalu besar (maks 8 MB)")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		response.Error(w, http.StatusBadRequest, "field 'file' wajib")
		return
	}
	defer file.Close()

	if !strings.HasSuffix(strings.ToLower(header.Filename), ".xlsx") {
		response.Error(w, http.StatusBadRequest, "format harus .xlsx (Excel)")
		return
	}

	// Buffer file isi-nya supaya goroutine masih bisa baca setelah
	// request handler return — `file` di-close otomatis saat handler
	// exit.
	raw, err := io.ReadAll(file)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "gagal baca file")
		return
	}

	xlsx, err := excelize.OpenReader(bytes.NewReader(raw))
	if err != nil {
		h.logger.Warn("xlsx open", "err", err)
		response.Error(w, http.StatusBadRequest, "file Excel tidak valid")
		return
	}
	defer xlsx.Close()

	// Pick the sheet — prefer "Produk", else first sheet.
	sheetName := bulkSheetName
	if _, err := xlsx.GetSheetIndex(sheetName); err != nil {
		sheetName = xlsx.GetSheetList()[0]
	}

	rows, err := xlsx.GetRows(sheetName)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "gagal baca sheet")
		return
	}
	if len(rows) < 2 {
		response.Error(w, http.StatusBadRequest, "tidak ada data — sheet hanya berisi header atau kosong")
		return
	}
	dataRows := rows[1:] // skip header

	// Trim trailing blank rows (Excel sometimes adds them)
	for len(dataRows) > 0 && rowIsBlank(dataRows[len(dataRows)-1]) {
		dataRows = dataRows[:len(dataRows)-1]
	}

	if len(dataRows) > bulkMaxRows {
		response.Error(w, http.StatusBadRequest,
			fmt.Sprintf("jumlah produk %d melebihi batas %d per upload", len(dataRows), bulkMaxRows))
		return
	}
	if len(dataRows) == 0 {
		response.Error(w, http.StatusBadRequest, "tidak ada baris data")
		return
	}

	// Pro+ has unlimited products, but we keep this guard as a defensive
	// no-op for future tier changes.
	if msg, ok := h.quotaCheck(r, store.ID, len(dataRows)); !ok {
		response.Error(w, http.StatusPaymentRequired, msg)
		return
	}

	// Create job row + spawn worker.
	var actorID *uuid.UUID
	if uid, ok := auth.UserIDFromContext(r.Context()); ok {
		u := uid
		actorID = &u
	}
	jobID, err := h.bulkJobs.Create(r.Context(), repository.CreateBulkJobInput{
		StoreID:     store.ID,
		ActorUserID: actorID,
		Kind:        "products",
		Filename:    header.Filename,
		TotalRows:   len(dataRows),
	})
	if err != nil {
		h.logger.Error("bulk job create", "err", err)
		response.Error(w, http.StatusInternalServerError, "gagal mulai job")
		return
	}

	h.bulkPool.start(bulkJobTask{
		JobID:    jobID,
		StoreID:  store.ID,
		DataRows: dataRows,
	})

	response.JSON(w, http.StatusAccepted, map[string]any{
		"job_id":     jobID.String(),
		"total_rows": len(dataRows),
	})
}

// GET /api/v1/products/bulk/jobs/active
//
// Returns running jobs + recently-finished jobs (last 5 min) for the
// current store. The dashboard watcher polls this every few seconds to
// keep a persistent progress toast in sync across page navigation.
func (h *ProductHandler) BulkJobsActive(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	jobs, err := h.bulkJobs.ListActive(r.Context(), store.ID, 5)
	if err != nil {
		h.logger.Error("bulk jobs active", "err", err)
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	out := make([]bulkJobDTO, 0, len(jobs))
	for _, j := range jobs {
		out = append(out, toBulkJobDTO(j))
	}
	response.JSON(w, http.StatusOK, map[string]any{"jobs": out})
}

// GET /api/v1/products/bulk/jobs/{id}
func (h *ProductHandler) BulkJobGet(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat")
		return
	}
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusBadRequest, "invalid id")
		return
	}
	j, err := h.bulkJobs.Get(r.Context(), store.ID, id)
	if err != nil {
		if errors.Is(err, repository.ErrBulkJobNotFound) {
			response.Error(w, http.StatusNotFound, "job tidak ditemukan")
			return
		}
		response.Error(w, http.StatusInternalServerError, "internal error")
		return
	}
	response.JSON(w, http.StatusOK, map[string]any{"job": toBulkJobDTO(*j)})
}

type bulkJobDTO struct {
	ID            string         `json:"id"`
	Kind          string         `json:"kind"`
	Filename      string         `json:"filename"`
	Status        string         `json:"status"`
	TotalRows     int            `json:"total_rows"`
	ProcessedRows int            `json:"processed_rows"`
	Succeeded     int            `json:"succeeded"`
	Failed        int            `json:"failed"`
	Errors        []bulkRowError `json:"errors"`
	ErrorMessage  string         `json:"error_message"`
	CreatedAt     string         `json:"created_at"`
	UpdatedAt     string         `json:"updated_at"`
	CompletedAt   string         `json:"completed_at,omitempty"`
}

func toBulkJobDTO(j repository.BulkJob) bulkJobDTO {
	errs := make([]bulkRowError, 0, len(j.Errors))
	for _, e := range j.Errors {
		errs = append(errs, bulkRowError{Row: e.Row, Field: e.Field, Message: e.Message})
	}
	out := bulkJobDTO{
		ID:            j.ID.String(),
		Kind:          j.Kind,
		Filename:      j.Filename,
		Status:        j.Status,
		TotalRows:     j.TotalRows,
		ProcessedRows: j.ProcessedRows,
		Succeeded:     j.Succeeded,
		Failed:        j.Failed,
		Errors:        errs,
		ErrorMessage:  j.ErrorMessage,
		CreatedAt:     j.CreatedAt.Format(time.RFC3339),
		UpdatedAt:     j.UpdatedAt.Format(time.RFC3339),
	}
	if j.CompletedAt != nil {
		out.CompletedAt = j.CompletedAt.Format(time.RFC3339)
	}
	return out
}

// === Background job runner ===

type bulkJobTask struct {
	JobID    uuid.UUID
	StoreID  uuid.UUID
	DataRows [][]string
}

// bulkJobRunner manages goroutines for bulk product upload. Simple
// fire-and-go model; no queue limit per se beyond goroutine scheduler.
// One handler instance per process.
type bulkJobRunner struct {
	h      *ProductHandler
	logger *slog.Logger
}

func newBulkJobRunner(h *ProductHandler) *bulkJobRunner {
	return &bulkJobRunner{h: h, logger: h.logger}
}

func (r *bulkJobRunner) start(task bulkJobTask) {
	go r.run(task)
}

func (r *bulkJobRunner) run(task bulkJobTask) {
	// New background context — request ctx is gone by the time this fires.
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
	defer cancel()

	defer func() {
		if rec := recover(); rec != nil {
			r.logger.Error("bulk job panic", "job_id", task.JobID, "panic", rec)
			_ = r.h.bulkJobs.Fail(ctx, task.JobID, fmt.Sprintf("internal panic: %v", rec))
		}
	}()

	succeeded := 0
	failed := 0
	errs := make([]repository.BulkJobRowError, 0)
	seenSlugs := map[string]int{}

	// Throttle DB updates: write progress max every ~200ms or every 5
	// rows, whichever comes first. Keeps cost down on big imports.
	lastFlush := time.Now()
	flush := func(processed int) {
		if err := r.h.bulkJobs.UpdateProgress(ctx, task.JobID, processed, succeeded, failed, errs); err != nil {
			r.logger.Warn("bulk job progress update", "err", err, "job_id", task.JobID)
		}
		lastFlush = time.Now()
	}

	for i, row := range task.DataRows {
		excelRow := i + 2
		input, variantInputs, vErr := parseBulkRow(row)
		if vErr != nil {
			failed++
			errs = append(errs, repository.BulkJobRowError{
				Row: excelRow, Field: vErr.field, Message: vErr.msg,
			})
			r.maybeFlush(ctx, task.StoreID, task.JobID, i+1, succeeded, failed, errs, &lastFlush)
			continue
		}

		if firstRow, dup := seenSlugs[input.Slug]; dup {
			failed++
			errs = append(errs, repository.BulkJobRowError{
				Row: excelRow, Field: "URL Slug",
				Message: fmt.Sprintf("slug '%s' duplikat dengan baris %d di file ini", input.Slug, firstRow),
			})
			r.maybeFlush(ctx, task.StoreID, task.JobID, i+1, succeeded, failed, errs, &lastFlush)
			continue
		}
		seenSlugs[input.Slug] = excelRow

		input.StoreID = task.StoreID
		created, err := r.h.products.Create(ctx, input)
		if err != nil {
			failed++
			msg := "gagal simpan ke database"
			if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
				msg = "slug sudah dipakai produk lain di toko-mu"
			}
			errs = append(errs, repository.BulkJobRowError{
				Row: excelRow, Field: "URL Slug", Message: msg,
			})
			r.maybeFlush(ctx, task.StoreID, task.JobID, i+1, succeeded, failed, errs, &lastFlush)
			continue
		}

		if len(variantInputs) > 0 {
			if err := r.h.variants.ReplaceForProduct(ctx, created.ID, variantInputs); err != nil {
				r.logger.Error("bulk variants sync", "err", err, "product", created.ID.String())
				errs = append(errs, repository.BulkJobRowError{
					Row: excelRow, Field: "Varian",
					Message: "produk tersimpan tapi varian gagal disinkronkan: " + err.Error(),
				})
			}
		}
		succeeded++
		r.maybeFlush(ctx, task.StoreID, task.JobID, i+1, succeeded, failed, errs, &lastFlush)
	}

	// Final flush + complete.
	_ = flush // referenced via maybeFlush; explicit final completion below.
	if err := r.h.bulkJobs.Complete(ctx, task.JobID, succeeded, failed, errs); err != nil {
		r.logger.Error("bulk job complete", "err", err, "job_id", task.JobID)
	}
	// Push event terminal: state akhir job. FE watcher dapat sinyal
	// langsung untuk swap toast running → success/done state.
	r.publishJob(ctx, task.StoreID, task.JobID)

	// Audit log: same shape as before, just sourced from job state.
	if succeeded > 0 || failed > 0 {
		r.h.audit.Log(ctx, task.StoreID, audit.Event{
			Action:     "product.bulk_uploaded",
			EntityType: "product",
			EntityID:   task.JobID.String(),
			Summary: fmt.Sprintf("Bulk upload produk: %d berhasil, %d gagal",
				succeeded, failed),
			Metadata: map[string]any{
				"succeeded": succeeded,
				"failed":    failed,
				"total":     succeeded + failed,
				"job_id":    task.JobID.String(),
			},
		})
	}
}

func (r *bulkJobRunner) maybeFlush(ctx context.Context, storeID, jobID uuid.UUID, processed, succeeded, failed int, errs []repository.BulkJobRowError, lastFlush *time.Time) {
	if processed%5 == 0 || time.Since(*lastFlush) >= 200*time.Millisecond {
		if err := r.h.bulkJobs.UpdateProgress(ctx, jobID, processed, succeeded, failed, errs); err != nil {
			r.logger.Warn("bulk job progress update", "err", err, "job_id", jobID)
		}
		*lastFlush = time.Now()
		// Push event ke SSE subscribers — FE watcher update real-time
		// tanpa polling.
		if job, err := r.h.bulkJobs.Get(ctx, storeID, jobID); err == nil {
			r.h.broker.Publish(storeID, events.Event{
				Type:    "bulk_job.progress",
				Payload: map[string]any{"job": toBulkJobDTO(*job)},
			})
		}
	}
}

// publishJob fetches the current state of a job and broadcasts terminal
// state event. Dipanggil dari run() setelah Complete()/Fail().
func (r *bulkJobRunner) publishJob(ctx context.Context, storeID, jobID uuid.UUID) {
	job, err := r.h.bulkJobs.Get(ctx, storeID, jobID)
	if err != nil {
		return
	}
	evType := "bulk_job.completed"
	if job.Status == "failed" {
		evType = "bulk_job.failed"
	}
	r.h.broker.Publish(storeID, events.Event{
		Type:    evType,
		Payload: map[string]any{"job": toBulkJobDTO(*job)},
	})
}

type bulkValidationErr struct {
	field string
	msg   string
}

func (e *bulkValidationErr) Error() string { return e.msg }

func parseBulkRow(row []string) (repository.SaveProductInput, []repository.VariantInput, *bulkValidationErr) {
	// Pad row to expected length
	for len(row) < len(bulkColumns) {
		row = append(row, "")
	}

	name := strings.TrimSpace(row[0])
	if name == "" {
		return repository.SaveProductInput{}, nil, &bulkValidationErr{"Nama Produk", "nama produk wajib diisi"}
	}
	if len(name) > 200 {
		return repository.SaveProductInput{}, nil, &bulkValidationErr{"Nama Produk", "nama maksimal 200 karakter"}
	}

	slug := strings.TrimSpace(row[1])
	if slug == "" {
		slug = sanitizeSlug(name)
	} else {
		slug = sanitizeSlug(slug)
	}
	if slug == "" {
		return repository.SaveProductInput{}, nil, &bulkValidationErr{"URL Slug", "tidak bisa generate slug dari nama"}
	}

	priceStr := cleanNumber(row[3])
	if priceStr == "" {
		return repository.SaveProductInput{}, nil, &bulkValidationErr{"Harga (Rp)", "harga wajib diisi"}
	}
	priceRupiah, err := strconv.ParseFloat(priceStr, 64)
	if err != nil || priceRupiah < 0 {
		return repository.SaveProductInput{}, nil, &bulkValidationErr{"Harga (Rp)", "harga harus angka non-negatif"}
	}

	stockStr := cleanNumber(row[4])
	if stockStr == "" {
		return repository.SaveProductInput{}, nil, &bulkValidationErr{"Stok", "stok wajib diisi"}
	}
	stock, err := strconv.Atoi(stockStr)
	if err != nil || stock < 0 {
		return repository.SaveProductInput{}, nil, &bulkValidationErr{"Stok", "stok harus bilangan bulat ≥ 0"}
	}

	status := strings.TrimSpace(strings.ToLower(row[5]))
	if status == "" {
		status = "active"
	}
	if status != "active" && status != "inactive" && status != "sold_out" {
		return repository.SaveProductInput{}, nil, &bulkValidationErr{"Status", "status harus active, inactive, atau sold_out"}
	}

	weightG, _ := strconv.Atoi(cleanNumber(row[6]))
	lengthCm, _ := strconv.Atoi(cleanNumber(row[7]))
	widthCm, _ := strconv.Atoi(cleanNumber(row[8]))
	heightCm, _ := strconv.Atoi(cleanNumber(row[9]))

	photos := []string{}
	for i := 10; i <= 14; i++ {
		if u := strings.TrimSpace(row[i]); u != "" {
			photos = append(photos, u)
		}
	}

	variants, vErr := parseVariantsCell(row[15])
	if vErr != nil {
		return repository.SaveProductInput{}, nil, vErr
	}

	return repository.SaveProductInput{
		Name:        name,
		Slug:        slug,
		Description: strings.TrimSpace(row[2]),
		PriceCents:  int64(priceRupiah * 100),
		Stock:       stock,
		WeightG:     weightG,
		LengthCm:    lengthCm,
		WidthCm:     widthCm,
		HeightCm:    heightCm,
		Status:      status,
		PhotoURLs:   photos,
	}, variants, nil
}

// parseVariantsCell turns "S:85000:5;M:85000:10;L:90000:8:KP-L" into
// VariantInput rows. Empty/blank cell returns nil (no variants).
func parseVariantsCell(raw string) ([]repository.VariantInput, *bulkValidationErr) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil, nil
	}
	entries := strings.Split(raw, ";")
	out := make([]repository.VariantInput, 0, len(entries))
	seen := map[string]bool{}
	for idx, e := range entries {
		e = strings.TrimSpace(e)
		if e == "" {
			continue
		}
		parts := strings.Split(e, ":")
		if len(parts) < 3 {
			return nil, &bulkValidationErr{"Varian",
				fmt.Sprintf("entri %d ('%s') harus minimal 'Nama:Harga:Stok'", idx+1, e)}
		}
		vname := strings.TrimSpace(parts[0])
		if vname == "" {
			return nil, &bulkValidationErr{"Varian",
				fmt.Sprintf("entri %d: nama varian kosong", idx+1)}
		}
		if seen[strings.ToLower(vname)] {
			return nil, &bulkValidationErr{"Varian",
				fmt.Sprintf("nama varian '%s' duplikat", vname)}
		}
		seen[strings.ToLower(vname)] = true

		priceStr := cleanNumber(parts[1])
		priceRp, err := strconv.ParseFloat(priceStr, 64)
		if err != nil || priceRp < 0 {
			return nil, &bulkValidationErr{"Varian",
				fmt.Sprintf("entri '%s': harga harus angka non-negatif", vname)}
		}
		stockStr := cleanNumber(parts[2])
		stk, err := strconv.Atoi(stockStr)
		if err != nil || stk < 0 {
			return nil, &bulkValidationErr{"Varian",
				fmt.Sprintf("entri '%s': stok harus bilangan bulat ≥ 0", vname)}
		}
		sku := ""
		if len(parts) >= 4 {
			sku = strings.TrimSpace(parts[3])
		}
		out = append(out, repository.VariantInput{
			Name:       vname,
			SKU:        sku,
			PriceCents: int64(priceRp * 100),
			Stock:      stk,
			SortOrder:  idx,
		})
	}
	return out, nil
}

// cleanNumber strips common Indonesian formatting (Rp, dots, commas, spaces).
func cleanNumber(s string) string {
	s = strings.TrimSpace(s)
	if s == "" {
		return ""
	}
	s = strings.ReplaceAll(s, ".", "")
	s = strings.ReplaceAll(s, ",", "")
	s = strings.ReplaceAll(s, " ", "")
	s = strings.TrimPrefix(s, "Rp")
	s = strings.TrimPrefix(s, "rp")
	return s
}

func rowIsBlank(row []string) bool {
	for _, c := range row {
		if strings.TrimSpace(c) != "" {
			return false
		}
	}
	return true
}

// Reserve to silence unused-import warning when we add a bulk error helper.
var _ = errors.New

// GET /api/v1/products/bulk/jobs/stream
//
// Long-lived Server-Sent Events stream — pengganti polling /bulk/jobs/
// active tiap 2.5s. FE subscribe sekali per session, dapat push real-
// time tiap kali runner flush progress + saat job terminal. Pattern
// sama dengan /orders/stream.
func (h *ProductHandler) BulkJobsStream(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		http.Error(w, "no store", http.StatusBadRequest)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache, no-transform")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	rc := http.NewResponseController(w)
	_ = rc.SetWriteDeadline(time.Time{})

	ch := h.broker.Subscribe(store.ID)
	defer h.broker.Unsubscribe(store.ID, ch)

	// Initial snapshot — kirim active jobs yang sudah running supaya
	// FE bisa render toast langsung tanpa nunggu event berikutnya.
	if jobs, err := h.bulkJobs.ListActive(r.Context(), store.ID, 5); err == nil {
		out := make([]bulkJobDTO, 0, len(jobs))
		for _, j := range jobs {
			out = append(out, toBulkJobDTO(j))
		}
		if payload, err := json.Marshal(map[string]any{"jobs": out}); err == nil {
			fmt.Fprintf(w, "event: bulk_job.snapshot\ndata: %s\n\n", payload)
			flusher.Flush()
		}
	}

	ping := time.NewTicker(25 * time.Second)
	defer ping.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ping.C:
			fmt.Fprint(w, ": ping\n\n")
			flusher.Flush()
		case ev, ok := <-ch:
			if !ok {
				return
			}
			// Hanya bulk_job.* event yang relevan untuk stream ini.
			// Event lain (mis. order.created) di-skip — same broker,
			// beda concern.
			if !strings.HasPrefix(ev.Type, "bulk_job.") {
				continue
			}
			payload, err := json.Marshal(ev.Payload)
			if err != nil {
				h.logger.Warn("bulk sse marshal", "err", err)
				continue
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", ev.Type, payload)
			flusher.Flush()
		}
	}
}
