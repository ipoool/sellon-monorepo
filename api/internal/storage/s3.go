package storage

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// S3Client talks to any S3-compatible object store over the REST API with
// SigV4 auth. It uses PATH-STYLE addressing (`{endpoint}/{bucket}/{key}`)
// rather than virtual-host style, because a self-hosted endpoint generally
// has neither the wildcard DNS nor the wildcard TLS certificate that
// `{bucket}.{endpoint}` would need.
type S3Client struct {
	endpoint string // scheme + host, no trailing slash
	bucket   string
	region   string
	// publicBase is the prefix of the URLs we hand out and store in the
	// database. The bucket is PRIVATE, so this points at the API's own
	// read-proxy (`…/api/v1/files/`) rather than at the object store.
	// Keeping it separate from `endpoint` means the storage location can
	// change without rewriting every URL already saved on a product row.
	publicBase string
	signer     sigV4Signer
	http       *http.Client
	// now is injectable so tests can sign at a fixed instant.
	now func() time.Time
}

// placeholderCreds are the literal values shipped in .env.example. Treating
// them as "unset" means a half-configured deploy answers 503 "belum
// dikonfigurasi" instead of throwing confusing 403 SignatureDoesNotMatch
// errors at sellers.
var placeholderCreds = map[string]bool{
	"":                true,
	"YOUR_ACCESS_KEY": true,
	"YOUR_SECRET_KEY": true,
	"CHANGE_ME":       true,
	"your_access_key": true,
	"your_secret_key": true,
}

// NewS3Client builds the client. publicBase is the URL prefix served by the
// read-proxy (see handler.FilesHandler); it must end without a slash.
func NewS3Client(endpoint, region, bucket, accessKey, secretKey, publicBase string) *S3Client {
	return &S3Client{
		endpoint:   strings.TrimRight(strings.TrimSpace(endpoint), "/"),
		bucket:     strings.Trim(strings.TrimSpace(bucket), "/"),
		region:     strings.TrimSpace(region),
		publicBase: strings.TrimRight(strings.TrimSpace(publicBase), "/"),
		signer: sigV4Signer{
			accessKey: strings.TrimSpace(accessKey),
			secretKey: strings.TrimSpace(secretKey),
			region:    strings.TrimSpace(region),
			service:   "s3",
		},
		http: &http.Client{Timeout: 60 * time.Second},
		now:  time.Now,
	}
}

func (c *S3Client) IsConfigured() bool {
	if c == nil || c.endpoint == "" || c.bucket == "" || c.region == "" || c.publicBase == "" {
		return false
	}
	return !placeholderCreds[c.signer.accessKey] && !placeholderCreds[c.signer.secretKey]
}

// objectURL is the ORIGIN URL used to talk to the object store. Never handed
// to a browser — the bucket is private and this URL 403s anonymously.
func (c *S3Client) objectURL(key string) string {
	return c.endpoint + "/" + c.bucket + "/" + strings.TrimLeft(key, "/")
}

// PublicBaseURL is the proxy prefix every stored asset URL shares.
func (c *S3Client) PublicBaseURL() string {
	return c.publicBase + "/"
}

// publicURL is what gets saved on the row and rendered in the browser.
func (c *S3Client) publicURL(key string) string {
	return c.publicBase + "/" + strings.TrimLeft(key, "/")
}

// Upload PUTs body at key and returns the PROXY url for it.
//
// No ACL header is sent: the bucket is private by design and this provider
// ignores per-object ACLs anyway (verified against the live endpoint — a
// PUT with `x-amz-acl: public-read` still came back owner-only). Reads go
// through the API proxy instead.
func (c *S3Client) Upload(ctx context.Context, path, contentType string, body []byte) (*UploadResult, error) {
	if !c.IsConfigured() {
		return nil, errors.New("object storage tidak dikonfigurasi")
	}
	if strings.TrimSpace(path) == "" {
		return nil, errors.New("path kosong")
	}
	if contentType == "" {
		contentType = "application/octet-stream"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPut, c.objectURL(path), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.ContentLength = int64(len(body))
	req.Header.Set("Content-Type", contentType)
	req.Header.Set("Cache-Control", "public, max-age=31536000, immutable")
	c.signer.sign(req, hashHex(body), c.now())

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("s3 upload: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("s3 upload status %d: %s", resp.StatusCode, readErrBody(resp.Body))
	}
	return &UploadResult{Path: path, PublicURL: c.publicURL(path)}, nil
}

// PathFromPublicURL returns the object key when rawURL points into this
// bucket, else "" so callers skip it silently (an image hosted elsewhere
// must never be truncated into a bogus key).
func (c *S3Client) PathFromPublicURL(rawURL string) string {
	if c == nil || rawURL == "" || c.publicBase == "" {
		return ""
	}
	base := c.PublicBaseURL()
	if !strings.HasPrefix(rawURL, base) {
		return ""
	}
	key := strings.TrimPrefix(rawURL, base)
	// Drop any query string (e.g. a cache-busting suffix).
	if i := strings.IndexAny(key, "?#"); i >= 0 {
		key = key[:i]
	}
	return key
}

// DeleteObjects removes keys one request at a time.
//
// The S3 batch-delete POST would need an XML body plus a Content-MD5 header;
// looping single DELETEs keeps the signer simple, and every caller already
// runs cleanup in a background goroutine. A missing key returns 204, so this
// is idempotent.
func (c *S3Client) DeleteObjects(ctx context.Context, paths []string) error {
	if !c.IsConfigured() {
		return errors.New("object storage tidak dikonfigurasi")
	}
	var firstErr error
	for _, p := range paths {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if err := c.deleteOne(ctx, p); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (c *S3Client) deleteOne(ctx context.Context, key string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, c.objectURL(key), nil)
	if err != nil {
		return err
	}
	c.signer.sign(req, emptyPayloadSHA256, c.now())

	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("s3 delete: %w", err)
	}
	defer resp.Body.Close()
	// 404 means the object is already gone, which is the desired end state.
	if resp.StatusCode >= 300 && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("s3 delete status %d: %s", resp.StatusCode, readErrBody(resp.Body))
	}
	return nil
}

func readErrBody(r io.Reader) string {
	b, _ := io.ReadAll(io.LimitReader(r, 2048))
	return strings.TrimSpace(string(b))
}

// Object is a streamed read from the bucket. Body MUST be closed by the
// caller — it is the live upstream response, deliberately not buffered so a
// large file never sits in API memory.
type Object struct {
	Body          io.ReadCloser
	ContentType   string
	ContentLength int64
	ETag          string
	LastModified  string
}

// ErrObjectNotFound is returned by Get when the key does not exist.
var ErrObjectNotFound = errors.New("object tidak ditemukan")

// Get fetches an object with a signed request. The bucket is private, so
// this is the only way to read one; the API's files proxy is what turns it
// back into something a browser can load.
//
// ifNoneMatch, when non-empty, is forwarded so an unchanged object comes
// back as 304 with no body and the proxy can pass that straight through.
func (c *S3Client) Get(ctx context.Context, key, ifNoneMatch string) (*Object, error) {
	if !c.IsConfigured() {
		return nil, errors.New("object storage tidak dikonfigurasi")
	}
	key = strings.TrimLeft(strings.TrimSpace(key), "/")
	if key == "" {
		return nil, ErrObjectNotFound
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.objectURL(key), nil)
	if err != nil {
		return nil, err
	}
	if ifNoneMatch != "" {
		req.Header.Set("If-None-Match", ifNoneMatch)
	}
	c.signer.sign(req, emptyPayloadSHA256, c.now())

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("s3 get: %w", err)
	}
	switch {
	case resp.StatusCode == http.StatusNotModified:
		resp.Body.Close()
		return &Object{ETag: resp.Header.Get("ETag")}, errNotModified
	case resp.StatusCode == http.StatusNotFound:
		resp.Body.Close()
		return nil, ErrObjectNotFound
	case resp.StatusCode >= 300:
		defer resp.Body.Close()
		return nil, fmt.Errorf("s3 get status %d: %s", resp.StatusCode, readErrBody(resp.Body))
	}
	return &Object{
		Body:          resp.Body,
		ContentType:   resp.Header.Get("Content-Type"),
		ContentLength: resp.ContentLength,
		ETag:          resp.Header.Get("ETag"),
		LastModified:  resp.Header.Get("Last-Modified"),
	}, nil
}

// errNotModified signals a 304 from upstream. Sentinel rather than a status
// field so callers can't forget to check it.
var errNotModified = errors.New("not modified")

// IsNotModified reports whether Get returned because the caller's
// If-None-Match already matched.
func IsNotModified(err error) bool { return errors.Is(err, errNotModified) }
