package main

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func TestEnsureAdminSeedSkipsWhenUnset(t *testing.T) {
	store := newBootstrapAuthStore()
	user, seeded, err := ensureAdminSeed(context.Background(), store, "", "", time.Now().UTC())
	if err != nil {
		t.Fatalf("ensure admin seed: %v", err)
	}
	if seeded {
		t.Fatalf("seeded = true, want false")
	}
	if user.ID != "" {
		t.Fatalf("user = %+v, want zero value", user)
	}
}

func TestEnsureAdminSeedRequiresBothValues(t *testing.T) {
	store := newBootstrapAuthStore()
	_, _, err := ensureAdminSeed(context.Background(), store, "admin@example.com", "", time.Now().UTC())
	if err == nil || !strings.Contains(err.Error(), "must be set together") {
		t.Fatalf("err = %v, want missing pair error", err)
	}
}

func TestEnsureAdminSeedUpsertsAdminUser(t *testing.T) {
	store := newBootstrapAuthStore()
	now := time.Now().UTC()

	user, seeded, err := ensureAdminSeed(context.Background(), store, "Admin@Example.com", "change-me", now)
	if err != nil {
		t.Fatalf("ensure admin seed: %v", err)
	}
	if !seeded {
		t.Fatalf("seeded = false, want true")
	}
	if !user.IsAdmin {
		t.Fatalf("is_admin = false, want true")
	}
	if user.Email != "admin@example.com" {
		t.Fatalf("email = %q, want admin@example.com", user.Email)
	}

	stored, err := store.GetUserByEmail(context.Background(), "admin@example.com")
	if err != nil {
		t.Fatalf("get user by email: %v", err)
	}
	if !stored.IsAdmin {
		t.Fatalf("stored user is_admin = false, want true")
	}
	if stored.PasswordHash == "" {
		t.Fatalf("stored password hash is empty")
	}
}

type bootstrapAuthStore struct {
	users map[string]domain.User
}

func newBootstrapAuthStore() *bootstrapAuthStore {
	return &bootstrapAuthStore{users: map[string]domain.User{}}
}

func (s *bootstrapAuthStore) CreateUser(context.Context, domain.User) (domain.User, error) {
	panic("unexpected CreateUser call")
}

func (s *bootstrapAuthStore) GetUserByEmail(_ context.Context, email string) (domain.User, error) {
	user, ok := s.users[strings.ToLower(email)]
	if !ok {
		return domain.User{}, sql.ErrNoRows
	}
	return user, nil
}

func (s *bootstrapAuthStore) GetUserByID(_ context.Context, id string) (domain.User, error) {
	for _, user := range s.users {
		if user.ID == id {
			return user, nil
		}
	}
	return domain.User{}, sql.ErrNoRows
}

func (s *bootstrapAuthStore) ListUsers(_ context.Context, limit int) ([]domain.User, error) {
	items := make([]domain.User, 0, len(s.users))
	for _, user := range s.users {
		items = append(items, user)
	}
	if limit > 0 && len(items) > limit {
		items = items[:limit]
	}
	return items, nil
}

func (s *bootstrapAuthStore) SetUserDisabled(_ context.Context, id string, disabled bool) (domain.User, error) {
	for email, user := range s.users {
		if user.ID == id {
			user.Disabled = disabled
			s.users[email] = user
			return user, nil
		}
	}
	return domain.User{}, sql.ErrNoRows
}

func (s *bootstrapAuthStore) SetUserPassword(_ context.Context, id string, passwordHash string) (domain.User, error) {
	for email, user := range s.users {
		if user.ID == id {
			user.PasswordHash = passwordHash
			s.users[email] = user
			return user, nil
		}
	}
	return domain.User{}, sql.ErrNoRows
}

func (s *bootstrapAuthStore) UpsertAdminUser(_ context.Context, user domain.User) (domain.User, error) {
	user.Email = strings.ToLower(user.Email)
	user.IsAdmin = true
	if existing, ok := s.users[user.Email]; ok {
		user.ID = existing.ID
	}
	if user.ID == "" {
		user.ID = uuid.NewString()
	}
	s.users[user.Email] = user
	return user, nil
}

func (s *bootstrapAuthStore) CreateSession(context.Context, domain.Session) (domain.Session, error) {
	panic("unexpected CreateSession call")
}

func (s *bootstrapAuthStore) GetSessionWithUser(context.Context, string) (domain.Session, domain.User, error) {
	panic("unexpected GetSessionWithUser call")
}

func (s *bootstrapAuthStore) DeleteSessionByTokenHash(context.Context, string) error {
	panic("unexpected DeleteSessionByTokenHash call")
}
