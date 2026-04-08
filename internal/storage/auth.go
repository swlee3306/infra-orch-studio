package storage

import (
	"context"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

type AuthStore interface {
	CreateUser(ctx context.Context, user domain.User) (domain.User, error)
	GetUserByEmail(ctx context.Context, email string) (domain.User, error)
	GetUserByID(ctx context.Context, id string) (domain.User, error)
	ListUsers(ctx context.Context, limit int) ([]domain.User, error)
	SetUserDisabled(ctx context.Context, id string, disabled bool) (domain.User, error)
	SetUserPassword(ctx context.Context, id string, passwordHash string) (domain.User, error)
	UpsertAdminUser(ctx context.Context, user domain.User) (domain.User, error)

	CreateSession(ctx context.Context, session domain.Session) (domain.Session, error)
	GetSessionWithUser(ctx context.Context, tokenHash string) (domain.Session, domain.User, error)
	DeleteSessionByTokenHash(ctx context.Context, tokenHash string) error
}
