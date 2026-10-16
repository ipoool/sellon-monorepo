package middleware

import (
	"context"
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
)

// RateLimit is a small in-memory fixed-window limiter keyed by the caller's
// IP (after chi's RealIP). It exists to bound online brute force against the
// public auth/OTP endpoints and to stop anonymous storefront endpoints from
// being used as spam relays — it is deliberately dependency-free. Counters
// are per process, so with N API replicas the effective limit is N× the
// configured one; still a hard ceiling where there was none.
func RateLimit(limit int, window time.Duration) func(http.Handler) http.Handler {
	return RateLimitKeyed(limit, window, clientIPKey)
}

// RateLimitKeyed is RateLimit with the bucket key chosen by the caller.
//
// IP is the right key for anonymous public endpoints, and the wrong one for
// authenticated devices: several PhotoBoost booths in the same mall sit behind
// one NAT, so an IP bucket makes them share a quota and a status poll running
// every few seconds would collect false 429s. Keying on the booth gives each
// unit its own ceiling.
//
// A key function returning "" means "not identified yet" — the request falls
// back to the IP bucket rather than sharing one unbounded bucket with every
// other unidentified caller.
func RateLimitKeyed(limit int, window time.Duration, key func(*http.Request) string) func(http.Handler) http.Handler {
	l := &rateLimiter{
		limit:   limit,
		window:  window,
		buckets: make(map[string]*rateBucket),
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			k := key(r)
			if k == "" {
				k = clientIPKey(r)
			}
			if retryAfter, ok := l.allow(k); !ok {
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())+1))
				response.Error(w, http.StatusTooManyRequests, "terlalu banyak permintaan, coba lagi sebentar")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// BoothKey buckets by the authenticated booth. Must be mounted inside
// RequireBooth, which is what puts the booth on the context.
func BoothKey(r *http.Request) string {
	if b, ok := auth.BoothFromContext(r.Context()); ok {
		return "booth:" + b.Booth.ID.String()
	}
	return ""
}

type rateBucket struct {
	count int
	start time.Time
}

type rateLimiter struct {
	mu        sync.Mutex
	limit     int
	window    time.Duration
	buckets   map[string]*rateBucket
	lastSweep time.Time
}

// allow records one hit for key and reports whether it is within the limit.
// On rejection it returns how long until the window resets.
func (l *rateLimiter) allow(key string) (time.Duration, bool) {
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()

	if now.Sub(l.lastSweep) > l.window {
		for k, b := range l.buckets {
			if now.Sub(b.start) > l.window {
				delete(l.buckets, k)
			}
		}
		l.lastSweep = now
	}

	b, ok := l.buckets[key]
	if !ok || now.Sub(b.start) > l.window {
		l.buckets[key] = &rateBucket{count: 1, start: now}
		return 0, true
	}
	if b.count >= l.limit {
		return l.window - now.Sub(b.start), false
	}
	b.count++
	return 0, true
}

type peerKeyType struct{}

var peerCtxKey peerKeyType

// TrustedPeer records the real TCP peer address before any header-trusting
// middleware (chi's RealIP) can overwrite RemoteAddr. Mount it FIRST.
func TrustedPeer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r.WithContext(
			context.WithValue(r.Context(), peerCtxKey, hostOf(r.RemoteAddr))))
	})
}

// clientIPKey prefers the recorded peer; it falls back to RemoteAddr only if
// TrustedPeer was not mounted, which would be a wiring mistake.
func clientIPKey(r *http.Request) string {
	if peer, ok := r.Context().Value(peerCtxKey).(string); ok && peer != "" {
		return peer
	}
	return hostOf(r.RemoteAddr)
}

func hostOf(addr string) string {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return host
}
