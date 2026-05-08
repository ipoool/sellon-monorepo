package handler

import (
	"net/http"

	"github.com/tokoflow/tokoflow/apps/api/internal/config"
	"github.com/tokoflow/tokoflow/apps/api/internal/pkg/response"
)

func Info(cfg *config.Config) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		response.JSON(w, http.StatusOK, map[string]any{
			"name":    "tokoflow-api",
			"version": "0.1.0",
			"env":     cfg.Env,
		})
	}
}
