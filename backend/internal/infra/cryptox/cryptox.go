// Package cryptox provides low-level crypto primitives used by the session
// envelope and card-code / refresh-token hashing. Keys are injected from the
// environment; never logged.
package cryptox

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
)

// Cipher is an AES-256-GCM AEAD with random per-seal nonces.
type Cipher struct {
	aead cipher.AEAD
}

// NewCipherFromHexKey builds a Cipher from a 32-byte hex-encoded key.
func NewCipherFromHexKey(hexKey string) (*Cipher, error) {
	key, err := hex.DecodeString(hexKey)
	if err != nil {
		return nil, fmt.Errorf("cryptox: invalid SESSION_MASTER_KEY hex: %w", err)
	}
	if len(key) != 32 {
		return nil, errors.New("cryptox: SESSION_MASTER_KEY must be 32 bytes (64 hex chars)")
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Cipher{aead: aead}, nil
}

// Seal encrypts plaintext with a random nonce prepended to the ciphertext.
func (c *Cipher) Seal(plaintext, aad []byte) ([]byte, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, err
	}
	return c.aead.Seal(nonce, nonce, plaintext, aad), nil
}

// Open decrypts output produced by Seal.
func (c *Cipher) Open(ciphertext, aad []byte) ([]byte, error) {
	if len(ciphertext) < c.aead.NonceSize() {
		return nil, errors.New("cryptox: ciphertext too short")
	}
	nonce, ct := ciphertext[:c.aead.NonceSize()], ciphertext[c.aead.NonceSize():]
	pt, err := c.aead.Open(nil, nonce, ct, aad)
	if err != nil {
		return nil, fmt.Errorf("cryptox: open failed: %w", err)
	}
	return pt, nil
}

// HMACSHA256 returns a keyed SHA-256 MAC.
func HMACSHA256(key, data []byte) []byte {
	mac := hmac.New(sha256.New, key)
	mac.Write(data)
	return mac.Sum(nil)
}

// RandomBytes returns n cryptographically secure random bytes.
func RandomBytes(n int) ([]byte, error) {
	b := make([]byte, n)
	if _, err := io.ReadFull(rand.Reader, b); err != nil {
		return nil, err
	}
	return b, nil
}

// HexFingerprint returns the first n hex characters of data (for logs/UIs).
func HexFingerprint(data []byte, n int) string {
	if n <= 0 {
		return ""
	}
	s := hex.EncodeToString(data)
	if len(s) < n {
		return s
	}
	return s[:n]
}