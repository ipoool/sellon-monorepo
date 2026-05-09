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
