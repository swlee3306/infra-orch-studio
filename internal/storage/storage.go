package storage

import (
	"context"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

// Store is a minimal persistence interface shared by API and runner.
//
// MVP note: implementation will start as sqlite (preferred) in Phase 2.
// We keep the interface small to avoid premature abstraction.
type Store interface {
	CreateJob(ctx context.Context, j domain.Job) (domain.Job, error)
	GetJob(ctx context.Context, id string) (domain.Job, error)
	ListJobs(ctx context.Context, limit int) ([]domain.Job, error)
	UpdateJob(ctx context.Context, j domain.Job) (domain.Job, error)
}
