package handler

import (
	"net/http"

	"github.com/sellon/sellon/apps/api/internal/config"
	"github.com/sellon/sellon/apps/api/internal/pkg/response"
)

func Info(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		response.JSON(w, http.StatusOK, map[string]any{
			"name":    "sellon-api",
			"version": "0.1.0",
			"env":     cfg.Env,
		})
	}
}
