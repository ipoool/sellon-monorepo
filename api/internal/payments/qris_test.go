package payments

import (
	"testing"
	"time"
)

// Captured shape of a Midtrans Core API qris charge response. Field names and
// nesting are what the decoder must survive; the values are illustrative.
const qrisChargeFixture = `{
  "status_code": "201",
  "status_message": "QRIS transaction is created",
  "transaction_id": "a1b2c3d4-0000-4444-8888-aabbccddeeff",
  "order_id": "PB-JKT01-261016-a9f3k2",
  "gross_amount": "25000.00",
  "currency": "IDR",
  "payment_type": "qris",
  "transaction_time": "2026-10-16 14:22:01",
  "transaction_status": "pending",
  "fraud_status": "accept",
  "acquirer": "gopay",
  "qr_string": "00020101021226610014COM.GO-JEK.WWW01189360091400000000000215000000000000303UMI",
  "expiry_time": "2026-10-16 14:32:01",
  "actions": [
    {"name": "generate-qr-code", "method": "GET", "url": "https://api.midtrans.com/v2/qris/abc/qr-code"},
    {"name": "deeplink-redirect", "method": "GET", "url": "https://sim.gopay/x"}
  ]
}`

func TestQRISChargeResponseDecode(t *testing.T) {
	out := decodeQRIS(t, qrisChargeFixture)

	if out.StatusCode != "201" {
		t.Fatalf("status_code = %q, want 201", out.StatusCode)
	}
	if out.TransactionStatus != "pending" {
		t.Errorf("transaction_status = %q, want pending", out.TransactionStatus)
	}
	if out.QRString == "" {
		t.Error("qr_string empty — the booth renders the QR from this")
	}
	if got := out.QRCodeURL(); got != "https://api.midtrans.com/v2/qris/abc/qr-code" {
		t.Errorf("QRCodeURL() = %q, want the generate-qr-code action", got)
	}

	// A pending QRIS charge must not read as paid anywhere downstream.
	if mapped := MapTransactionStatus(out.TransactionStatus, out.FraudStatus); mapped != "pending" {
		t.Errorf("MapTransactionStatus = %q, want pending", mapped)
	}
}

func TestQRISParsedExpiryIsJakarta(t *testing.T) {
	out := decodeQRIS(t, qrisChargeFixture)

	exp, ok := out.ParsedExpiry()
	if !ok {
		t.Fatal("ParsedExpiry() reported false for a well-formed expiry_time")
	}
	// 14:32:01 WIB is 07:32:01 UTC. Reading the zone-less string as UTC would
	// put the QR's deadline seven hours early and expire it on arrival.
	want := time.Date(2026, 10, 16, 7, 32, 1, 0, time.UTC)
	if !exp.UTC().Equal(want) {
		t.Errorf("expiry = %s, want %s", exp.UTC(), want)
	}
}

func TestQRISParsedExpiryMissing(t *testing.T) {
	var r QRISChargeResponse
	if _, ok := r.ParsedExpiry(); ok {
		t.Error("empty expiry_time must report false, not the zero time")
	}
	r.ExpiryTime = "not a timestamp"
	if _, ok := r.ParsedExpiry(); ok {
		t.Error("unparseable expiry_time must report false")
	}
}

func TestQRCodeURLAbsent(t *testing.T) {
	r := QRISChargeResponse{Actions: []QRISAction{{Name: "deeplink-redirect", URL: "https://x"}}}
	if got := r.QRCodeURL(); got != "" {
		t.Errorf("QRCodeURL() = %q, want empty when no generate-qr-code action", got)
	}
}

func TestChargeQRISRejectsEmptyServerKey(t *testing.T) {
	c := NewMidtransClient()
	if _, err := c.ChargeQRIS(QRISChargeInput{OrderID: "PB-X"}); err == nil {
		t.Error("expected an error when the server key is empty, got nil")
	}
	if _, err := c.GetTransactionStatus("PB-X", ""); err == nil {
		t.Error("expected an error when the server key is empty, got nil")
	}
}

func decodeQRIS(t *testing.T, raw string) *QRISChargeResponse {
	t.Helper()
	var out QRISChargeResponse
	if err := jsonUnmarshalStrict(raw, &out); err != nil {
		t.Fatalf("decode: %v", err)
	}
	return &out
}
