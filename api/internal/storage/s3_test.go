package storage

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// TestSigV4MatchesAWSCLI pins our signer against a golden vector produced by
// an INDEPENDENT implementation: the official AWS CLI (botocore) signing a
// PUT to the real Cloudeka endpoint. Captured with:
//
//	AWS_ACCESS_KEY_ID=AKIDEXAMPLE \
//	AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY \
//	aws s3api put-object --endpoint-url https://kencana.basic.box.cloudeka.id \
//	  --bucket sellon-bucket-cosdi7 --key testprefix/hello.txt --body body.txt \
//	  --content-type text/plain --acl public-read --region kencana --debug
//
// A signing bug is otherwise invisible until a real upload 403s, so this is
// the test that matters. The credentials are AWS's public documentation
// examples, not live secrets.
func TestSigV4MatchesAWSCLI(t *testing.T) {
	const (
		wantCanonicalHash = "de71c1c26511e8e6408c8e6b709b8309cc0e78386bb136c4a429cd4aec523888"
		wantSignature     = "ea1c5f859736f21feb1244e7305b71e4cb7bc8e300576bae4cd2c2d8b81064fb"
		wantSignedHeaders = "content-md5;content-type;host;x-amz-acl;x-amz-content-sha256;x-amz-date"
	)
	signedAt, err := time.Parse("20060102T150405Z", "20260904T115129Z")
	if err != nil {
		t.Fatal(err)
	}

	req, err := http.NewRequest(http.MethodPut,
		"https://kencana.basic.box.cloudeka.id/sellon-bucket-cosdi7/testprefix/hello.txt", nil)
	if err != nil {
		t.Fatal(err)
	}
	// Mirror exactly the header set the CLI signed.
	req.Header.Set("Content-Type", "text/plain")
	req.Header.Set("Content-MD5", "eC3U4FkW7P5/VP0qnz11fA==")
	req.Header.Set("X-Amz-Acl", "public-read")

	s := sigV4Signer{
		accessKey: "AKIDEXAMPLE",
		secretKey: "wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY",
		region:    "kencana",
		service:   "s3",
	}
	// The CLI used UNSIGNED-PAYLOAD for this streaming upload; pass the same
	// payload hash so the two canonical requests are comparable.
	s.sign(req, "UNSIGNED-PAYLOAD", signedAt)

	auth := req.Header.Get("Authorization")
	if !strings.Contains(auth, "Signature="+wantSignature) {
		t.Errorf("signature mismatch\n got: %s\nwant Signature=%s", auth, wantSignature)
	}
	if !strings.Contains(auth, "SignedHeaders="+wantSignedHeaders) {
		t.Errorf("signed headers mismatch\n got: %s\nwant SignedHeaders=%s", auth, wantSignedHeaders)
	}
	if !strings.Contains(auth, "Credential=AKIDEXAMPLE/20260904/kencana/s3/aws4_request") {
		t.Errorf("credential scope mismatch: %s", auth)
	}

	// Recompute the canonical-request hash the same way sign() does, so a
	// regression points at the canonicalisation rather than just the HMAC.
	canonicalHeaders, signedHeaders := canonicalizeHeaders(req)
	canonical := strings.Join([]string{
		req.Method,
		canonicalURI(req.URL.EscapedPath()),
		canonicalQuery(req.URL.RawQuery),
		canonicalHeaders,
		signedHeaders,
		"UNSIGNED-PAYLOAD",
	}, "\n")
	if got := hashHex([]byte(canonical)); got != wantCanonicalHash {
		t.Errorf("canonical request hash mismatch\n got %s\nwant %s\ncanonical request:\n%s",
			got, wantCanonicalHash, canonical)
	}
}

func TestCanonicalURIEncodesSegmentsNotSlashes(t *testing.T) {
	cases := []struct{ in, want string }{
		{"/bucket/a/b.txt", "/bucket/a/b.txt"},
		// Spaces must be %20, never "+".
		{"/bucket/my%20file.png", "/bucket/my%20file.png"},
		// Unreserved characters stay literal.
		{"/bucket/a-b_c.d~e", "/bucket/a-b_c.d~e"},
		// Non-ASCII is percent-encoded per UTF-8 byte.
		{"/bucket/kopi%C3%A9.png", "/bucket/kopi%C3%A9.png"},
		{"", "/"},
	}
	for _, c := range cases {
		if got := canonicalURI(c.in); got != c.want {
			t.Errorf("canonicalURI(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestIsConfiguredRejectsPlaceholders(t *testing.T) {
	// A half-configured deploy must read as "not configured" so handlers
	// answer 503 rather than letting sellers hit opaque 403s.
	ph := NewS3Client("https://x.example", "kencana", "b", "YOUR_ACCESS_KEY", "YOUR_SECRET_KEY", "https://api.example/api/v1/files")
	if ph.IsConfigured() {
		t.Error("placeholder credentials must not count as configured")
	}
	empty := NewS3Client("https://x.example", "kencana", "b", "", "", "https://api.example/api/v1/files")
	if empty.IsConfigured() {
		t.Error("empty credentials must not count as configured")
	}
	noBucket := NewS3Client("https://x.example", "kencana", "", "AK", "SK", "https://api.example/api/v1/files")
	if noBucket.IsConfigured() {
		t.Error("missing bucket must not count as configured")
	}
	ok := NewS3Client("https://x.example", "kencana", "b", "AK", "SK", "https://api.example/api/v1/files")
	if !ok.IsConfigured() {
		t.Error("fully configured client should report configured")
	}
}

func TestPathFromPublicURLOnlyClaimsOwnBucket(t *testing.T) {
	c := NewS3Client("https://kencana.basic.box.cloudeka.id/", "kencana", "sellon-bucket-cosdi7",
		"AK", "SK", "https://api.sellon.id/api/v1/files")
	// Stored URLs point at the API read-proxy, not the private bucket.
	base := "https://api.sellon.id/api/v1/files/"

	if got := c.PathFromPublicURL(base + "store-1/product/x.jpg"); got != "store-1/product/x.jpg" {
		t.Errorf("own URL: got %q", got)
	}
	if got := c.PathFromPublicURL(base + "store-1/product/x.jpg?v=2"); got != "store-1/product/x.jpg" {
		t.Errorf("query string should be stripped: got %q", got)
	}
	// A foreign URL must yield "" — callers treat "" as "skip", and a wrong
	// non-empty key here would delete an unrelated object.
	for _, foreign := range []string{
		"https://cdn.example.com/store-1/product/x.jpg",
		"https://kencana.basic.box.cloudeka.id/sellon-bucket-cosdi7/store-1/x.jpg",
		"https://other.example/api/v1/files/store-1/x.jpg",
		"https://xyz.supabase.co/storage/v1/object/public/stores/store-1/x.jpg",
		"",
	} {
		if got := c.PathFromPublicURL(foreign); got != "" {
			t.Errorf("PathFromPublicURL(%q) = %q, want \"\"", foreign, got)
		}
	}
}

// The upload must actually be a signed PUT carrying the payload hash, and the
// returned public URL must be the one PathFromPublicURL can reverse.
func TestUploadPutsSignedObject(t *testing.T) {
	var gotMethod, gotPath, gotAuth, gotSHA, gotType string
	var gotBody []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotMethod, gotPath = r.Method, r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotSHA = r.Header.Get("X-Amz-Content-Sha256")
		gotType = r.Header.Get("Content-Type")
		buf := make([]byte, r.ContentLength)
		_, _ = r.Body.Read(buf)
		gotBody = buf
		w.WriteHeader(http.StatusOK)
	}))
	defer srv.Close()

	c := NewS3Client(srv.URL, "kencana", "sellon-bucket-cosdi7", "AK", "SK", "https://api.example/api/v1/files")
	res, err := c.Upload(context.Background(), "store-1/product/a.png", "image/png", []byte("PNGDATA"))
	if err != nil {
		t.Fatalf("upload: %v", err)
	}
	if gotMethod != http.MethodPut {
		t.Errorf("method = %s, want PUT", gotMethod)
	}
	if gotPath != "/sellon-bucket-cosdi7/store-1/product/a.png" {
		t.Errorf("path-style addressing expected, got %s", gotPath)
	}
	if gotType != "image/png" {
		t.Errorf("content type = %s", gotType)
	}
	if string(gotBody) != "PNGDATA" {
		t.Errorf("body = %q", gotBody)
	}
	if gotSHA != hashHex([]byte("PNGDATA")) {
		t.Errorf("payload hash header = %s, want sha256 of body", gotSHA)
	}
	if !strings.HasPrefix(gotAuth, "AWS4-HMAC-SHA256 Credential=AK/") {
		t.Errorf("authorization = %q", gotAuth)
	}
	if got := c.PathFromPublicURL(res.PublicURL); got != "store-1/product/a.png" {
		t.Errorf("public URL does not round-trip: %q → %q", res.PublicURL, got)
	}
}

// A key that is already gone is the desired end state, so 404 must not be an
// error — otherwise a retried cleanup would log noise forever.
func TestDeleteTreats404AsSuccess(t *testing.T) {
	var calls int
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := NewS3Client(srv.URL, "kencana", "b", "AK", "SK", "https://api.example/api/v1/files")
	if err := c.DeleteObjects(context.Background(), []string{"a.png", "", "  ", "b.png"}); err != nil {
		t.Fatalf("404 should not be an error: %v", err)
	}
	if calls != 2 {
		t.Errorf("blank keys should be skipped: %d requests, want 2", calls)
	}
}

// MultiClient exists so pre-migration Supabase URLs stay deletable.
func TestMultiClientRoutesLegacyURLs(t *testing.T) {
	primary := NewS3Client("https://s3.example", "kencana", "newbucket", "AK", "SK", "https://api.example/api/v1/files")
	legacy := NewSupabaseClient("https://xyz.supabase.co", "service-key", "stores")

	c := NewMultiClient(primary, legacy)

	newURL := "https://api.example/api/v1/files/store-1/a.png"
	oldURL := "https://xyz.supabase.co/storage/v1/object/public/stores/store-1/b.png"

	if got := c.PathFromPublicURL(newURL); got != "store-1/a.png" {
		t.Errorf("primary URL: got %q", got)
	}
	if got := c.PathFromPublicURL(oldURL); got != "store-1/b.png" {
		t.Errorf("legacy URL must still resolve: got %q", got)
	}
	if got := c.PathFromPublicURL("https://elsewhere.example/x.png"); got != "" {
		t.Errorf("unknown host: got %q", got)
	}

	// With no legacy backend configured the router collapses to the primary.
	if _, isMulti := NewMultiClient(primary, nil).(*MultiClient); isMulti {
		t.Error("nil legacy should return the primary client directly")
	}
	unconfiguredLegacy := NewSupabaseClient("", "", "")
	if _, isMulti := NewMultiClient(primary, unconfiguredLegacy).(*MultiClient); isMulti {
		t.Error("unconfigured legacy should return the primary client directly")
	}

	// Rollout safety: this code reaches production before S3_* is set on the
	// host. An unconfigured S3 primary must fall back to the still-working
	// legacy backend instead of 503-ing every upload.
	unconfiguredS3 := NewS3Client("", "", "", "", "", "")
	got := NewMultiClient(unconfiguredS3, legacy)
	if got != Client(legacy) {
		t.Error("unconfigured primary should fall back to the configured legacy backend")
	}
	if !got.IsConfigured() {
		t.Error("fallback client should report configured so uploads keep working")
	}

	// Neither configured → handlers must see IsConfigured() false (503).
	if NewMultiClient(unconfiguredS3, unconfiguredLegacy).IsConfigured() {
		t.Error("with neither backend configured, storage must report unconfigured")
	}
}
