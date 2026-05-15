// Package storage wraps the bits of Supabase Storage's REST API we need
// for hosting product photos. We don't use a vendored SDK — the surface
// is small (one PUT + a public-URL helper) and avoiding a new dep keeps
// the binary lean.
package storage

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type SupabaseClient struct {
	baseURL    string
	serviceKey string
	bucket     string
	http       *http.Client
}

func NewSupabaseClient(baseURL, serviceKey, bucket string) *SupabaseClient {
	return &SupabaseClient{
		baseURL:    strings.TrimRight(baseURL, "/"),
		serviceKey: serviceKey,
		bucket:     bucket,
		http:       &http.Client{Timeout: 30 * time.Second},
	}
}

// IsConfigured reports whether the client has the credentials needed to
// upload. Handlers should short-circuit with 503 when this is false rather
// than attempting an upload that will obviously fail.
func (c *SupabaseClient) IsConfigured() bool {
	return c != nil && c.baseURL != "" && c.serviceKey != "" && c.bucket != ""
}

// RandomKey returns a random object key in the form `{prefix}/{stamp}-{hex}.{ext}`.
// Caller passes the file extension (without leading dot).
func RandomKey(prefix, ext string) (string, error) {
	if ext == "" {
		ext = "jpg"
	}
	var buf [8]byte
	if _, err := rand.Read(buf[:]); err != nil {
		return "", err
	}
	stamp := time.Now().UTC().Format("20060102-150405")
	key := stamp + "-" + hex.EncodeToString(buf[:]) + "." + ext
	if prefix != "" {
		key = strings.Trim(prefix, "/") + "/" + key
	}
	return key, nil
}

type UploadResult struct {
	Path      string `json:"path"`
	PublicURL string `json:"url"`
}

// Upload puts the body bytes into the configured bucket at `path`.
// `contentType` is forwarded to Supabase so the resulting public URL serves
// the right MIME.
func (c *SupabaseClient) Upload(ctx context.Context, path, contentType string, body []byte) (*UploadResult, error) {
	if !c.IsConfigured() {
		return nil, errors.New("supabase storage tidak dikonfigurasi")
	}
	if path == "" {
		return nil, errors.New("path kosong")
	}
	url := fmt.Sprintf("%s/storage/v1/object/%s/%s", c.baseURL, c.bucket, path)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Content-Type", contentType)
	// Don't overwrite — collisions on a hex key are vanishingly unlikely
	// and an explicit error helps debugging if they ever happen.
	req.Header.Set("x-upsert", "false")
	req.Header.Set("Cache-Control", "3600")

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("supabase upload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("supabase upload status %d: %s", resp.StatusCode, string(body))
	}

	publicURL := fmt.Sprintf("%s/storage/v1/object/public/%s/%s", c.baseURL, c.bucket, path)
	return &UploadResult{Path: path, PublicURL: publicURL}, nil
}

// PathFromPublicURL extracts the bucket-relative object key from a
// Supabase public URL. Returns "" jika URL bukan dari bucket yang
// di-configure — caller harus skip silently agar gambar dari domain
// lain (mis. CDN external) tidak salah dipotong.
func (c *SupabaseClient) PathFromPublicURL(rawURL string) string {
	if rawURL == "" || c == nil || c.bucket == "" {
		return ""
	}
	// Format: {baseURL}/storage/v1/object/public/{bucket}/{path}
	marker := "/storage/v1/object/public/" + c.bucket + "/"
	idx := strings.Index(rawURL, marker)
	if idx < 0 {
		return ""
	}
	return rawURL[idx+len(marker):]
}

// DeleteObjects removes a batch of objects from the bucket. Supabase
// expects DELETE /storage/v1/object/{bucket} with body
// `{"prefixes": [...]}`. Paths bucket-relative. Empty list = no-op.
// Errors don't propagate per-object — call returns first transport-
// level error.
func (c *SupabaseClient) DeleteObjects(ctx context.Context, paths []string) error {
	if !c.IsConfigured() {
		return errors.New("supabase storage tidak dikonfigurasi")
	}
	// Filter out blanks.
	clean := make([]string, 0, len(paths))
	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		clean = append(clean, p)
	}
	if len(clean) == 0 {
		return nil
	}
	url := fmt.Sprintf("%s/storage/v1/object/%s", c.baseURL, c.bucket)
	body, err := json.Marshal(map[string]any{"prefixes": clean})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("supabase delete: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		errBody, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return fmt.Errorf("supabase delete status %d: %s", resp.StatusCode, string(errBody))
	}
	return nil
}
