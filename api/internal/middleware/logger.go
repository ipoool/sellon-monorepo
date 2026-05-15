package middleware

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"
)

// quietPathSuffixes — request ke path ini tidak di-log oleh middleware
// supaya stdout tidak terlalu berisik. Endpoint long-lived (SSE) +
// health probe + CORS preflight tidak nilai informatif kalau di-log
// tiap request. Path matching pakai suffix supaya prefix /api/v1 dst
// gak perlu hard-code.
var quietPathSuffixes = []string{
	"/orders/stream",
	"/bulk/jobs/stream",
	"/health",
}

func Logger(logger *slog.Logger) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
			defer func() {
				// Skip log:
				//   - CORS preflight (OPTIONS) — 1 per resource per tab
				//   - SSE stream endpoints (per-request log fires saat
				//     koneksi close, tetap noisy kalau client refresh).
				//   - Health probe.
				if r.Method == http.MethodOptions {
					return
				}
				for _, suf := range quietPathSuffixes {
					if strings.HasSuffix(r.URL.Path, suf) {
						return
					}
				}
				logger.Info("http",
					"method", r.Method,
					"path", r.URL.Path,
					"status", ww.Status(),
					"duration_ms", time.Since(start).Milliseconds(),
					"request_id", chimw.GetReqID(r.Context()),
				)
			}()
			next.ServeHTTP(ww, r)
		})
	}
}
