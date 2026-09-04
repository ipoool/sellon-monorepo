package repository_test

import (
	"crypto/rand"
	"encoding/hex"
	"time"
)

func randSuffix() string {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func timeNow() time.Time { return time.Now().Add(-time.Second) }
