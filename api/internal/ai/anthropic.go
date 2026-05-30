// Package ai provides a minimal raw-HTTP client for the Anthropic Messages API.
// We use raw HTTP rather than the official SDK to keep the dependency count low —
// the only call site is the weekly-tips scheduler (once per week).
package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"time"
)

const (
	anthropicEndpoint = "https://api.anthropic.com/v1/messages"
	anthropicVersion  = "2023-06-01"
	// Model used for content generation. Sonnet 4.6 is the current default.
	DefaultModel = "claude-sonnet-4-6"
)

// AnthropicClient is a lightweight Anthropic Messages API client.
// Safe to share across goroutines.
type AnthropicClient struct {
	apiKey string
	http   *http.Client
	logger *slog.Logger
}

func NewAnthropicClient(apiKey string, logger *slog.Logger) *AnthropicClient {
	return &AnthropicClient{
		apiKey: apiKey,
		http:   &http.Client{Timeout: 90 * time.Second},
		logger: logger,
	}
}

func (c *AnthropicClient) Configured() bool {
	return c != nil && c.apiKey != ""
}

// Complete sends a single-turn message with an optional cached system prompt
// and returns the assistant's text. Prompt caching is activated via the
// anthropic-beta header — the system prompt is marked ephemeral (5-min TTL).
func (c *AnthropicClient) Complete(ctx context.Context, model, systemPrompt, userPrompt string, maxTokens int) (string, error) {
	payload := map[string]any{
		"model":      model,
		"max_tokens": maxTokens,
		"system": []map[string]any{
			{
				"type": "text",
				"text": systemPrompt,
				"cache_control": map[string]string{
					"type": "ephemeral",
				},
			},
		},
		"messages": []map[string]string{
			{"role": "user", "content": userPrompt},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("anthropic: marshal request: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, anthropicEndpoint, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("anthropic: build request: %w", err)
	}
	req.Header.Set("x-api-key", c.apiKey)
	req.Header.Set("anthropic-version", anthropicVersion)
	req.Header.Set("anthropic-beta", "prompt-caching-2024-07-31")
	req.Header.Set("content-type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("anthropic: request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("anthropic: read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		c.logger.Error("anthropic: API error", "status", resp.StatusCode, "body", string(respBody))
		return "", fmt.Errorf("anthropic: HTTP %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens              int `json:"input_tokens"`
			OutputTokens             int `json:"output_tokens"`
			CacheCreationInputTokens int `json:"cache_creation_input_tokens"`
			CacheReadInputTokens     int `json:"cache_read_input_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("anthropic: parse response: %w (raw: %.300s)", err, string(respBody))
	}

	if len(result.Content) == 0 {
		return "", fmt.Errorf("anthropic: empty content in response")
	}

	c.logger.Info("anthropic: request completed",
		"model", model,
		"input_tokens", result.Usage.InputTokens,
		"output_tokens", result.Usage.OutputTokens,
		"cache_read_tokens", result.Usage.CacheReadInputTokens,
		"cache_write_tokens", result.Usage.CacheCreationInputTokens,
	)

	return result.Content[0].Text, nil
}
