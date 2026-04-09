package storage

import (
	"context"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

type ProviderStore interface {
	ListProviderConnections(ctx context.Context) ([]domain.ProviderConnection, error)
	GetProviderConnection(ctx context.Context, name string) (domain.ProviderConnection, error)
	UpsertProviderConnection(ctx context.Context, conn domain.ProviderConnection) (domain.ProviderConnection, error)
}
