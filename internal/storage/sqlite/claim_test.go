package sqlite

import (
	"context"
	"testing"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func TestStore_ClaimNextQueuedJob(t *testing.T) {
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer s.Close()

	j1 := domain.Job{ID: "job-1", Type: domain.JobTypeEnvironmentCreate, Status: domain.JobStatusQueued, CreatedAt: time.Now().Add(-2 * time.Second).UTC(), UpdatedAt: time.Now().Add(-2 * time.Second).UTC()}
	j2 := domain.Job{ID: "job-2", Type: domain.JobTypeEnvironmentCreate, Status: domain.JobStatusQueued, CreatedAt: time.Now().Add(-1 * time.Second).UTC(), UpdatedAt: time.Now().Add(-1 * time.Second).UTC()}
	if _, err := s.CreateJob(context.Background(), j1); err != nil {
		t.Fatalf("create j1: %v", err)
	}
	if _, err := s.CreateJob(context.Background(), j2); err != nil {
		t.Fatalf("create j2: %v", err)
	}

	claimed, ok, err := s.ClaimNextQueuedJob(context.Background())
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	if !ok {
		t.Fatalf("expected ok")
	}
	if claimed.ID != "job-1" {
		t.Fatalf("expected job-1, got %s", claimed.ID)
	}
	if claimed.Status != domain.JobStatusRunning {
		t.Fatalf("expected running, got %s", claimed.Status)
	}

	// next claim should get job-2
	claimed2, ok, err := s.ClaimNextQueuedJob(context.Background())
	if err != nil {
		t.Fatalf("claim2: %v", err)
	}
	if !ok {
		t.Fatalf("expected ok for claim2")
	}
	if claimed2.ID != "job-2" {
		t.Fatalf("expected job-2, got %s", claimed2.ID)
	}

	// no more queued jobs
	_, ok, err = s.ClaimNextQueuedJob(context.Background())
	if err != nil {
		t.Fatalf("claim3: %v", err)
	}
	if ok {
		t.Fatalf("expected no job")
	}
}
