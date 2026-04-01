package security

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

const (
	minPasswordLength = 8
	passwordCost      = 12
)

func HashPassword(password string) (string, error) {
	password = strings.TrimSpace(password)
	if len(password) < minPasswordLength {
		return "", fmt.Errorf("password must be at least %d characters", minPasswordLength)
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), passwordCost)
	if err != nil {
		return "", fmt.Errorf("hash password: %w", err)
	}
	return string(hash), nil
}

func ComparePassword(hash, password string) error {
	if hash == "" {
		return errors.New("empty password hash")
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
}

func NewSessionToken() (raw string, tokenHash string, err error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", "", fmt.Errorf("read random: %w", err)
	}
	raw = hex.EncodeToString(buf)
	return raw, HashToken(raw), nil
}

func HashToken(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
