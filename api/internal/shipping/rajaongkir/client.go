// Package rajaongkir wraps the bits of the RajaOngkir shipping API we need:
// destination search + domestic cost.
//
// NOTE: RajaOngkir's legacy api.rajaongkir.com endpoints were shut down after
// the Komerce migration. This client targets the current Komerce platform:
//   https://rajaongkir.komerce.id/api/v1
// Existing RajaOngkir API keys continue to work via Komerce. Destinations are
// subdistrict-level (finer than the old city list) and searched server-side.
package rajaongkir

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
)

const baseURL = "https://rajaongkir.komerce.id/api/v1"

// Komerce's free tier allows only ~100 API hits/day. Destination lists and
// shipping rates are stable within a day, so we cache successful responses for
// 24h to stay well under the quota. The cache is in-process (no Redis
// dependency wired in this codebase) — fine for the single-instance deploy;
// if the API ever scales to multiple pods, move this to a shared Redis cache.
// Tracking/AWB responses are deliberately NOT cached (they change constantly).
const (
	cacheTTL        = 24 * time.Hour
	cacheMaxEntries = 10000 // memory guard; destination + cost keys per day stay well below this
)

// ttlCache is a tiny mutex-guarded TTL map. Values are read-only slices shared
// with callers — callers must not mutate what they get back.
type ttlCache struct {
	mu sync.Mutex
	m  map[string]ttlItem
}

type ttlItem struct {
	v   any
	exp time.Time
}

func newTTLCache() *ttlCache { return &ttlCache{m: make(map[string]ttlItem)} }

func (c *ttlCache) get(key string) (any, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	it, ok := c.m[key]
	if !ok {
		return nil, false
	}
	if time.Now().After(it.exp) {
		delete(c.m, key)
		return nil, false
	}
	return it.v, true
}

func (c *ttlCache) set(key string, v any) {
	c.mu.Lock()
	defer c.mu.Unlock()
	// Bound memory: when full, purge expired entries first; if still full,
	// reset (cheap and rare given the 24h TTL + modest key space).
	if len(c.m) >= cacheMaxEntries {
		now := time.Now()
		for k, it := range c.m {
			if now.After(it.exp) {
				delete(c.m, k)
			}
		}
		if len(c.m) >= cacheMaxEntries {
			c.m = make(map[string]ttlItem, cacheMaxEntries)
		}
	}
	c.m[key] = ttlItem{v: v, exp: time.Now().Add(cacheTTL)}
}

// Tier is retained for config/wiring compatibility but no longer changes the
// endpoint — Komerce uses a single base URL for all plans.
type Tier string

const (
	TierStarter Tier = "starter"
	TierBasic   Tier = "basic"
	TierPro     Tier = "pro"
)

type Client struct {
	apiKey string
	tier   Tier
	http   *http.Client
	cache  *ttlCache
}

// City mirrors a Komerce destination row. Field names are kept stable for
// callers; CityID is the Komerce destination id (used as origin/destination
// in cost calls), CityName is the human-readable full label.
type City struct {
	CityID     string
	ProvinceID string
	Province   string
	Type       string
	CityName   string
	PostalCode string
}

func (c *Client) IsConfigured() bool {
	return c != nil && c.apiKey != ""
}

func New(apiKey, tier string) *Client {
	t := Tier(strings.ToLower(strings.TrimSpace(tier)))
	switch t {
	case TierStarter, TierBasic, TierPro:
	default:
		t = TierStarter
	}
	return &Client{
		apiKey: apiKey,
		tier:   t,
		http:   &http.Client{Timeout: 12 * time.Second},
		cache:  newTTLCache(),
	}
}

type komerceDestination struct {
	ID           int    `json:"id"`
	Label        string `json:"label"`
	ProvinceName string `json:"province_name"`
	CityName     string `json:"city_name"`
	DistrictName string `json:"district_name"`
	SubdistName  string `json:"subdistrict_name"`
	ZipCode      string `json:"zip_code"`
}

// SearchCities queries Komerce's domestic-destination search. Unlike the old
// client this hits the API per query (server-side search) — destinations are
// subdistrict-level and far too numerous to cache + scan locally.
func (c *Client) SearchCities(ctx context.Context, query string, limit int) ([]City, error) {
	if !c.IsConfigured() {
		return nil, errors.New("rajaongkir not configured")
	}
	if limit <= 0 || limit > 50 {
		limit = 12
	}
	q := strings.TrimSpace(query)
	if q == "" {
		// No useful "list all" on a subdistrict dataset — let the picker
		// prompt the user to type. Empty result keeps the UI graceful.
		return []City{}, nil
	}

	// Destination lists are static within a day; serve from cache to spare the
	// ~100/day Komerce quota. Key on the normalized query + limit.
	cacheKey := fmt.Sprintf("dest:%d:%s", limit, strings.ToLower(q))
	if v, ok := c.cache.get(cacheKey); ok {
		return v.([]City), nil
	}

	u := fmt.Sprintf(
		"%s/destination/domestic-destination?search=%s&limit=%d&offset=0",
		baseURL, url.QueryEscape(q), limit,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("key", c.apiKey)

	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("komerce destination status %d: %s", resp.StatusCode, body)
	}

	var env struct {
		Data []komerceDestination `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return nil, err
	}

	out := make([]City, 0, len(env.Data))
	for _, d := range env.Data {
		out = append(out, City{
			CityID:     strconv.Itoa(d.ID),
			Province:   d.ProvinceName,
			CityName:   d.Label,
			PostalCode: d.ZipCode,
		})
	}
	c.cache.set(cacheKey, out)
	return out, nil
}

// === Cost ===

type CostRequest struct {
	Origin      string // Komerce destination id
	Destination string // Komerce destination id
	WeightG     int
	Courier     string // single code ("jne") or colon-joined ("jne:tiki:pos")
}

type CostOption struct {
	CourierCode string
	CourierName string
	Service     string
	Description string
	PriceRpah   int64
	ETA         string
}

func (c *Client) Cost(ctx context.Context, req CostRequest) ([]CostOption, error) {
	if !c.IsConfigured() {
		return nil, errors.New("rajaongkir not configured")
	}
	if req.Origin == "" || req.Destination == "" {
		return nil, errors.New("origin/destination kosong")
	}
	if req.WeightG <= 0 {
		req.WeightG = 250
	}
	if req.Courier == "" {
		return nil, errors.New("courier kosong")
	}

	courier := strings.ToLower(req.Courier)
	// Rates are stable within a day; cache on the full quote signature to spare
	// the ~100/day Komerce quota (busy stores re-quote the same route+weight).
	cacheKey := fmt.Sprintf("cost:%s:%s:%d:%s", req.Origin, req.Destination, req.WeightG, courier)
	if v, ok := c.cache.get(cacheKey); ok {
		return v.([]CostOption), nil
	}

	form := url.Values{}
	form.Set("origin", req.Origin)
	form.Set("destination", req.Destination)
	form.Set("weight", strconv.Itoa(req.WeightG))
	form.Set("courier", courier)

	httpReq, err := http.NewRequestWithContext(ctx,
		http.MethodPost, baseURL+"/calculate/domestic-cost",
		strings.NewReader(form.Encode()),
	)
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("key", c.apiKey)
	httpReq.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := c.http.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("komerce cost status %d: %s", resp.StatusCode, body)
	}

	var env struct {
		Data []struct {
			Name        string `json:"name"`
			Code        string `json:"code"`
			Service     string `json:"service"`
			Description string `json:"description"`
			Cost        int64  `json:"cost"`
			ETD         string `json:"etd"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return nil, err
	}

	out := make([]CostOption, 0, len(env.Data))
	for _, d := range env.Data {
		out = append(out, CostOption{
			CourierCode: d.Code,
			CourierName: d.Name,
			Service:     d.Service,
			Description: d.Description,
			PriceRpah:   d.Cost,
			ETA:         cleanETD(d.ETD),
		})
	}
	c.cache.set(cacheKey, out)
	return out, nil
}

// cleanETD strips trailing unit words from Komerce's etd ("6 day",
// "12-15 day") leaving just the number/range so callers can append their own
// unit label. Returns "" when no estimate is given.
func cleanETD(etd string) string {
	s := strings.TrimSpace(etd)
	if s == "" {
		return ""
	}
	for _, suffix := range []string{"days", "day", "hari"} {
		s = strings.TrimSpace(strings.TrimSuffix(s, suffix))
	}
	return s
}
