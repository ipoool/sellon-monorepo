package auth

import (
	"context"
	"errors"

	"google.golang.org/api/idtoken"
)

type GoogleProfile struct {
	Sub        string
	Email      string
	Name       string
	PictureURL string
}

type GoogleVerifier struct {
	clientID string
}

func NewGoogleVerifier(clientID string) *GoogleVerifier {
	return &GoogleVerifier{clientID: clientID}
}

// Verify validates a Google ID token (the credential returned by Google
// Identity Services on the frontend) against this app's audience and
// extracts the relevant profile fields.
func (g *GoogleVerifier) Verify(ctx context.Context, idTokenStr string) (*GoogleProfile, error) {
	if g.clientID == "" {
		return nil, errors.New("GOOGLE_CLIENT_ID is not configured")
	}
	payload, err := idtoken.Validate(ctx, idTokenStr, g.clientID)
	if err != nil {
		return nil, err
	}

	verified, _ := payload.Claims["email_verified"].(bool)
	if !verified {
		return nil, errors.New("google email not verified")
	}

	profile := &GoogleProfile{
		Sub:        payload.Subject,
		Email:      stringClaim(payload.Claims, "email"),
		Name:       stringClaim(payload.Claims, "name"),
		PictureURL: stringClaim(payload.Claims, "picture"),
	}
	if profile.Sub == "" || profile.Email == "" {
		return nil, errors.New("missing required claims in google id token")
	}
	return profile, nil
}

func stringClaim(claims map[string]any, key string) string {
	if v, ok := claims[key].(string); ok {
		return v
	}
	return ""
}
