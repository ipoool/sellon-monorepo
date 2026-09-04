// Package storage hosts uploaded assets (product photos, banners, payment
// proofs, digital deliverables).
//
// Two backends live here. S3Client talks to any S3-compatible object store
// (the platform runs on Cloudeka's) and is the one new uploads go to.
// SupabaseClient is the previous backend, kept only so objects uploaded
// before the switch can still be resolved and deleted — see MultiClient.
//
// Neither uses a vendored SDK: the surface is a PUT, a DELETE and a
// public-URL helper, so hand-rolling keeps the distroless image lean, in
// line with the repo's "no new deps without clear reason" rule.
package storage

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"strings"
	"time"
)

// Client is the storage surface the handlers depend on. Both backends and
// the MultiClient router implement it, so swapping providers is a wiring
// change in server.go rather than an edit to every handler.
type Client interface {
	// IsConfigured reports whether uploads can succeed. Handlers should
	// answer 503 rather than attempt an upload that will obviously fail.
	IsConfigured() bool
	// Upload stores body at path and returns its public URL.
	Upload(ctx context.Context, path, contentType string, body []byte) (*UploadResult, error)
	// PathFromPublicURL extracts the object key from a public URL this
	// backend owns, or "" when the URL belongs somewhere else. Callers use
	// "" to mean "not ours, skip silently".
	PathFromPublicURL(rawURL string) string
	// DeleteObjects removes objects by key. Missing keys are not an error.
	DeleteObjects(ctx context.Context, paths []string) error
	// Get streams an object back. The caller must close Object.Body.
	// ifNoneMatch, when set, may yield a not-modified sentinel (see
	// IsNotModified) so a conditional request costs no transfer.
	Get(ctx context.Context, key, ifNoneMatch string) (*Object, error)
}

type UploadResult struct {
	Path      string `json:"path"`
	PublicURL string `json:"url"`
}

// RandomKey returns a random object key in the form `{prefix}/{stamp}-{hex}.{ext}`.
// Caller passes the file extension (without leading dot).
//
// The 8 random bytes are what stop object keys from being enumerable, and
// the `{store_id}/` prefix the callers pass is what the cross-tenant delete
// guard checks — keep both when adding a new upload kind.
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

// MultiClient routes to a primary backend for everything, and additionally
// consults a legacy backend when resolving or deleting objects.
//
// It exists for the Supabase → S3 migration: rows written before the switch
// still carry Supabase public URLs, so deleting a product must be able to
// reach either bucket. Uploads always go to primary. When legacy is nil (the
// steady state, once SUPABASE_* is unset) this is a thin pass-through.
type MultiClient struct {
	primary Client
	legacy  Client
}

// NewMultiClient wires the two backends, picking whichever is actually
// configured as the upload target.
//
// The fallback matters for rollout order: this code ships before the
// production host has S3_* in its env, and without the swap an upload would
// answer 503 for every seller. So while S3 is unconfigured, uploads keep
// going to Supabase exactly as before; the moment S3 credentials appear the
// primary flips, with no redeploy and no change to rows already written
// (each backend still recognises its own URLs).
func NewMultiClient(primary, legacy Client) Client {
	primaryOK := primary != nil && primary.IsConfigured()
	legacyOK := legacy != nil && legacy.IsConfigured()

	switch {
	case primaryOK && legacyOK:
		return &MultiClient{primary: primary, legacy: legacy}
	case primaryOK:
		return primary
	case legacyOK:
		// S3 not configured yet — keep serving with the previous backend
		// rather than failing every upload.
		return legacy
	default:
		// Neither configured: return primary so handlers see IsConfigured()
		// false and answer 503 with the usual copy.
		return primary
	}
}

func (m *MultiClient) IsConfigured() bool { return m.primary != nil && m.primary.IsConfigured() }

func (m *MultiClient) Upload(ctx context.Context, path, contentType string, body []byte) (*UploadResult, error) {
	return m.primary.Upload(ctx, path, contentType, body)
}

// Get only ever hits the primary: legacy Supabase assets keep their own
// public supabase.co URLs, so the read proxy is never asked for one.
func (m *MultiClient) Get(ctx context.Context, key, ifNoneMatch string) (*Object, error) {
	return m.primary.Get(ctx, key, ifNoneMatch)
}

// PathFromPublicURL asks the primary first, then the legacy backend, so a
// pre-migration URL still resolves to a key (and still passes the callers'
// `{store_id}/` ownership check, since both backends use the same layout).
func (m *MultiClient) PathFromPublicURL(rawURL string) string {
	if p := m.primary.PathFromPublicURL(rawURL); p != "" {
		return p
	}
	return m.legacy.PathFromPublicURL(rawURL)
}

// DeleteObjects issues the delete against both backends.
//
// The key alone doesn't say which bucket it came from — PathFromPublicURL
// has already thrown that away by the time callers hand us a path. Trying
// both is safe: keys carry 8 random bytes plus a timestamp, so a key that
// exists in one bucket effectively never exists in the other, and both
// backends treat a missing key as success. A legacy failure is swallowed so
// it can't mask a real failure on the live bucket.
func (m *MultiClient) DeleteObjects(ctx context.Context, paths []string) error {
	err := m.primary.DeleteObjects(ctx, paths)
	_ = m.legacy.DeleteObjects(ctx, paths)
	return err
}
