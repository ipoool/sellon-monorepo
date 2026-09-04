package storage

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"testing"
	"time"
)

// TestS3LiveRoundTrip exercises the real bucket: signed upload, signed read,
// confirmation that the bucket stays PRIVATE, then delete.
//
// Skipped unless S3_LIVE_TEST=1, so `go test ./...` stays offline-safe. Run
// it after changing sigv4.go or pointing at a new bucket:
//
//	set -a; . ./.env; set +a
//	cd api && S3_LIVE_TEST=1 go test ./internal/storage/ -run Live -v
//
// The anonymous-read assertion is inverted on purpose. This deployment
// serves assets through the API's /api/v1/files proxy precisely because the
// bucket is closed; if a raw object URL ever became publicly readable, that
// would be an unintended exposure, not a fix.
func TestS3LiveRoundTrip(t *testing.T) {
	if os.Getenv("S3_LIVE_TEST") != "1" {
		t.Skip("set S3_LIVE_TEST=1 (and the S3_* credentials) to run against the real bucket")
	}
	publicBase := os.Getenv("S3_PUBLIC_BASE_URL")
	if publicBase == "" {
		publicBase = "http://localhost:8080/api/v1/files"
	}
	c := NewS3Client(
		os.Getenv("S3_ENDPOINT"),
		os.Getenv("S3_REGION"),
		os.Getenv("S3_BUCKET"),
		os.Getenv("S3_ACCESS_KEY"),
		os.Getenv("S3_SECRET_KEY"),
		publicBase,
	)
	if !c.IsConfigured() {
		t.Fatal("S3 client reports unconfigured — check S3_ENDPOINT/REGION/BUCKET and that the credentials are not the placeholders")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()

	// Namespaced under _selftest/ so it can never collide with a real store's
	// prefix ({store_id}/...), and deleted at the end either way.
	key, err := RandomKey("_selftest", "txt")
	if err != nil {
		t.Fatal(err)
	}
	payload := []byte("sellon storage self-test " + time.Now().UTC().Format(time.RFC3339))

	t.Logf("PUT %s", key)
	res, err := c.Upload(ctx, key, "text/plain", payload)
	if err != nil {
		t.Fatalf("upload failed: %v", err)
	}
	t.Logf("stored URL (proxy): %s", res.PublicURL)

	cleaned := false
	defer func() {
		if cleaned {
			return
		}
		if err := c.DeleteObjects(context.Background(), []string{key}); err != nil {
			t.Errorf("cleanup delete failed: %v", err)
		}
	}()

	if res.Path != key {
		t.Errorf("returned path %q != uploaded key %q", res.Path, key)
	}
	if got := c.PathFromPublicURL(res.PublicURL); got != key {
		t.Errorf("stored URL does not round-trip: %q → %q, want %q", res.PublicURL, got, key)
	}

	// Signed read — this is the path the /api/v1/files proxy uses.
	obj, err := c.Get(ctx, key, "")
	if err != nil {
		t.Fatalf("signed GET failed: %v", err)
	}
	body, _ := io.ReadAll(obj.Body)
	obj.Body.Close()
	if string(body) != string(payload) {
		t.Errorf("signed GET body mismatch\n got: %q\nwant: %q", truncate(string(body), 200), payload)
	}
	if obj.ContentType != "text/plain" {
		t.Errorf("content type round-trip: got %q", obj.ContentType)
	}
	t.Logf("signed read OK (%d bytes, etag %s)", len(body), obj.ETag)

	// Conditional read must save the transfer.
	if _, err := c.Get(ctx, key, obj.ETag); !IsNotModified(err) {
		t.Errorf("If-None-Match should yield not-modified, got %v", err)
	} else {
		t.Log("conditional GET OK — 304, no body transferred")
	}

	// The raw object URL must NOT be world-readable.
	rawURL := strings.TrimRight(os.Getenv("S3_ENDPOINT"), "/") + "/" +
		os.Getenv("S3_BUCKET") + "/" + key
	_, status, err := anonGet(ctx, rawURL)
	if err != nil {
		t.Fatalf("anonymous probe failed: %v", err)
	}
	if status == http.StatusOK {
		t.Errorf("SECURITY: raw object URL is publicly readable (%s). "+
			"This deployment expects a private bucket fronted by /api/v1/files.", rawURL)
	} else {
		t.Logf("bucket is private as expected — anonymous read returns %d", status)
	}

	if err := c.DeleteObjects(ctx, []string{key}); err != nil {
		t.Fatalf("delete failed: %v", err)
	}
	cleaned = true
	if _, err := c.Get(ctx, key, ""); err == nil {
		t.Error("object still readable after delete")
	} else {
		t.Log("delete OK — object gone")
	}
}

func anonGet(ctx context.Context, url string) (string, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", 0, err
	}
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return "", 0, err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	return string(b), resp.StatusCode, nil
}

func truncate(s string, n int) string {
	s = strings.TrimSpace(s)
	if len(s) <= n {
		return s
	}
	return fmt.Sprintf("%s… (%d bytes total)", s[:n], len(s))
}
