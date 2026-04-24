package mysql

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"strings"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

const providerSecretPrefix = "v1:"

func (s *Store) encodeProviderPassword(password string) (string, error) {
	if password == "" || strings.TrimSpace(s.cfg.ProviderSecretKey) == "" {
		return password, nil
	}
	gcm, err := providerSecretGCM(s.cfg.ProviderSecretKey)
	if err != nil {
		return "", err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", fmt.Errorf("generate provider password nonce: %w", err)
	}
	sealed := gcm.Seal(nil, nonce, []byte(password), nil)
	payload := append(nonce, sealed...)
	return providerSecretPrefix + base64.StdEncoding.EncodeToString(payload), nil
}

func (s *Store) decodeProviderConnection(conn domain.ProviderConnection) (domain.ProviderConnection, error) {
	password, err := s.decodeProviderPassword(conn.Password)
	if err != nil {
		return domain.ProviderConnection{}, err
	}
	conn.Password = password
	return conn, nil
}

func (s *Store) decodeProviderPassword(stored string) (string, error) {
	if !strings.HasPrefix(stored, providerSecretPrefix) {
		return stored, nil
	}
	if strings.TrimSpace(s.cfg.ProviderSecretKey) == "" {
		return "", errors.New("PROVIDER_SECRET_KEY is required to read encrypted provider credentials")
	}
	gcm, err := providerSecretGCM(s.cfg.ProviderSecretKey)
	if err != nil {
		return "", err
	}
	raw, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(stored, providerSecretPrefix))
	if err != nil {
		return "", fmt.Errorf("decode encrypted provider password: %w", err)
	}
	if len(raw) <= gcm.NonceSize() {
		return "", errors.New("encrypted provider password payload is too short")
	}
	nonce := raw[:gcm.NonceSize()]
	ciphertext := raw[gcm.NonceSize():]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt provider password: %w", err)
	}
	return string(plaintext), nil
}

func providerSecretGCM(secret string) (cipher.AEAD, error) {
	secret = strings.TrimSpace(secret)
	if secret == "" {
		return nil, errors.New("provider secret key is empty")
	}
	sum := sha256.Sum256([]byte(secret))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return nil, fmt.Errorf("create provider secret cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, fmt.Errorf("create provider secret gcm: %w", err)
	}
	return gcm, nil
}
