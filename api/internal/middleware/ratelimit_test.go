package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

// The limiter must key on the TCP peer, never on a header. chi's RealIP
// rewrites RemoteAddr from True-Client-IP / X-Real-IP / X-Forwarded-For, so
// keying on that let a client mint a fresh bucket per request and bypass
// every limit — and grow the bucket map without bound while doing it.
func TestRateLimitIgnoresSpoofedHeaders(t *testing.T) {
	const limit = 3
	h := TrustedPeer(RateLimit(limit, time.Minute)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })))

	allowed, blocked := 0, 0
	for i := 0; i < 10; i++ {
		req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/login", nil)
		req.RemoteAddr = "203.0.113.7:44321" // same real peer every time
		// A determined caller rotating every header chi's RealIP consults.
		req.Header.Set("True-Client-IP", randIPish(i))
		req.Header.Set("X-Real-IP", randIPish(i+100))
		req.Header.Set("X-Forwarded-For", randIPish(i+200))

		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code == http.StatusTooManyRequests {
			blocked++
		} else {
			allowed++
		}
	}
	if allowed != limit {
		t.Errorf("header rotation bypassed the limit: %d allowed, want %d", allowed, limit)
	}
	if blocked == 0 {
		t.Error("nothing was throttled")
	}
}

// Genuinely different peers must not share a bucket.
func TestRateLimitSeparatesRealPeers(t *testing.T) {
	h := TrustedPeer(RateLimit(1, time.Minute)(
		http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusOK) })))

	for _, peer := range []string{"198.51.100.1:1", "198.51.100.2:1", "198.51.100.3:1"} {
		req := httptest.NewRequest(http.MethodPost, "/x", nil)
		req.RemoteAddr = peer
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, req)
		if rec.Code != http.StatusOK {
			t.Errorf("peer %s was throttled on its first request", peer)
		}
	}
}

func randIPish(i int) string {
	return "10.0." + itoa(i/256) + "." + itoa(i%256)
}

func itoa(v int) string {
	if v == 0 {
		return "0"
	}
	var b []byte
	for v > 0 {
		b = append([]byte{byte('0' + v%10)}, b...)
		v /= 10
	}
	return string(b)
}
