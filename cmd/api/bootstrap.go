package main

import (
	"context"
	"errors"
	"net/mail"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/security"
	"github.com/swlee3306/infra-orch-studio/internal/storage"
)

func ensureAdminSeed(ctx context.Context, authStore storage.AuthStore, email, password string, now time.Time) (domain.User, bool, error) {
	email = strings.TrimSpace(email)
	password = strings.TrimSpace(password)
	if email == "" && password == "" {
		return domain.User{}, false, nil
	}
	if email == "" || password == "" {
		return domain.User{}, false, errors.New("ADMIN_EMAIL and ADMIN_PASSWORD must be set together")
	}

	normalized, err := normalizeBootstrapEmail(email)
	if err != nil {
		return domain.User{}, false, err
	}
	hash, err := security.HashPassword(password)
	if err != nil {
		return domain.User{}, false, err
	}

	user, err := authStore.UpsertAdminUser(ctx, domain.User{
		ID:           uuid.NewString(),
		Email:        normalized,
		IsAdmin:      true,
		PasswordHash: hash,
		CreatedAt:    now,
		UpdatedAt:    now,
	})
	if err != nil {
		return domain.User{}, false, err
	}
	return user, true, nil
}

func normalizeBootstrapEmail(email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return "", errors.New("admin email is required")
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return "", errors.New("invalid admin email")
	}
	return email, nil
}
