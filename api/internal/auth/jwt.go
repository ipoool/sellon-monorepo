package auth

import (
	"errors"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

const SessionCookieName = "sellon_session"

type SessionClaims struct {
	UserID uuid.UUID `json:"uid"`
	// Impersonator is set when an admin issued this token to act as
	// UserID. The middleware reads this and stamps it on the request
	// context so audit log helpers can record both the actor and the
	// human admin behind the action.
	Impersonator *uuid.UUID `json:"imp,omitempty"`
	jwt.RegisteredClaims
}

type JWTService struct {
	secret []byte
	ttl    time.Duration
}

func NewJWTService(secret string, ttl time.Duration) *JWTService {
	return &JWTService{secret: []byte(secret), ttl: ttl}
}

func (s *JWTService) Issue(userID uuid.UUID) (string, time.Time, error) {
	return s.IssueImpersonation(userID, nil, s.ttl)
}

// IssueImpersonation creates a token that authenticates as `userID`
// while recording the originating admin in the `imp` claim. Use a
// shorter ttl (e.g. 30 minutes) so an abandoned impersonation session
// can't linger forever.
func (s *JWTService) IssueImpersonation(userID uuid.UUID, impersonator *uuid.UUID, ttl time.Duration) (string, time.Time, error) {
	if ttl <= 0 {
		ttl = s.ttl
	}
	exp := time.Now().Add(ttl)
	claims := SessionClaims{
		UserID:       userID,
		Impersonator: impersonator,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(exp),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "sellon-api",
			Subject:   userID.String(),
		},
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := tok.SignedString(s.secret)
	return signed, exp, err
}

func (s *JWTService) Verify(tokenStr string) (*SessionClaims, error) {
	parsed, err := jwt.ParseWithClaims(tokenStr, &SessionClaims{}, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return s.secret, nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := parsed.Claims.(*SessionClaims)
	if !ok || !parsed.Valid {
		return nil, errors.New("invalid token")
	}
	return claims, nil
}

func (s *JWTService) TTL() time.Duration { return s.ttl }
