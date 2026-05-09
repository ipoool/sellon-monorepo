package config

import (
	"errors"
	"strings"
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Port     string
	Env      string
	LogLevel string

	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string

	RedisHost string
	RedisPort string

	GoogleClientID string
	JWTSecret      string
	JWTTTL         time.Duration
	WebOrigin      string

	// Public base URL for webhooks (no trailing slash). Sellers paste
	// {WebhookBaseURL}/webhooks/midtrans/{token} into Midtrans dashboard.
	WebhookBaseURL string

	// Supabase Storage — used by the API to host uploaded product photos.
	// All three are optional; without them the upload endpoint returns 503
	// and the frontend falls back to URL-only input.
	SupabaseURL        string
	SupabaseServiceKey string
	SupabaseBucket     string

	// RajaOngkir — live ongkir integration. Optional; without it the
	// shipping handler falls back to the built-in zone-based table.
	RajaOngkirAPIKey string
	RajaOngkirTier   string // "starter" | "basic" | "pro"; defaults to starter
}

func Load() (*Config, error) {
	v := viper.New()
	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	v.SetDefault("api_port", "8080")
	v.SetDefault("api_env", "development")
	v.SetDefault("api_log_level", "debug")
	v.SetDefault("jwt_ttl_hours", 24*7)
	v.SetDefault("web_origin", "http://localhost:3000")
	v.SetDefault("webhook_base_url", "http://localhost:8080")
	v.SetDefault("supabase_bucket", "products")
	v.SetDefault("rajaongkir_tier", "starter")

	cfg := &Config{
		Port:           v.GetString("api_port"),
		Env:            v.GetString("api_env"),
		LogLevel:       v.GetString("api_log_level"),
		DBHost:         v.GetString("postgres_host"),
		DBPort:         v.GetString("postgres_port"),
		DBUser:         v.GetString("postgres_user"),
		DBPassword:     v.GetString("postgres_password"),
		DBName:         v.GetString("postgres_db"),
		RedisHost:      v.GetString("redis_host"),
		RedisPort:      v.GetString("redis_port"),
		GoogleClientID: v.GetString("google_client_id"),
		JWTSecret:      v.GetString("jwt_secret"),
		JWTTTL:         time.Duration(v.GetInt("jwt_ttl_hours")) * time.Hour,
		WebOrigin:      v.GetString("web_origin"),
		WebhookBaseURL:     strings.TrimRight(v.GetString("webhook_base_url"), "/"),
		SupabaseURL:        strings.TrimRight(v.GetString("supabase_url"), "/"),
		SupabaseServiceKey: v.GetString("supabase_service_key"),
		SupabaseBucket:     v.GetString("supabase_bucket"),
		RajaOngkirAPIKey:   v.GetString("rajaongkir_api_key"),
		RajaOngkirTier:     v.GetString("rajaongkir_tier"),
	}

	if cfg.JWTSecret == "" {
		return nil, errors.New("JWT_SECRET is required")
	}
	return cfg, nil
}

func (c *Config) DSN() string {
	return "postgres://" + c.DBUser + ":" + c.DBPassword + "@" + c.DBHost + ":" + c.DBPort + "/" + c.DBName + "?sslmode=disable"
}

func (c *Config) IsProd() bool {
	return c.Env == "production"
}
