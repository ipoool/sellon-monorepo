package storage

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"
)

// AWS Signature Version 4, the auth scheme every S3-compatible store speaks.
//
// Only the header-based ("Authorization: AWS4-HMAC-SHA256 …") variant is
// implemented, which is all a server-side PUT/DELETE needs; presigned query
// signing is deliberately absent. Verified against the AWS CLI's own signer
// in sigv4_test.go.

const (
	sigV4Algorithm = "AWS4-HMAC-SHA256"
	// emptyPayloadSHA256 is sha256("") — the payload hash for a body-less
	// request such as DELETE.
	emptyPayloadSHA256 = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
)

type sigV4Signer struct {
	accessKey string
	secretKey string
	region    string
	service   string
}

// sign stamps req with X-Amz-Date, X-Amz-Content-Sha256 and Authorization.
//
// payloadHash must be the hex sha256 of the exact bytes being sent. S3
// requires it in a header as well as in the canonical request, so it is
// never computed implicitly here.
func (s sigV4Signer) sign(req *http.Request, payloadHash string, now time.Time) {
	now = now.UTC()
	amzDate := now.Format("20060102T150405Z")
	dateStamp := now.Format("20060102")

	req.Header.Set("X-Amz-Date", amzDate)
	req.Header.Set("X-Amz-Content-Sha256", payloadHash)
	if req.Host != "" {
		req.Header.Set("Host", req.Host)
	} else {
		req.Header.Set("Host", req.URL.Host)
	}

	canonicalHeaders, signedHeaders := canonicalizeHeaders(req)

	canonicalRequest := strings.Join([]string{
		req.Method,
		canonicalURI(req.URL.EscapedPath()),
		canonicalQuery(req.URL.RawQuery),
		canonicalHeaders,
		signedHeaders,
		payloadHash,
	}, "\n")

	scope := strings.Join([]string{dateStamp, s.region, s.service, "aws4_request"}, "/")
	stringToSign := strings.Join([]string{
		sigV4Algorithm,
		amzDate,
		scope,
		hashHex([]byte(canonicalRequest)),
	}, "\n")

	signature := hex.EncodeToString(hmacSHA256(s.signingKey(dateStamp), stringToSign))

	req.Header.Set("Authorization", sigV4Algorithm+
		" Credential="+s.accessKey+"/"+scope+
		", SignedHeaders="+signedHeaders+
		", Signature="+signature)
}

// signingKey derives the date/region/service-scoped key. Each HMAC narrows
// the key's validity, which is why a leaked signature can't be replayed
// against another day, region or service.
func (s sigV4Signer) signingKey(dateStamp string) []byte {
	kDate := hmacSHA256([]byte("AWS4"+s.secretKey), dateStamp)
	kRegion := hmacSHA256(kDate, s.region)
	kService := hmacSHA256(kRegion, s.service)
	return hmacSHA256(kService, "aws4_request")
}

func hmacSHA256(key []byte, data string) []byte {
	h := hmac.New(sha256.New, key)
	h.Write([]byte(data))
	return h.Sum(nil)
}

func hashHex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// canonicalizeHeaders returns the canonical header block and the
// semicolon-joined list of signed header names, both lowercase and sorted.
func canonicalizeHeaders(req *http.Request) (string, string) {
	names := make([]string, 0, len(req.Header)+1)
	values := map[string]string{}
	for name, vals := range req.Header {
		lower := strings.ToLower(name)
		// Only sign headers we control. Anything a proxy might add or
		// rewrite in flight (Authorization itself, transfer encodings)
		// would break the signature at the far end.
		if lower == "authorization" || lower == "content-length" ||
			lower == "user-agent" || lower == "accept-encoding" {
			continue
		}
		trimmed := make([]string, 0, len(vals))
		for _, v := range vals {
			trimmed = append(trimmed, trimAll(v))
		}
		names = append(names, lower)
		values[lower] = strings.Join(trimmed, ",")
	}
	sort.Strings(names)

	var b strings.Builder
	for _, n := range names {
		b.WriteString(n)
		b.WriteByte(':')
		b.WriteString(values[n])
		b.WriteByte('\n')
	}
	return b.String(), strings.Join(names, ";")
}

// trimAll strips leading/trailing spaces and collapses internal runs of
// spaces to one, as the canonical form requires.
func trimAll(s string) string {
	return strings.Join(strings.Fields(s), " ")
}

// canonicalURI percent-encodes each path segment while leaving the "/"
// separators intact. S3 differs from other AWS services here: it signs the
// path encoded exactly once, so the already-escaped path from url.URL is
// decoded per segment and re-encoded with the stricter RFC 3986 rules.
func canonicalURI(escapedPath string) string {
	if escapedPath == "" {
		return "/"
	}
	segments := strings.Split(escapedPath, "/")
	for i, seg := range segments {
		// url.PathUnescape only fails on malformed escapes; keeping the raw
		// segment then is the closest we can get to the caller's intent.
		if unescaped, err := url.PathUnescape(seg); err == nil {
			seg = unescaped
		}
		segments[i] = uriEncode(seg)
	}
	return strings.Join(segments, "/")
}

func canonicalQuery(rawQuery string) string {
	if rawQuery == "" {
		return ""
	}
	pairs := strings.Split(rawQuery, "&")
	out := make([]string, 0, len(pairs))
	for _, p := range pairs {
		if p == "" {
			continue
		}
		k, v, _ := strings.Cut(p, "=")
		ku, err := url.QueryUnescape(k)
		if err != nil {
			ku = k
		}
		vu, err := url.QueryUnescape(v)
		if err != nil {
			vu = v
		}
		out = append(out, uriEncode(ku)+"="+uriEncode(vu))
	}
	sort.Strings(out)
	return strings.Join(out, "&")
}

// uriEncode percent-encodes everything outside the RFC 3986 unreserved set.
// Notably "/" IS encoded here — callers apply it per path segment.
func uriEncode(s string) string {
	const upperhex = "0123456789ABCDEF"
	var b strings.Builder
	b.Grow(len(s))
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c >= 'A' && c <= 'Z', c >= 'a' && c <= 'z', c >= '0' && c <= '9',
			c == '-', c == '_', c == '.', c == '~':
			b.WriteByte(c)
		default:
			b.WriteByte('%')
			b.WriteByte(upperhex[c>>4])
			b.WriteByte(upperhex[c&15])
		}
	}
	return b.String()
}
