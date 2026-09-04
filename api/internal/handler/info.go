package handler

import (
	"net/http"

	"github.com/sellon/sellon/api/internal/config"
	"github.com/sellon/sellon/api/internal/pkg/response"
)

// Info is public. It carries only switches and identifiers the browser is
// meant to see, so the login page can render the right sign-in options
// without baking them into the JS bundle at build time — flipping a flag is
// a server env change, not a web rebuild.
func Info(cfg *config.Config, storageReady bool) http.HandlerFunc {
	googleReady := cfg.GoogleClientID != ""
	return func(w http.ResponseWriter, r *http.Request) {
		out := map[string]any{
			"name":    "sellon-api",
			"version": "0.1.0",
			"env":     cfg.Env,
			"features": map[string]bool{
				// Whether uploads can succeed right now, straight from the
				// storage client rather than re-deriving it from env vars
				// (which silently went stale when the backend changed).
				"photo_upload": storageReady,
				// True when the platform Midtrans server key is set; lets the
				// dashboard show the "Bayar Sekarang" button next to the
				// manual-transfer fallback.
				"platform_billing": cfg.PlatformMidtransServerKey != "",
				// Sign-in options. email_password covers the whole
				// email+password path including login: false means the login
				// page offers Google only.
				"google_signin":  googleReady,
				"email_password": cfg.AuthEmailPasswordEnabled,
			},
		}
		// Public by design: this id is visible in any Google sign-in button.
		if googleReady {
			out["google_client_id"] = cfg.GoogleClientID
		}
		response.JSON(w, http.StatusOK, out)
	}
}
