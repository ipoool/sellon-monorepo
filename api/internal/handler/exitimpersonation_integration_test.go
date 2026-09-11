package handler

// Integration test for the exit-impersonation session-revocation gate,
// against a real Postgres (per CLAUDE.md: prefer integration tests over
// mocking the DB). Skipped unless TEST_DATABASE_URL is set.
//
//   TEST_DATABASE_URL='postgres://sellon:sellon@localhost:55433/sellon_test' \
//     go test ./internal/handler/ -run ExitImpersonation -v

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/sellon/sellon/api/internal/auth"
	"github.com/sellon/sellon/api/internal/db"
	"github.com/sellon/sellon/api/internal/repository"
)

func adminTestPool(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	logger := slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelWarn}))
	if err := db.Migrate(dsn, logger); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	pool, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	return pool
}

func adminRandSuffix() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// exitImpersonationFixture wires the handler against real repos and returns a
// signed impersonation cookie for admin-acting-as-target.
func exitImpersonationFixture(t *testing.T, pool *pgxpool.Pool) (*AdminHandler, *auth.JWTService, *repository.User, string) {
	t.Helper()
	ctx := context.Background()
	users := repository.NewUserRepo(pool)

	admin, err := users.CreateWithPassword(ctx, "adm-"+adminRandSuffix()+"@example.com", "Admin", "")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `UPDATE users SET role='admin' WHERE id=$1`, admin.ID); err != nil {
		t.Fatal(err)
	}
	target, err := users.CreateWithPassword(ctx, "tgt-"+adminRandSuffix()+"@example.com", "Target", "")
	if err != nil {
		t.Fatal(err)
	}

	jwtSvc := auth.NewJWTService("test-secret-"+adminRandSuffix(), 7*24*time.Hour)
	token, _, err := jwtSvc.IssueImpersonation(target.ID, &admin.ID, 30*time.Minute)
	if err != nil {
		t.Fatal(err)
	}

	h := NewAdminHandler(
		users, nil, nil, repository.NewPlatformAuditRepo(pool), nil, nil, nil, nil,
		jwtSvc, nil, "http://localhost:3100", false,
		slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelError})),
	)

	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM users WHERE id = ANY($1)`,
			[]uuid.UUID{admin.ID, target.ID})
	})
	return h, jwtSvc, admin, token
}

func callExitImpersonation(t *testing.T, h *AdminHandler, admin *repository.User, token string) (*httptest.ResponseRecorder, map[string]any) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/auth/exit-impersonation", nil)
	req.AddCookie(&http.Cookie{Name: auth.SessionCookieName, Value: token})
	// Stand in for RequireAuth, which stamps both ids on the context.
	ctx := auth.WithImpersonatorID(req.Context(), admin.ID)
	ctx = auth.WithUserID(ctx, uuid.New())
	rec := httptest.NewRecorder()
	h.ExitImpersonation(rec, req.WithContext(ctx))
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode body %q: %v", rec.Body.String(), err)
	}
	return rec, body
}

func sessionCookie(rec *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range (&http.Response{Header: rec.Header()}).Cookies() {
		if c.Name == auth.SessionCookieName {
			return c
		}
	}
	return nil
}

// Baseline: a healthy admin gets their own session back. Guards against the
// revocation check being so strict it breaks the normal exit path.
func TestExitImpersonationRestoresHealthyAdmin(t *testing.T) {
	pool := adminTestPool(t)
	defer pool.Close()
	h, jwtSvc, admin, token := exitImpersonationFixture(t, pool)

	rec, body := callExitImpersonation(t, h, admin, token)
	if rec.Code != http.StatusOK || body["restored"] != true {
		t.Fatalf("expected the admin session to be restored, got %d %v", rec.Code, body)
	}
	c := sessionCookie(rec)
	if c == nil || c.Value == "" {
		t.Fatal("no session cookie issued")
	}
	claims, err := jwtSvc.Verify(c.Value)
	if err != nil {
		t.Fatalf("issued cookie does not verify: %v", err)
	}
	if claims.UserID != admin.ID {
		t.Fatalf("restored session is for %s, want admin %s", claims.UserID, admin.ID)
	}
	if claims.Impersonator != nil {
		t.Fatal("restored session still carries an imp claim")
	}
}

// The bug: RequireAuth compares the token's iat against the IMPERSONATED
// user's sessions_valid_after, so an admin whose own sessions were revoked
// mid-impersonation (password reset after a compromise) still reaches this
// handler. Minting them a fresh full-TTL admin session there would hand
// whoever holds the stolen impersonation cookie a clean way around the
// revocation.
func TestExitImpersonationHonoursSessionRevocation(t *testing.T) {
	pool := adminTestPool(t)
	defer pool.Close()
	h, _, admin, token := exitImpersonationFixture(t, pool)

	// Revoke every admin session issued before now — what ResetPasswordTx does.
	if _, err := pool.Exec(context.Background(),
		`UPDATE users SET sessions_valid_after = date_trunc('second', now()) + interval '1 second' WHERE id=$1`,
		admin.ID); err != nil {
		t.Fatal(err)
	}

	rec, body := callExitImpersonation(t, h, admin, token)
	if body["restored"] == true {
		t.Fatal("revoked admin got a brand-new session by exiting impersonation")
	}
	if body["logged_out"] != true {
		t.Fatalf("expected a forced logout, got %d %v", rec.Code, body)
	}
	c := sessionCookie(rec)
	if c == nil {
		t.Fatal("session cookie was not cleared")
	}
	if c.Value != "" || c.MaxAge >= 0 {
		t.Fatalf("cookie not cleared: value=%q maxage=%d", c.Value, c.MaxAge)
	}
}

// A ban must still short-circuit the same way (regression guard for the
// combined condition).
func TestExitImpersonationHonoursBan(t *testing.T) {
	pool := adminTestPool(t)
	defer pool.Close()
	h, _, admin, token := exitImpersonationFixture(t, pool)

	if _, err := pool.Exec(context.Background(),
		`UPDATE users SET banned_at = now() WHERE id=$1`, admin.ID); err != nil {
		t.Fatal(err)
	}
	_, body := callExitImpersonation(t, h, admin, token)
	if body["logged_out"] != true {
		t.Fatalf("banned admin was not logged out: %v", body)
	}
}
