package middleware

import (
	"net"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/sellon/sellon/api/internal/pkg/response"
)

// RateLimit is a small in-memory fixed-window limiter keyed by the caller's
// IP (after chi's RealIP). It exists to bound online brute force against the
// public auth/OTP endpoints and to stop anonymous storefront endpoints from
// being used as spam relays — it is deliberately dependency-free. Counters
// are per process, so with N API replicas the effective limit is N× the
// configured one; still a hard ceiling where there was none.
func RateLimit(limit int, window time.Duration) func(http.Handler) http.Handler {
	l := &rateLimiter{
		limit:   limit,
		window:  window,
		buckets: make(map[string]*rateBucket),
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			key := clientIPKey(r)
			if retryAfter, ok := l.allow(key); !ok {
				w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())+1))
				response.Error(w, http.StatusTooManyRequests, "terlalu banyak permintaan, coba lagi sebentar")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
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

func clientIPKey(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}
