package handler

import (
	"net/http"

	"github.com/sellon/sellon/apps/api/internal/pkg/response"
)

func Health(w http.ResponseWriter, r *http.Request) {
	response.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}
