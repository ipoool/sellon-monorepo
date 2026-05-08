// Package shipping computes ongkir without depending on Biteship/RajaOngkir.
//
// Strategy: city-string -> zone bucket (Jabodetabek / Jawa / Luar Jawa /
// Sama Kota), and a per-courier base table that scales with kg-rounded-up
// weight. Real Biteship integration can replace this later via the same
// interface.
package shipping

import (
	"strings"
	"time"
)

type Zone string

const (
	ZoneSameCity     Zone = "same_city"
	ZoneJabodetabek  Zone = "jabodetabek"
	ZoneJawa         Zone = "jawa"
	ZoneLuarJawa     Zone = "luar_jawa"
)

// Lookup tables — lower-case city names. Add aliases as needed.
var jabodetabekCities = map[string]bool{
	"jakarta": true, "jakarta pusat": true, "jakarta selatan": true,
	"jakarta utara": true, "jakarta timur": true, "jakarta barat": true,
	"bogor": true, "depok": true, "tangerang": true, "tangerang selatan": true,
	"bekasi": true, "bekasi kota": true,
}

var jawaCities = map[string]bool{
	"bandung": true, "bandung barat": true, "cimahi": true,
	"yogyakarta": true, "jogja": true, "sleman": true, "bantul": true,
	"semarang": true, "solo": true, "surakarta": true,
	"surabaya": true, "malang": true, "kediri": true,
	"cirebon": true, "tegal": true, "magelang": true,
}

// detectZone classifies a city string into a zone. Heuristic & forgiving:
// case-insensitive, trims trailing "kota"/"kabupaten" prefixes.
func detectZone(buyerCity, sellerCity string) Zone {
	bc := normalize(buyerCity)
	sc := normalize(sellerCity)
	if bc == "" {
		return ZoneJawa // safe default
	}
	if sc != "" && bc == sc {
		return ZoneSameCity
	}
	if jabodetabekCities[bc] {
		return ZoneJabodetabek
	}
	if jawaCities[bc] {
		return ZoneJawa
	}
	return ZoneLuarJawa
}

func normalize(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.TrimPrefix(s, "kota ")
	s = strings.TrimPrefix(s, "kabupaten ")
	s = strings.TrimPrefix(s, "kab. ")
	s = strings.TrimPrefix(s, "kab ")
	return s
}

type CourierTariff struct {
	Service       string
	BasePerKgRpah map[Zone]int64 // rupiah per kg
	MinChargeRpah int64
	ETA           string
}

// Tariff config — per-kg rates inspired by typical Indonesian courier prices.
// Real values fluctuate, but these are realistic enough for MVP.
var tariffs = map[string][]CourierTariff{
	"jne": {
		{
			Service: "REG",
			BasePerKgRpah: map[Zone]int64{
				ZoneSameCity:    9000,
				ZoneJabodetabek: 12000,
				ZoneJawa:        18000,
				ZoneLuarJawa:    32000,
			},
			MinChargeRpah: 9000,
			ETA:           "2–3 hari",
		},
		{
			Service: "YES",
			BasePerKgRpah: map[Zone]int64{
				ZoneSameCity:    16000,
				ZoneJabodetabek: 22000,
				ZoneJawa:        29000,
				ZoneLuarJawa:    49000,
			},
			MinChargeRpah: 16000,
			ETA:           "1 hari",
		},
	},
	"jnt": {
		{
			Service: "EZ",
			BasePerKgRpah: map[Zone]int64{
				ZoneSameCity:    8000,
				ZoneJabodetabek: 11000,
				ZoneJawa:        17000,
				ZoneLuarJawa:    30000,
			},
			MinChargeRpah: 8000,
			ETA:           "2–4 hari",
		},
	},
	"sicepat": {
		{
			Service: "REG",
			BasePerKgRpah: map[Zone]int64{
				ZoneSameCity:    8500,
				ZoneJabodetabek: 11500,
				ZoneJawa:        17500,
				ZoneLuarJawa:    31000,
			},
			MinChargeRpah: 8500,
			ETA:           "2–3 hari",
		},
	},
	"anteraja": {
		{
			Service: "REG",
			BasePerKgRpah: map[Zone]int64{
				ZoneSameCity:    8500,
				ZoneJabodetabek: 12000,
				ZoneJawa:        18500,
				ZoneLuarJawa:    33000,
			},
			MinChargeRpah: 8500,
			ETA:           "2–4 hari",
		},
	},
	"gosend": {
		{
			Service: "Same Day",
			BasePerKgRpah: map[Zone]int64{
				ZoneSameCity:    18000, // only in same city
			},
			MinChargeRpah: 15000,
			ETA:           "Hari ini",
		},
	},
	"grabexpress": {
		{
			Service: "Same Day",
			BasePerKgRpah: map[Zone]int64{
				ZoneSameCity:    18000,
			},
			MinChargeRpah: 15000,
			ETA:           "Hari ini",
		},
	},
}

type Option struct {
	Courier   string `json:"courier"`
	Code      string `json:"code"`
	Service   string `json:"service"`
	PriceRpah int64  `json:"price_rpah"`
	ETA       string `json:"eta"`
	Zone      string `json:"zone"`
}

// QuoteOptions returns all available courier options for the given lane.
// weightG is total weight in grams. ETAs are descriptive strings.
//
// Pricing rule: ceil(weight_g / 1000) * BasePerKgRpah[zone], floored at
// MinChargeRpah. If a courier has no rate for the zone, it's skipped.
func QuoteOptions(buyerCity, sellerCity string, weightG int) []Option {
	if weightG <= 0 {
		weightG = 250 // default-ish parcel weight
	}
	kg := (weightG + 999) / 1000
	if kg < 1 {
		kg = 1
	}
	zone := detectZone(buyerCity, sellerCity)

	var options []Option
	// Iterate in stable order so UI is consistent
	for _, courier := range []string{"jne", "jnt", "sicepat", "anteraja", "gosend", "grabexpress"} {
		for _, tariff := range tariffs[courier] {
			rate, ok := tariff.BasePerKgRpah[zone]
			if !ok {
				continue
			}
			price := int64(kg) * rate
			if price < tariff.MinChargeRpah {
				price = tariff.MinChargeRpah
			}
			options = append(options, Option{
				Courier:   courierLabel(courier),
				Code:      courier,
				Service:   tariff.Service,
				PriceRpah: price,
				ETA:       tariff.ETA,
				Zone:      string(zone),
			})
		}
	}
	return options
}

func courierLabel(code string) string {
	switch code {
	case "jne":
		return "JNE"
	case "jnt":
		return "J&T Express"
	case "sicepat":
		return "SiCepat"
	case "anteraja":
		return "AnterAja"
	case "gosend":
		return "GoSend"
	case "grabexpress":
		return "GrabExpress"
	}
	return code
}

// Suppress unused-import warning if we add more time-based logic later.
var _ = time.Now
