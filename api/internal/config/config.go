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
	// "disable" untuk container Postgres lokal di overlay Swarm (default
	// untuk kompatibilitas dev). "require" / "verify-full" untuk managed
	// Postgres production (Supabase / Neon / DigitalOcean).
	DBSSLMode string

	RedisHost string
	RedisPort string

	GoogleClientID string
	JWTSecret      string
	JWTTTL         time.Duration
	// WebOrigin is the CORS allowlist — comma-separated list of allowed
	// origins (mis. `http://localhost:3000,http://localhost:3100`). Pakai
	// `PrimaryWebOrigin()` saat butuh single canonical URL untuk
	// build link (email CTA, dll), jangan langsung concat.
	WebOrigin string

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

	// Platform Midtrans — used by SaaS-side billing (Berlangganan).
	// Distinct from per-seller BYO Midtrans keys; this is SellOn's own
	// merchant account. Without these, /subscription/checkout returns 503
	// and the frontend falls back to manual-transfer.
	PlatformMidtransServerKey string
	PlatformMidtransClientKey string
	PlatformMidtransSandbox   bool

	// Mailtrap — transactional email via the Send API (HTTP, not SMTP).
	// All three required for sending; when API key is empty the email
	// package becomes a no-op so local dev keeps working without
	// credentials.
	MailtrapAPIKey string
	FromEmail      string
	FromName       string

	// Twilio (platform-funded) — single account on the platform side,
	// used to push WhatsApp new-order alerts to sellers. When
	// AccountSID or AuthToken is empty the notify package becomes a
	// no-op so dev works without creds. WhatsAppFrom should be the
	// sandbox or production sender in E.164 form, e.g. "+14155238886"
	// (the package prepends "whatsapp:" itself).
	TwilioAccountSID   string
	TwilioAuthToken    string
	TwilioWhatsAppFrom string

	// Anthropic — used by the weekly-tips scheduler to generate fresh
	// email content via Claude. Without this key the scheduler falls
	// back to the built-in static tip pool.
	AnthropicAPIKey string

	// CnameTarget is the DNS CNAME value sellers must point their custom
	// domain at. Shown on the settings/domain page. Defaults to cname.sellon.id.
	CnameTarget string
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
	v.SetDefault("supabase_bucket", "stores")
	v.SetDefault("rajaongkir_tier", "starter")
	v.SetDefault("platform_midtrans_sandbox", true)
	v.SetDefault("from_name", "SellOn")
	v.SetDefault("postgres_sslmode", "disable")
	v.SetDefault("cname_target", "cname.sellon.id")

	cfg := &Config{
		Port:           v.GetString("api_port"),
		Env:            v.GetString("api_env"),
		LogLevel:       v.GetString("api_log_level"),
		DBHost:         v.GetString("postgres_host"),
		DBPort:         v.GetString("postgres_port"),
		DBUser:         v.GetString("postgres_user"),
		DBPassword:     v.GetString("postgres_password"),
		DBName:         v.GetString("postgres_db"),
		DBSSLMode:      v.GetString("postgres_sslmode"),
		RedisHost:      v.GetString("redis_host"),
		RedisPort:      v.GetString("redis_port"),
		GoogleClientID: v.GetString("google_client_id"),
		JWTSecret:      v.GetString("jwt_secret"),
		JWTTTL:         time.Duration(v.GetInt("jwt_ttl_hours")) * time.Hour,
		WebOrigin:      v.GetString("web_origin"),
		WebhookBaseURL:     strings.TrimRight(v.GetString("webhook_base_url"), "/"),
		SupabaseURL: strings.TrimRight(v.GetString("supabase_url"), "/"),
		// Prefer SUPABASE_SERVICE_ROLE_KEY (Supabase dashboard naming),
		// fallback ke SUPABASE_SERVICE_KEY untuk backward compat dengan
		// env files lama.
		SupabaseServiceKey: firstNonEmpty(
			v.GetString("supabase_service_role_key"),
			v.GetString("supabase_service_key"),
		),
		SupabaseBucket: v.GetString("supabase_bucket"),
		RajaOngkirAPIKey:          v.GetString("rajaongkir_api_key"),
		RajaOngkirTier:            v.GetString("rajaongkir_tier"),
		PlatformMidtransServerKey: v.GetString("platform_midtrans_server_key"),
		PlatformMidtransClientKey: v.GetString("platform_midtrans_client_key"),
		PlatformMidtransSandbox:   v.GetBool("platform_midtrans_sandbox"),
		MailtrapAPIKey:            v.GetString("mailtrap_api_key"),
		FromEmail:                 v.GetString("from_email"),
		FromName:                  v.GetString("from_name"),
		TwilioAccountSID:          v.GetString("twilio_account_sid"),
		TwilioAuthToken:           v.GetString("twilio_auth_token"),
		TwilioWhatsAppFrom:        v.GetString("twilio_whatsapp_from"),
		AnthropicAPIKey:           v.GetString("anthropic_api_key"),
		CnameTarget:               v.GetString("cname_target"),
	}

	if cfg.JWTSecret == "" {
		return nil, errors.New("JWT_SECRET is required")
	}
	return cfg, nil
}

func (c *Config) DSN() string {
	sslmode := c.DBSSLMode
	if sslmode == "" {
		sslmode = "disable"
	}
	return "postgres://" + c.DBUser + ":" + c.DBPassword + "@" + c.DBHost + ":" + c.DBPort + "/" + c.DBName + "?sslmode=" + sslmode
}

func (c *Config) IsProd() bool {
	return c.Env == "production"
}

// PrimaryWebOrigin returns satu canonical web origin untuk dipakai
// saat membangun link absolut (email CTA, deep link, dll). Strip
// trailing slash & ambil first dari comma-separated list. CORS
// middleware tetap pakai field WebOrigin raw.
func (c *Config) PrimaryWebOrigin() string {
	parts := strings.Split(c.WebOrigin, ",")
	for _, p := range parts {
		if v := strings.TrimSpace(strings.TrimRight(p, "/")); v != "" {
			return v
		}
	}
	return ""
}

// firstNonEmpty returns the first non-empty string in the args, or "".
// Dipakai untuk env alias (mis. SUPABASE_SERVICE_ROLE_KEY → fallback
// ke SUPABASE_SERVICE_KEY).
func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}
