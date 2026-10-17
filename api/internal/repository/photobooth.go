package repository

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PhotoBoothRepo owns the booth registry, the platform-wide defaults and the
// device credentials.
//
// PhotoBoost is a platform business rather than a seller feature, so nothing
// here is scoped by store_id; the admin console is the only human-facing
// surface, and booths authenticate as devices.
type PhotoBoothRepo struct {
	pool *pgxpool.Pool
}

func NewPhotoBoothRepo(pool *pgxpool.Pool) *PhotoBoothRepo {
	return &PhotoBoothRepo{pool: pool}
}

var (
	// ErrBoothNotFound is returned for a missing, retired or unknown booth.
	ErrBoothNotFound = errors.New("booth not found")
	// ErrBoothCodeTaken means another booth already holds that code.
	ErrBoothCodeTaken = errors.New("booth code taken")
	// ErrDeviceTokenInvalid covers unknown, revoked, and
	// belongs-to-an-inactive-booth in one answer, so an attacker learns
	// nothing from the difference.
	ErrDeviceTokenInvalid = errors.New("device token invalid")
)

// Frame is one uploaded frame or sticker overlay the booth can apply.
type Frame struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	ImageURL string `json:"image_url"`
	Kind     string `json:"kind"` // "frame" | "sticker"
}

// PhotoBoothSettings holds the platform defaults every booth inherits unless
// it overrides a field.
type PhotoBoothSettings struct {
	PriceCents            int64
	ShotsCount            int
	PrintCopies           int
	SessionTimeoutSeconds int
	QRISExpiryMinutes     int
	Frames                []Frame
	UpdatedAt             time.Time
}

// Booth is a registered unit. The override fields are pointers because NULL
// carries meaning here: it means "inherit", not "zero".
type Booth struct {
	ID       uuid.UUID
	Code     string
	Name     string
	Location string
	Status   string

	PriceCents            *int64
	ShotsCount            *int
	PrintCopies           *int
	SessionTimeoutSeconds *int
	QRISExpiryMinutes     *int
	Frames                []Frame // nil = inherit

	Notes string

	LastSeenAt *time.Time
	AppVersion string
	PrinterOK  bool
	PaperLow   bool

	CreatedAt time.Time
	UpdatedAt time.Time
}

// EffectiveConfig is what a booth actually runs on: its own overrides filled
// in from the platform defaults. Resolved once, server-side, so the booth and
// the admin console can never disagree about the price.
type EffectiveConfig struct {
	PriceCents            int64
	ShotsCount            int
	PrintCopies           int
	SessionTimeoutSeconds int
	QRISExpiryMinutes     int
	Frames                []Frame
}

// Version is a short digest of the effective config. A booth polls it while
// idle and reloads only when it changes, instead of re-fetching frames.
func (c EffectiveConfig) Version() string {
	h := sha256.New()
	fmt.Fprintf(h, "%d|%d|%d|%d|%d|", c.PriceCents, c.ShotsCount, c.PrintCopies,
		c.SessionTimeoutSeconds, c.QRISExpiryMinutes)
	for _, f := range c.Frames {
		fmt.Fprintf(h, "%s:%s:%s:%s|", f.ID, f.Name, f.ImageURL, f.Kind)
	}
	return hex.EncodeToString(h.Sum(nil))[:16]
}

const boothCols = `
	id, code, name, location, status,
	price_cents, shots_count, print_copies, session_timeout_seconds,
	qris_expiry_minutes, frames, notes,
	last_seen_at, app_version, printer_ok, paper_low,
	created_at, updated_at`

func scanBooth(row pgx.Row) (*Booth, error) {
	var b Booth
	var frames []byte
	if err := row.Scan(
		&b.ID, &b.Code, &b.Name, &b.Location, &b.Status,
		&b.PriceCents, &b.ShotsCount, &b.PrintCopies, &b.SessionTimeoutSeconds,
		&b.QRISExpiryMinutes, &frames, &b.Notes,
		&b.LastSeenAt, &b.AppVersion, &b.PrinterOK, &b.PaperLow,
		&b.CreatedAt, &b.UpdatedAt,
	); err != nil {
		return nil, err
	}
	if len(frames) > 0 {
		if err := json.Unmarshal(frames, &b.Frames); err != nil {
			// A malformed override must not take the booth offline; fall back
			// to inheriting the platform frames.
			b.Frames = nil
		}
	}
	return &b, nil
}

// === Settings ===

func (r *PhotoBoothRepo) GetSettings(ctx context.Context) (*PhotoBoothSettings, error) {
	var s PhotoBoothSettings
	var frames []byte
	err := r.pool.QueryRow(ctx, `
		SELECT default_price_cents, default_shots_count, default_print_copies,
		       default_session_timeout_seconds, default_qris_expiry_minutes,
		       default_frames, updated_at
		FROM photobooth_settings WHERE id = true
	`).Scan(&s.PriceCents, &s.ShotsCount, &s.PrintCopies,
		&s.SessionTimeoutSeconds, &s.QRISExpiryMinutes, &frames, &s.UpdatedAt)
	if err != nil {
		return nil, err
	}
	if len(frames) > 0 {
		_ = json.Unmarshal(frames, &s.Frames)
	}
	if s.Frames == nil {
		s.Frames = []Frame{}
	}
	return &s, nil
}

type UpdateSettingsInput struct {
	PriceCents            int64
	ShotsCount            int
	PrintCopies           int
	SessionTimeoutSeconds int
	QRISExpiryMinutes     int
	Frames                []Frame
	UpdatedBy             uuid.UUID
}

func (r *PhotoBoothRepo) UpdateSettings(ctx context.Context, in UpdateSettingsInput) error {
	frames, err := json.Marshal(normalizeFrames(in.Frames))
	if err != nil {
		return err
	}
	_, err = r.pool.Exec(ctx, `
		UPDATE photobooth_settings
		SET default_price_cents = $1, default_shots_count = $2,
		    default_print_copies = $3, default_session_timeout_seconds = $4,
		    default_qris_expiry_minutes = $5, default_frames = $6,
		    updated_by = $7, updated_at = now()
		WHERE id = true
	`, in.PriceCents, in.ShotsCount, in.PrintCopies, in.SessionTimeoutSeconds,
		in.QRISExpiryMinutes, frames, nullUUID(in.UpdatedBy))
	return err
}

// === Booths ===

type CreateBoothInput struct {
	Code      string
	Name      string
	Location  string
	Notes     string
	CreatedBy uuid.UUID

	PriceCents            *int64
	ShotsCount            *int
	PrintCopies           *int
	SessionTimeoutSeconds *int
	QRISExpiryMinutes     *int
	Frames                []Frame
}

func (r *PhotoBoothRepo) CreateBooth(ctx context.Context, in CreateBoothInput) (*Booth, error) {
	frames, err := marshalFramesOrNil(in.Frames)
	if err != nil {
		return nil, err
	}
	row := r.pool.QueryRow(ctx, `
		INSERT INTO photobooth_booths
		    (code, name, location, notes, created_by,
		     price_cents, shots_count, print_copies,
		     session_timeout_seconds, qris_expiry_minutes, frames)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
		RETURNING `+boothCols,
		strings.ToUpper(strings.TrimSpace(in.Code)), in.Name, in.Location, in.Notes,
		nullUUID(in.CreatedBy), in.PriceCents, in.ShotsCount, in.PrintCopies,
		in.SessionTimeoutSeconds, in.QRISExpiryMinutes, frames)
	b, err := scanBooth(row)
	if isUniqueViolation(err) {
		return nil, ErrBoothCodeTaken
	}
	return b, err
}

type UpdateBoothInput struct {
	ID       uuid.UUID
	Name     string
	Location string
	Status   string
	Notes    string

	PriceCents            *int64
	ShotsCount            *int
	PrintCopies           *int
	SessionTimeoutSeconds *int
	QRISExpiryMinutes     *int
	Frames                []Frame
	// ClearFrames distinguishes "set frames to empty" from "inherit". Without
	// it, a nil slice would be ambiguous.
	ClearFrames bool
}

func (r *PhotoBoothRepo) UpdateBooth(ctx context.Context, in UpdateBoothInput) (*Booth, error) {
	var frames []byte
	var err error
	if !in.ClearFrames {
		frames, err = marshalFramesOrNil(in.Frames)
		if err != nil {
			return nil, err
		}
	}
	row := r.pool.QueryRow(ctx, `
		UPDATE photobooth_booths
		SET name = $2, location = $3, status = $4, notes = $5,
		    price_cents = $6, shots_count = $7, print_copies = $8,
		    session_timeout_seconds = $9, qris_expiry_minutes = $10,
		    frames = $11, updated_at = now()
		WHERE id = $1
		RETURNING `+boothCols,
		in.ID, in.Name, in.Location, in.Status, in.Notes,
		in.PriceCents, in.ShotsCount, in.PrintCopies,
		in.SessionTimeoutSeconds, in.QRISExpiryMinutes, frames)
	b, err := scanBooth(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBoothNotFound
	}
	return b, err
}

func (r *PhotoBoothRepo) FindBoothByID(ctx context.Context, id uuid.UUID) (*Booth, error) {
	b, err := scanBooth(r.pool.QueryRow(ctx,
		`SELECT `+boothCols+` FROM photobooth_booths WHERE id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBoothNotFound
	}
	return b, err
}

func (r *PhotoBoothRepo) ListBooths(ctx context.Context) ([]Booth, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT `+boothCols+` FROM photobooth_booths
		 ORDER BY status = 'retired', code ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Booth{}
	for rows.Next() {
		b, err := scanBooth(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *b)
	}
	return out, rows.Err()
}

// EffectiveConfigFor resolves a booth's config against the platform defaults
// in SQL, so there is exactly one place the COALESCE happens.
func (r *PhotoBoothRepo) EffectiveConfigFor(ctx context.Context, boothID uuid.UUID) (*EffectiveConfig, error) {
	var c EffectiveConfig
	var frames []byte
	err := r.pool.QueryRow(ctx, `
		SELECT COALESCE(b.price_cents,             s.default_price_cents),
		       COALESCE(b.shots_count,             s.default_shots_count),
		       COALESCE(b.print_copies,            s.default_print_copies),
		       COALESCE(b.session_timeout_seconds, s.default_session_timeout_seconds),
		       COALESCE(b.qris_expiry_minutes,     s.default_qris_expiry_minutes),
		       COALESCE(b.frames,                  s.default_frames)
		FROM photobooth_booths b
		CROSS JOIN photobooth_settings s
		WHERE b.id = $1 AND s.id = true
	`, boothID).Scan(&c.PriceCents, &c.ShotsCount, &c.PrintCopies,
		&c.SessionTimeoutSeconds, &c.QRISExpiryMinutes, &frames)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrBoothNotFound
	}
	if err != nil {
		return nil, err
	}
	if len(frames) > 0 {
		_ = json.Unmarshal(frames, &c.Frames)
	}
	if c.Frames == nil {
		c.Frames = []Frame{}
	}
	return &c, nil
}

// === Device tokens ===

// DeviceToken is the stored half of a booth credential. The raw value exists
// only in the response to the issue call.
type DeviceToken struct {
	ID          uuid.UUID
	BoothID     uuid.UUID
	TokenPrefix string
	Label       string
	CreatedAt   time.Time
	LastUsedAt  *time.Time
	RevokedAt   *time.Time
}

// HashDeviceToken is the one place the raw-to-stored transformation lives.
// Exported so the middleware hashes exactly the way the repo stored it.
func HashDeviceToken(raw string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(raw)))
	return hex.EncodeToString(sum[:])
}

// IssueDeviceToken mints a credential and returns the raw value ONCE.
//
// A booth may hold several live tokens at the same time; that overlap is what
// makes rotation safe (issue, provision the tablet, then revoke the old one)
// rather than a flag day where a booth is briefly unable to sell.
func (r *PhotoBoothRepo) IssueDeviceToken(ctx context.Context, boothID uuid.UUID, label string, createdBy uuid.UUID) (raw string, t *DeviceToken, err error) {
	return insertDeviceToken(ctx, r.pool, boothID, label, createdBy)
}

// insertDeviceToken is the one place a booth credential comes into existence —
// whether an admin issued it directly or a tablet redeemed a pairing code.
func insertDeviceToken(ctx context.Context, q rowQuerier, boothID uuid.UUID, label string, createdBy uuid.UUID) (string, *DeviceToken, error) {
	// 32 bytes of crypto/rand, hex-encoded. Deliberately not the base62
	// helper used for table tokens: that one takes `byte % 62`, which is
	// slightly biased, and a long-lived device credential is the wrong place
	// to spend entropy on cosmetics.
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", nil, err
	}
	raw := "pbt_" + hex.EncodeToString(buf)
	prefix := raw[:14]

	var out DeviceToken
	err := q.QueryRow(ctx, `
		INSERT INTO photobooth_device_tokens (booth_id, token_hash, token_prefix, label, created_by)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, booth_id, token_prefix, label, created_at, last_used_at, revoked_at
	`, boothID, HashDeviceToken(raw), prefix, label, nullUUID(createdBy)).
		Scan(&out.ID, &out.BoothID, &out.TokenPrefix, &out.Label,
			&out.CreatedAt, &out.LastUsedAt, &out.RevokedAt)
	if err != nil {
		return "", nil, err
	}
	return raw, &out, nil
}

func (r *PhotoBoothRepo) ListDeviceTokens(ctx context.Context, boothID uuid.UUID) ([]DeviceToken, error) {
	rows, err := r.pool.Query(ctx, `
		SELECT id, booth_id, token_prefix, label, created_at, last_used_at, revoked_at
		FROM photobooth_device_tokens
		WHERE booth_id = $1
		ORDER BY revoked_at IS NOT NULL, created_at DESC
	`, boothID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []DeviceToken{}
	for rows.Next() {
		var t DeviceToken
		if err := rows.Scan(&t.ID, &t.BoothID, &t.TokenPrefix, &t.Label,
			&t.CreatedAt, &t.LastUsedAt, &t.RevokedAt); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}

// RevokeDeviceToken is idempotent: revoking an already-revoked token keeps the
// original timestamp rather than rewriting history.
func (r *PhotoBoothRepo) RevokeDeviceToken(ctx context.Context, tokenID, revokedBy uuid.UUID) error {
	ct, err := r.pool.Exec(ctx, `
		UPDATE photobooth_device_tokens
		SET revoked_at = now(), revoked_by = $2
		WHERE id = $1 AND revoked_at IS NULL
	`, tokenID, nullUUID(revokedBy))
	if err != nil {
		return err
	}
	if ct.RowsAffected() == 0 {
		// Either unknown or already revoked. Both leave the caller's intent
		// satisfied, so this is not an error.
		return nil
	}
	return nil
}

// AuthenticatedBooth is what RequireBooth puts on the request context.
type AuthenticatedBooth struct {
	Booth   *Booth
	TokenID uuid.UUID
}

// FindActiveBoothByTokenHash authenticates a device in one indexed query.
//
// It deliberately does NOT touch the users table: RequireAuth loads a user row
// per request to enforce bans and sessions_valid_after, and neither concept
// applies to a device. This endpoint is polled every few seconds, so the extra
// query would be pure cost.
func (r *PhotoBoothRepo) FindActiveBoothByTokenHash(ctx context.Context, hash string) (*AuthenticatedBooth, error) {
	row := r.pool.QueryRow(ctx, `
		SELECT t.id, `+prefixCols("b", boothCols)+`
		FROM photobooth_device_tokens t
		JOIN photobooth_booths b ON b.id = t.booth_id
		WHERE t.token_hash = $1
		  AND t.revoked_at IS NULL
		  AND b.status = 'active'
	`, hash)

	var tokenID uuid.UUID
	var b Booth
	var frames []byte
	err := row.Scan(&tokenID,
		&b.ID, &b.Code, &b.Name, &b.Location, &b.Status,
		&b.PriceCents, &b.ShotsCount, &b.PrintCopies, &b.SessionTimeoutSeconds,
		&b.QRISExpiryMinutes, &frames, &b.Notes,
		&b.LastSeenAt, &b.AppVersion, &b.PrinterOK, &b.PaperLow,
		&b.CreatedAt, &b.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrDeviceTokenInvalid
	}
	if err != nil {
		return nil, err
	}
	if len(frames) > 0 {
		_ = json.Unmarshal(frames, &b.Frames)
	}
	return &AuthenticatedBooth{Booth: &b, TokenID: tokenID}, nil
}

// TouchDevice records liveness. Called at most once per booth per couple of
// minutes by the middleware — never per request, because the status poll runs
// every few seconds and a write per poll is write amplification for nothing.
func (r *PhotoBoothRepo) TouchDevice(ctx context.Context, boothID, tokenID uuid.UUID) error {
	if _, err := r.pool.Exec(ctx, `
		UPDATE photobooth_device_tokens SET last_used_at = now() WHERE id = $1
	`, tokenID); err != nil {
		return err
	}
	_, err := r.pool.Exec(ctx, `
		UPDATE photobooth_booths SET last_seen_at = now() WHERE id = $1
	`, boothID)
	return err
}

// Heartbeat records what the booth reports about itself.
func (r *PhotoBoothRepo) Heartbeat(ctx context.Context, boothID uuid.UUID, appVersion string, printerOK, paperLow bool) error {
	_, err := r.pool.Exec(ctx, `
		UPDATE photobooth_booths
		SET last_seen_at = now(),
		    app_version = COALESCE(NULLIF($2, ''), app_version),
		    printer_ok = $3, paper_low = $4, updated_at = now()
		WHERE id = $1
	`, boothID, appVersion, printerOK, paperLow)
	return err
}

// === helpers ===

// nullUUID maps the zero UUID to SQL NULL. The actor columns are nullable
// because not every write has a human behind it (a seeder, a future system
// job), and a zero UUID would otherwise be sent as a real id and break the
// foreign key.
func nullUUID(id uuid.UUID) *uuid.UUID {
	if id == uuid.Nil {
		return nil
	}
	return &id
}

func normalizeFrames(in []Frame) []Frame {
	if in == nil {
		return []Frame{}
	}
	return in
}

// marshalFramesOrNil returns nil (SQL NULL = inherit) for an absent slice, and
// a JSON array for a present one — including an explicitly empty one.
func marshalFramesOrNil(in []Frame) ([]byte, error) {
	if in == nil {
		return nil, nil
	}
	return json.Marshal(in)
}

func prefixCols(alias, cols string) string {
	parts := strings.Split(cols, ",")
	for i, p := range parts {
		parts[i] = alias + "." + strings.TrimSpace(p)
	}
	return strings.Join(parts, ", ")
}
