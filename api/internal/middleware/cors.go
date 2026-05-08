package middleware

import (
	"net/http"
	"strings"

	"github.com/go-chi/cors"
)

// CORS allows the configured web origin (comma-separated for multiple).
func CORS(webOrigin string) func(http.Handler) http.Handler {
	origins := []string{}
	for _, o := range strings.Split(webOrigin, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			origins = append(origins, o)
		}
	}
	if len(origins) == 0 {
		origins = []string{"http://localhost:3000"}
	}

	return cors.Handler(cors.Options{
		AllowedOrigins:   origins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	})
}
