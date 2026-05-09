// Package rajaongkir wraps the bits of the RajaOngkir API we need:
// cities (cached) + cost (computed per request).
//
// API docs: https://rajaongkir.com/dokumentasi/starter
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

// Tier maps to RajaOngkir's starter / basic / pro plans. The endpoint
// path differs per tier; the rest of the API surface is consistent.
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

	mu          sync.RWMutex
	cities      []City
	citiesAt    time.Time
	citiesTTL   time.Duration
	citiesError error
}

type City struct {
	CityID     string `json:"city_id"`
	ProvinceID string `json:"province_id"`
	Province   string `json:"province"`
	Type       string `json:"type"` // "Kota" or "Kabupaten"
	CityName   string `json:"city_name"`
	PostalCode string `json:"postal_code"`
}

// IsConfigured returns true when an API key is set. Handlers should treat
// a non-configured client as a soft "fall back to built-in table".
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
		apiKey:    apiKey,
		tier:      t,
		http:      &http.Client{Timeout: 12 * time.Second},
		citiesTTL: 24 * time.Hour,
	}
}

func (c *Client) baseURL() string {
	switch c.tier {
	case TierBasic:
		return "https://api.rajaongkir.com/basic"
	case TierPro:
		return "https://pro.rajaongkir.com/api"
	default:
		return "https://api.rajaongkir.com/starter"
	}
}

// Cities returns the full city list, cached for 24 hours. The list is
// ~500 rows so we keep it in process memory and search locally — saves
// a round-trip per buyer keystroke.
func (c *Client) Cities(ctx context.Context) ([]City, error) {
	if !c.IsConfigured() {
		return nil, errors.New("rajaongkir not configured")
	}
	c.mu.RLock()
	if c.cities != nil && time.Since(c.citiesAt) < c.citiesTTL {
		out := c.cities
		c.mu.RUnlock()
		return out, nil
	}
	c.mu.RUnlock()

	c.mu.Lock()
	defer c.mu.Unlock()
	if c.cities != nil && time.Since(c.citiesAt) < c.citiesTTL {
		return c.cities, nil
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL()+"/city", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("key", c.apiKey)
	resp, err := c.http.Do(req)
	if err != nil {
		c.citiesError = err
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 1024))
		return nil, fmt.Errorf("rajaongkir city status %d: %s", resp.StatusCode, body)
	}

	var env struct {
		RajaOngkir struct {
			Results []City `json:"results"`
		} `json:"rajaongkir"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return nil, err
	}
	c.cities = env.RajaOngkir.Results
	c.citiesAt = time.Now()
	c.citiesError = nil
	return c.cities, nil
}

// SearchCities does a case-insensitive substring match over the cached
// list. Returns up to `limit` matches.
func (c *Client) SearchCities(ctx context.Context, query string, limit int) ([]City, error) {
	if limit <= 0 || limit > 50 {
		limit = 12
	}
	cities, err := c.Cities(ctx)
	if err != nil {
		return nil, err
	}
	q := strings.ToLower(strings.TrimSpace(query))
	if q == "" {
		// Empty query: return first N alphabetically — useful for default state.
		out := make([]City, 0, limit)
		for i := 0; i < limit && i < len(cities); i++ {
			out = append(out, cities[i])
		}
		return out, nil
	}
	out := make([]City, 0, limit)
	for _, ct := range cities {
		hay := strings.ToLower(ct.CityName + " " + ct.Province)
		if strings.Contains(hay, q) {
			out = append(out, ct)
			if len(out) >= limit {
				break
			}
		}
	}
	return out, nil
}

// FindCityByID is a quick lookup over the cached list.
func (c *Client) FindCityByID(ctx context.Context, id string) (*City, error) {
	cities, err := c.Cities(ctx)
	if err != nil {
		return nil, err
	}
	for i := range cities {
		if cities[i].CityID == id {
			return &cities[i], nil
		}
	}
	return nil, errors.New("city not found")
}

// === Cost ===

type CostRequest struct {
	Origin      string // city_id
	Destination string // city_id
	WeightG     int
	Courier     string // "jne" | "tiki" | "pos" (starter); more on basic/pro
}

type CostOption struct {
	CourierCode string // "jne", "tiki", etc.
	CourierName string // "Jalur Nugraha Ekakurir (JNE)"
	Service     string // "REG", "YES"
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
	form := url.Values{}
	form.Set("origin", req.Origin)
	form.Set("destination", req.Destination)
	form.Set("weight", strconv.Itoa(req.WeightG))
	form.Set("courier", strings.ToLower(req.Courier))

	httpReq, err := http.NewRequestWithContext(ctx,
		http.MethodPost, c.baseURL()+"/cost",
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
		return nil, fmt.Errorf("rajaongkir cost status %d: %s", resp.StatusCode, body)
	}

	var env struct {
		RajaOngkir struct {
			Results []struct {
				Code  string `json:"code"`
				Name  string `json:"name"`
				Costs []struct {
					Service     string `json:"service"`
					Description string `json:"description"`
					Cost        []struct {
						Value int64  `json:"value"`
						ETD   string `json:"etd"`
						Note  string `json:"note"`
					} `json:"cost"`
				} `json:"costs"`
			} `json:"results"`
		} `json:"rajaongkir"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&env); err != nil {
		return nil, err
	}

	out := make([]CostOption, 0, 4)
	for _, r := range env.RajaOngkir.Results {
		for _, s := range r.Costs {
			if len(s.Cost) == 0 {
				continue
			}
			out = append(out, CostOption{
				CourierCode: r.Code,
				CourierName: r.Name,
				Service:     s.Service,
				Description: s.Description,
				PriceRpah:   s.Cost[0].Value,
				ETA:         s.Cost[0].ETD,
			})
		}
	}
	return out, nil
}
