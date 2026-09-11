package handler

import "testing"

// Paid deliverables must never be readable through the public asset proxy.
// They are served by /api/v1/download/{token}/file, which checks the buyer's
// OTP session and honours revoke + expiry; if the proxy also served them,
// both of those become decorative the moment a link is forwarded.
func TestDigitalKeysAreNotPubliclyServable(t *testing.T) {
	blocked := []string{
		"11111111-2222-3333-4444-555555555555/digital/20260101-000000-abcdef.pdf",
		"digital/loose-file.zip",
		"store/nested/digital/deep.epub",
	}
	for _, k := range blocked {
		if !isDigitalDeliverableKey(k) {
			t.Errorf("key %q must be blocked from the public proxy", k)
		}
	}

	// Storefront assets must keep working — over-blocking would break every
	// product photo on every store.
	allowed := []string{
		"11111111-2222-3333-4444-555555555555/products/20260101-000000-abcdef.jpg",
		"11111111-2222-3333-4444-555555555555/commons/logos/x.png",
		"11111111-2222-3333-4444-555555555555/commons/banners/x.png",
		"11111111-2222-3333-4444-555555555555/payment_proofs/order/x.jpg",
		"platform/banners/x.png",
		// A product whose name merely contains the word must not be caught.
		"11111111-2222-3333-4444-555555555555/products/digital-planner.jpg",
	}
	for _, k := range allowed {
		if isDigitalDeliverableKey(k) {
			t.Errorf("key %q must stay publicly servable", k)
		}
	}
}

func TestDownloadFilenameIsSafe(t *testing.T) {
	cases := []struct{ product, key, want string }{
		{"Ebook Jualan Online", "s/digital/x.pdf", "Ebook Jualan Online.pdf"},
		// Characters that would break a Content-Disposition header or a
		// filesystem are replaced, never passed through.
		{`Bad"Name/With\Slashes`, "s/digital/x.zip", "Bad-Name-With-Slashes.zip"},
		{"", "s/digital/x.pdf", "file.pdf"},
		{"   ", "s/digital/x.pdf", "file.pdf"},
		{"Produk", "s/digital/noext", "Produk"},
	}
	for _, c := range cases {
		if got := downloadFilename(c.product, c.key); got != c.want {
			t.Errorf("downloadFilename(%q, %q) = %q, want %q", c.product, c.key, got, c.want)
		}
	}
	// A quote must never survive into the header value.
	if got := downloadFilename(`a"b`, "s/digital/x.pdf"); got != "a-b.pdf" {
		t.Errorf("quote not neutralised: %q", got)
	}
}

// The DTO must hand out the gated endpoint, never the object URL.
func TestDigitalFileEndpointHidesObjectURL(t *testing.T) {
	const token = "tok_abcdefghijklmnopqrstuvwxyz"
	got := digitalFileEndpoint(token, "https://api.example/api/v1/files/store/digital/x.pdf")
	if got != "/api/v1/download/"+token+"/file" {
		t.Errorf("got %q", got)
	}
	// No file configured → no link at all.
	if digitalFileEndpoint(token, "") != "" {
		t.Error("a product with no file should yield no download link")
	}
	if digitalFileEndpoint(token, "   ") != "" {
		t.Error("whitespace-only file URL should yield no download link")
	}
}
