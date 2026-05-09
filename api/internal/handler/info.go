package handler

import (
	"net/http"

	"github.com/sellon/sellon/api/internal/config"
	"github.com/sellon/sellon/api/internal/pkg/response"
)

func Info(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		response.JSON(w, http.StatusOK, map[string]any{
			"name":    "sellon-api",
			"version": "0.1.0",
			"env":     cfg.Env,
			"features": map[string]bool{
				// True when Supabase URL+key+bucket are all configured server
				// side. The web client uses this to decide whether to surface
				// the upload button or fall back to URL-only input.
				"photo_upload": cfg.SupabaseURL != "" &&
					cfg.SupabaseServiceKey != "" &&
					cfg.SupabaseBucket != "",
			},
		})
	}
}
