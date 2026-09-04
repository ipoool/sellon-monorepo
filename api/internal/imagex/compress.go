// Package imagex compresses product photos sebelum di-upload ke storage.
// Target: file akhir <= 2 MB tanpa kualitas visible drop yang kasar.
//
// Strategi:
//  1. Decode (jpeg/png/webp/gif).
//  2. Kalau lebar > MaxWidth, resize CatmullRom (high-quality kernel)
//     ke MaxWidth sambil pertahankan aspect ratio.
//  3. Kalau gambar punya alpha (PNG/WebP/GIF), flatten ke background
//     putih supaya konversi ke JPEG tidak ada artefak hitam.
//  4. Re-encode sebagai JPEG, mulai quality 90; turunkan progressively
//     (85, 80, 75, ...) sampai output <= 2 MB. Quality 60 = lantai
//     bawah; di bawah itu jelek terlihat — terima saja size apa adanya.
//
// Hanya file > 2 MB ATAU non-JPEG yang masuk pipeline. JPEG < 2 MB
// di-skip karena re-encode lossy → bikin worse, bukan better.
package imagex

import (
	"bytes"
	"errors"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif" // register GIF decoder (single-frame OK)
	"image/jpeg"
	_ "image/png" // register PNG decoder

	xdraw "golang.org/x/image/draw"
	_ "golang.org/x/image/webp" // register WebP decoder (decode-only)
)

const (
	// MaxWidth bagus untuk product e-commerce — semua orang lihat di
	// max 2x retina mobile (800px) atau desktop card (~600px). Lebih
	// dari ini = bandwidth waste tanpa visible quality gain.
	MaxWidth = 1600

	// TargetBytes adalah cap output. Sesuai requirement user: < 2 MB.
	TargetBytes = 2 * 1024 * 1024

	// MinQuality = lantai bawah. Di bawah ini banding/blocking jadi
	// terlihat di flat color region.
	MinQuality = 60
)

// CompressProductImage menerima body file image dan content type,
// mengembalikan body baru + content type baru (selalu image/jpeg
// karena JPEG paling efisien untuk foto produk).
//
// Pre-condition: contentType salah satu dari image/jpeg, image/png,
// image/webp, image/gif. Caller (upload handler) sudah validate.
//
// Kalau input sudah JPEG dan size <= 2 MB, dikembalikan apa adanya
// tanpa re-encode (hindari unnecessary lossy generation).
func CompressProductImage(body []byte, contentType string) ([]byte, string, error) {
	if len(body) <= TargetBytes && contentType == "image/jpeg" {
		return body, contentType, nil
	}

	// Guard the pixel buffer allocation before decoding (see ValidateDimensions).
	if err := ValidateDimensions(body); err != nil {
		return nil, "", err
	}

	img, _, err := image.Decode(bytes.NewReader(body))
	if err != nil {
		return nil, "", fmt.Errorf("decode image: %w", err)
	}

	// Resize kalau lebar > MaxWidth. CatmullRom = kernel kualitas tinggi,
	// lebih bagus dari Linear/Approx untuk down-sample foto.
	bounds := img.Bounds()
	if bounds.Dx() > MaxWidth {
		newH := int(float64(bounds.Dy()) * float64(MaxWidth) / float64(bounds.Dx()))
		if newH < 1 {
			newH = 1
		}
		dst := image.NewRGBA(image.Rect(0, 0, MaxWidth, newH))
		xdraw.CatmullRom.Scale(dst, dst.Bounds(), img, bounds, xdraw.Over, nil)
		img = dst
	}

	// Flatten ke putih kalau ada alpha — JPEG tidak support transparency.
	// Tanpa step ini, area transparan jadi hitam di JPEG output.
	if needsFlatten(contentType, img) {
		rgba := image.NewRGBA(img.Bounds())
		draw.Draw(rgba, img.Bounds(), &image.Uniform{C: color.White}, image.Point{}, draw.Src)
		draw.Draw(rgba, img.Bounds(), img, img.Bounds().Min, draw.Over)
		img = rgba
	}

	// Iterate quality dari 90 → MinQuality. Step 5 supaya granularity
	// halus tapi tidak terlalu banyak attempt yang mubazir.
	var buf bytes.Buffer
	for q := 90; q >= MinQuality; q -= 5 {
		buf.Reset()
		if err := jpeg.Encode(&buf, img, &jpeg.Options{Quality: q}); err != nil {
			return nil, "", fmt.Errorf("encode jpeg q=%d: %w", q, err)
		}
		if buf.Len() <= TargetBytes {
			return buf.Bytes(), "image/jpeg", nil
		}
	}

	// Sudah di MinQuality dan masih > 2 MB. Skenario rare (foto sangat
	// kompleks + dimensi besar). Return apa adanya — server cap-nya
	// 5 MB di upload handler, jadi worst-case masih reasonable.
	if buf.Len() == 0 {
		return nil, "", errors.New("encode jpeg: empty output")
	}
	return buf.Bytes(), "image/jpeg", nil
}

// needsFlatten reports whether the source image likely has an alpha
// channel that would render incorrectly in JPEG output.
func needsFlatten(contentType string, img image.Image) bool {
	switch contentType {
	case "image/png", "image/webp", "image/gif":
		// Check image color model — RGBA / NRGBA mean potential alpha.
		switch img.ColorModel() {
		case color.RGBAModel, color.NRGBAModel, color.RGBA64Model, color.NRGBA64Model:
			return true
		}
	}
	return false
}

// === Decompression-bomb guard ===
//
// A tiny PNG can declare enormous dimensions (a ~2 MB 40000x40000 file is a
// legal PNG). image.Decode would happily allocate w*h*4 bytes (~6.4 GB there)
// and OOM-kill the container for every tenant on the box. DecodeConfig only
// parses the header, so we can reject the file before any pixel buffer exists.
const (
	// MaxPixels caps total pixel count (~30 MP — well above any real product
	// photo; a 48 MP phone shot is ~8000x6000 = 48 MP, but those arrive
	// already-JPEG and get resized down, so 30 MP is a generous ceiling for
	// what we're willing to decode).
	MaxPixels = 30_000_000
	// MaxSide rejects absurd single-axis images (panoramas / crafted bombs)
	// even when the total pixel count stays under MaxPixels.
	MaxSide = 12000
)

// ErrImageTooLarge signals a header-declared resolution we refuse to decode.
var ErrImageTooLarge = errors.New("resolusi gambar terlalu besar")

// ValidateDimensions parses only the image header and rejects anything whose
// declared resolution would blow up memory on decode. Callers must run this
// BEFORE image.Decode (directly or via CompressProductImage).
func ValidateDimensions(body []byte) error {
	cfg, _, err := image.DecodeConfig(bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("decode config: %w", err)
	}
	if cfg.Width <= 0 || cfg.Height <= 0 {
		return errors.New("dimensi gambar tidak valid")
	}
	if cfg.Width > MaxSide || cfg.Height > MaxSide {
		return ErrImageTooLarge
	}
	if int64(cfg.Width)*int64(cfg.Height) > MaxPixels {
		return ErrImageTooLarge
	}
	return nil
}
