package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"io"
)

// AESEncryptor uses AES-GCM with a key derived from JWT_SECRET via SHA-256.
// Reusing the secret keeps env minimal; rotate JWT_SECRET to rotate cipher key.
type AESEncryptor struct {
	gcm cipher.AEAD
}

func NewAESEncryptor(secret string) (*AESEncryptor, error) {
	if secret == "" {
		return nil, errors.New("encryption secret is empty")
	}
	keyHash := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(keyHash[:])
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &AESEncryptor{gcm: gcm}, nil
}

// Encrypt prepends a fresh nonce to the ciphertext, returns the combined blob.
func (e *AESEncryptor) Encrypt(plaintext []byte) ([]byte, error) {
	nonce := make([]byte, e.gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return e.gcm.Seal(nonce, nonce, plaintext, nil), nil
}

func (e *AESEncryptor) Decrypt(blob []byte) ([]byte, error) {
	ns := e.gcm.NonceSize()
	if len(blob) < ns {
		return nil, errors.New("ciphertext too short")
	}
	nonce, ct := blob[:ns], blob[ns:]
	return e.gcm.Open(nil, nonce, ct, nil)
}
