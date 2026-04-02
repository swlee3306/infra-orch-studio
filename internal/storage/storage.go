package storage

import (
	"context"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

// Store is a minimal persistence interface shared by API and runner.
//
// We keep the interface small to avoid premature abstraction.
type Store interface {
	CreateJob(ctx context.Context, j domain.Job) (domain.Job, error)
	GetJob(ctx context.Context, id string) (domain.Job, error)
	ListJobs(ctx context.Context, limit int) ([]domain.Job, error)
	UpdateJob(ctx context.Context, j domain.Job) (domain.Job, error)
	CreateEnvironment(ctx context.Context, env domain.Environment) (domain.Environment, error)
	GetEnvironment(ctx context.Context, id string) (domain.Environment, error)
	ListEnvironments(ctx context.Context, limit int) ([]domain.Environment, error)
	UpdateEnvironment(ctx context.Context, env domain.Environment) (domain.Environment, error)
	CreateAuditEvent(ctx context.Context, event domain.AuditEvent) (domain.AuditEvent, error)
	ListAuditEvents(ctx context.Context, resourceType, resourceID string, limit int) ([]domain.AuditEvent, error)

	// ClaimNextQueuedJob atomically claims one queued job and transitions it to running.
	// It returns (job, true, nil) when a job was claimed.
	// It returns (domain.Job{}, false, nil) when no queued job exists.
	ClaimNextQueuedJob(ctx context.Context) (domain.Job, bool, error)
}
