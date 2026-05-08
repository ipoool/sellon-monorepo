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
		WebhookBaseURL: strings.TrimRight(v.GetString("webhook_base_url"), "/"),
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
