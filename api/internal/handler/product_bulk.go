package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/xuri/excelize/v2"

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
func (h *ProductHandler) BulkUpload(w http.ResponseWriter, r *http.Request) {
	store, err := h.requireStore(r)
	if err != nil {
		response.Error(w, http.StatusBadRequest, "toko belum dibuat — buat dulu di Pengaturan")
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

	xlsx, err := excelize.OpenReader(file)
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

	// Refuse the whole upload up front if it would push the seller past
	// their tier quota — partial saves leave the seller in a confusing
	// half-state.
	if msg, ok := h.quotaCheck(r, store.ID, len(dataRows)); !ok {
		response.Error(w, http.StatusPaymentRequired, msg)
		return
	}

	result := bulkResultDTO{TotalRows: len(dataRows)}
	seenSlugs := map[string]int{} // slug -> row number where first seen

	for i, row := range dataRows {
		excelRow := i + 2 // +2 because header is row 1 and arrays are 0-indexed

		input, variantInputs, validationErr := parseBulkRow(row)
		if validationErr != nil {
			result.Failed++
			result.Errors = append(result.Errors, bulkRowError{
				Row: excelRow, Field: validationErr.field, Message: validationErr.msg,
			})
			continue
		}

		// Local-batch slug duplicate check
		if firstRow, dup := seenSlugs[input.Slug]; dup {
			result.Failed++
			result.Errors = append(result.Errors, bulkRowError{
				Row: excelRow, Field: "URL Slug",
				Message: fmt.Sprintf("slug '%s' duplikat dengan baris %d di file ini", input.Slug, firstRow),
			})
			continue
		}
		seenSlugs[input.Slug] = excelRow

		input.StoreID = store.ID
		created, err := h.products.Create(r.Context(), input)
		if err != nil {
			result.Failed++
			msg := "gagal simpan ke database"
			if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
				msg = "slug sudah dipakai produk lain di toko-mu"
			}
			result.Errors = append(result.Errors, bulkRowError{
				Row: excelRow, Field: "URL Slug", Message: msg,
			})
			continue
		}

		// Sync variants if the row supplied any. ReplaceForProduct also flips
		// products.has_variants for us. Failure here is reported but doesn't
		// retroactively delete the parent — the seller can re-edit via the UI.
		if len(variantInputs) > 0 {
			if err := h.variants.ReplaceForProduct(r.Context(), created.ID, variantInputs); err != nil {
				h.logger.Error("bulk variants sync", "err", err, "product", created.ID.String())
				result.Errors = append(result.Errors, bulkRowError{
					Row: excelRow, Field: "Varian",
					Message: "produk tersimpan tapi varian gagal disinkronkan: " + err.Error(),
				})
				// Count as succeeded (parent saved); don't increment Failed —
				// seller already has a draft product to fix.
			}
		}
		result.Succeeded++
	}

	response.JSON(w, http.StatusOK, result)
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
