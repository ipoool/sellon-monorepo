package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/pkg/response"
	"github.com/sellon/sellon/api/internal/repository"
)

// How often a booth's liveness is written back. The status poll runs every few
// seconds; a write per request would be write amplification for a field nobody
// reads at that resolution.
const boothTouchInterval = 2 * time.Minute

// RequireBooth authenticates a PhotoBoost tablet by bearer device token.
//
// Kept entirely separate from RequireAuth (seller) and RequireBuyer (storefront
// buyer): different credential, different realm, no user row. Two specifics
// worth stating, because both are deliberate departures from RequireAuth:
//
//   - The credential arrives in an Authorization header, not a cookie. A native
//     app has no cookie jar, and SameSite/Secure are browser semantics.
//   - It never loads a users row. RequireAuth does that per request to enforce
//     bans and sessions_valid_after; neither concept applies to a device, and
//     this path is polled every few seconds.
//
// Unknown, revoked, and belongs-to-a-paused-booth all answer the same 401, so
// a caller holding a bad token learns nothing from the difference.
func RequireBooth(booths *repository.PhotoBoothRepo, logger *slog.Logger) func(http.Handler) http.Handler {
	t := &boothToucher{
		repo: booths,
		seen: make(map[uuid.UUID]time.Time),
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			raw := bearerToken(r)
			if raw == "" {
				response.Error(w, http.StatusUnauthorized, "token perangkat tidak ada")
				return
			}
			b, err := booths.FindActiveBoothByTokenHash(r.Context(), repository.HashDeviceToken(raw))
			if err != nil {
				// A DB failure is not the device's fault, but telling the two
				// apart to the caller would leak whether a token exists.
				if err != repository.ErrDeviceTokenInvalid {
					logger.Error("booth auth lookup", "err", err)
				}
				response.Error(w, http.StatusUnauthorized, "token perangkat tidak berlaku")
				return
			}

			t.maybeTouch(b.Booth.ID, b.TokenID)
			next.ServeHTTP(w, r.WithContext(auth.WithBooth(r.Context(), b)))
		})
	}
}

// bearerToken reads "Authorization: Bearer <token>", case-insensitively on the
// scheme as RFC 7235 requires.
func bearerToken(r *http.Request) string {
	h := strings.TrimSpace(r.Header.Get("Authorization"))
	if h == "" {
		return ""
	}
	parts := strings.SplitN(h, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

// boothToucher throttles liveness writes to one per booth per interval, in
// process. Same shape as the rate limiter's bucket map, and for the same
// reason: it bounds a cost without reaching for infrastructure.
type boothToucher struct {
	repo *repository.PhotoBoothRepo
	mu   sync.Mutex
	seen map[uuid.UUID]time.Time
}

func (t *boothToucher) maybeTouch(boothID, tokenID uuid.UUID) {
	now := time.Now()
	t.mu.Lock()
	last, ok := t.seen[boothID]
	if ok && now.Sub(last) < boothTouchInterval {
		t.mu.Unlock()
		return
	}
	t.seen[boothID] = now
	t.mu.Unlock()

	// Detached context: the write outlives the request it rode in on, and a
	// cancelled poll must not leave the booth looking offline.
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = t.repo.TouchDevice(ctx, boothID, tokenID)
	}()
}
