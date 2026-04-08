package main

import (
	"context"
	"database/sql"
	"strings"
	"testing"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

type fakeRunnerStore struct {
	jobs                  map[string]domain.Job
	envs                  map[string]domain.Environment
	audits                []domain.AuditEvent
	failUpdateEnvironment bool
}

func newFakeRunnerStore() *fakeRunnerStore {
	return &fakeRunnerStore{
		jobs: make(map[string]domain.Job),
		envs: make(map[string]domain.Environment),
	}
}

func (f *fakeRunnerStore) UpdateJob(_ context.Context, j domain.Job) (domain.Job, error) {
	f.jobs[j.ID] = j
	return j, nil
}

func (f *fakeRunnerStore) GetEnvironment(_ context.Context, id string) (domain.Environment, error) {
	env, ok := f.envs[id]
	if !ok {
		return domain.Environment{}, sql.ErrNoRows
	}
	return env, nil
}

func (f *fakeRunnerStore) UpdateEnvironment(_ context.Context, env domain.Environment) (domain.Environment, error) {
	if f.failUpdateEnvironment {
		return domain.Environment{}, sql.ErrNoRows
	}
	f.envs[env.ID] = env
	return env, nil
}

func (f *fakeRunnerStore) CreateAuditEvent(_ context.Context, event domain.AuditEvent) (domain.AuditEvent, error) {
	f.audits = append(f.audits, event)
	return event, nil
}

func TestRecordRunnerEnvironmentSuccessIgnoresStaleJob(t *testing.T) {
	store := newFakeRunnerStore()
	now := time.Now().UTC()
	store.envs["env-1"] = domain.Environment{
		ID:             "env-1",
		Status:         domain.EnvironmentStatusApplying,
		ApprovalStatus: domain.ApprovalStatusApproved,
		LastJobID:      "latest-job",
		UpdatedAt:      now,
	}

	recordRunnerEnvironmentSuccess(store, domain.Job{
		ID:            "stale-job",
		Type:          domain.JobTypeApply,
		Status:        domain.JobStatusDone,
		EnvironmentID: "env-1",
		Operation:     domain.EnvironmentOperationUpdate,
		Workdir:       "/tmp/workdir",
		PlanPath:      ".infra-orch/plan/plan.bin",
		UpdatedAt:     now,
	})

	updated := store.envs["env-1"]
	if updated.LastJobID != "latest-job" {
		t.Fatalf("last_job_id = %q, want latest-job", updated.LastJobID)
	}
	if updated.Status != domain.EnvironmentStatusApplying {
		t.Fatalf("status = %q, want applying", updated.Status)
	}
	foundIgnoredAudit := false
	for _, item := range store.audits {
		if item.Action == "job.succeeded_ignored" {
			foundIgnoredAudit = true
			break
		}
	}
	if !foundIgnoredAudit {
		t.Fatalf("expected job.succeeded_ignored audit event")
	}
}

func TestFailJobIgnoresStaleJob(t *testing.T) {
	store := newFakeRunnerStore()
	now := time.Now().UTC()
	store.envs["env-2"] = domain.Environment{
		ID:             "env-2",
		Status:         domain.EnvironmentStatusApplying,
		ApprovalStatus: domain.ApprovalStatusApproved,
		LastJobID:      "latest-job",
		UpdatedAt:      now,
	}

	failJob(store, domain.Job{
		ID:            "stale-job",
		Type:          domain.JobTypeApply,
		Status:        domain.JobStatusRunning,
		EnvironmentID: "env-2",
	}, "executor failed")

	updated := store.envs["env-2"]
	if updated.Status != domain.EnvironmentStatusApplying {
		t.Fatalf("status = %q, want applying", updated.Status)
	}
	if updated.LastError != "" {
		t.Fatalf("last_error = %q, want empty", updated.LastError)
	}
	foundIgnoredAudit := false
	for _, item := range store.audits {
		if item.Action == "job.failed_ignored" {
			foundIgnoredAudit = true
			break
		}
	}
	if !foundIgnoredAudit {
		t.Fatalf("expected job.failed_ignored audit event")
	}
}

func TestRecordRunnerEnvironmentSuccessUpdatesCurrentJob(t *testing.T) {
	store := newFakeRunnerStore()
	now := time.Now().UTC()
	store.envs["env-3"] = domain.Environment{
		ID:             "env-3",
		Status:         domain.EnvironmentStatusApplying,
		ApprovalStatus: domain.ApprovalStatusApproved,
		LastJobID:      "apply-job",
		UpdatedAt:      now,
	}

	recordRunnerEnvironmentSuccess(store, domain.Job{
		ID:            "apply-job",
		Type:          domain.JobTypeApply,
		Status:        domain.JobStatusDone,
		EnvironmentID: "env-3",
		Operation:     domain.EnvironmentOperationUpdate,
		Workdir:       "/tmp/workdir",
		PlanPath:      ".infra-orch/plan/plan.bin",
		OutputsJSON:   `{"ok":true}`,
	})

	updated := store.envs["env-3"]
	if updated.Status != domain.EnvironmentStatusActive {
		t.Fatalf("status = %q, want active", updated.Status)
	}
	if updated.LastJobID != "apply-job" {
		t.Fatalf("last_job_id = %q, want apply-job", updated.LastJobID)
	}
	if updated.OutputsJSON == "" {
		t.Fatalf("outputs_json should be set")
	}
}

func TestRecordRunnerEnvironmentSuccessRecordsConflictAudit(t *testing.T) {
	store := newFakeRunnerStore()
	store.failUpdateEnvironment = true
	now := time.Now().UTC()
	store.envs["env-4"] = domain.Environment{
		ID:             "env-4",
		Status:         domain.EnvironmentStatusApplying,
		ApprovalStatus: domain.ApprovalStatusApproved,
		LastJobID:      "apply-job",
		Revision:       9,
		UpdatedAt:      now,
	}

	recordRunnerEnvironmentSuccess(store, domain.Job{
		ID:            "apply-job",
		Type:          domain.JobTypeApply,
		Status:        domain.JobStatusDone,
		EnvironmentID: "env-4",
		Operation:     domain.EnvironmentOperationUpdate,
		Workdir:       "/tmp/workdir",
		PlanPath:      ".infra-orch/plan/plan.bin",
	})

	found := false
	for _, item := range store.audits {
		if item.Action != "job.succeeded_conflict" {
			continue
		}
		found = true
		if !strings.Contains(item.MetadataJSON, "attempted_revision") {
			t.Fatalf("conflict metadata missing attempted_revision: %s", item.MetadataJSON)
		}
		if !strings.Contains(item.MetadataJSON, "current_revision") {
			t.Fatalf("conflict metadata missing current_revision: %s", item.MetadataJSON)
		}
	}
	if !found {
		t.Fatalf("expected job.succeeded_conflict audit event")
	}
}

func TestFailJobRecordsConflictAudit(t *testing.T) {
	store := newFakeRunnerStore()
	store.failUpdateEnvironment = true
	now := time.Now().UTC()
	store.envs["env-5"] = domain.Environment{
		ID:             "env-5",
		Status:         domain.EnvironmentStatusApplying,
		ApprovalStatus: domain.ApprovalStatusApproved,
		LastJobID:      "apply-job",
		Revision:       4,
		UpdatedAt:      now,
	}

	failJob(store, domain.Job{
		ID:            "apply-job",
		Type:          domain.JobTypeApply,
		Status:        domain.JobStatusRunning,
		EnvironmentID: "env-5",
		Operation:     domain.EnvironmentOperationUpdate,
	}, "executor failed")

	found := false
	for _, item := range store.audits {
		if item.Action != "job.failed_conflict" {
			continue
		}
		found = true
		if !strings.Contains(item.MetadataJSON, "attempted_revision") {
			t.Fatalf("conflict metadata missing attempted_revision: %s", item.MetadataJSON)
		}
		if !strings.Contains(item.MetadataJSON, "current_last_job") {
			t.Fatalf("conflict metadata missing current_last_job: %s", item.MetadataJSON)
		}
	}
	if !found {
		t.Fatalf("expected job.failed_conflict audit event")
	}
}
