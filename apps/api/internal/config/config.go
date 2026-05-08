package config

import (
	"strings"

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
}

func Load() (*Config, error) {
	v := viper.New()
	v.AutomaticEnv()
	v.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))

	v.SetDefault("api_port", "8080")
	v.SetDefault("api_env", "development")
	v.SetDefault("api_log_level", "debug")

	return &Config{
		Port:       v.GetString("api_port"),
		Env:        v.GetString("api_env"),
		LogLevel:   v.GetString("api_log_level"),
		DBHost:     v.GetString("postgres_host"),
		DBPort:     v.GetString("postgres_port"),
		DBUser:     v.GetString("postgres_user"),
		DBPassword: v.GetString("postgres_password"),
		DBName:     v.GetString("postgres_db"),
		RedisHost:  v.GetString("redis_host"),
		RedisPort:  v.GetString("redis_port"),
	}, nil
}
