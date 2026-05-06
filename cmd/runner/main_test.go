package main

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/executor"
)

type fakeRunnerStore struct {
	jobs                  map[string]domain.Job
	envs                  map[string]domain.Environment
	audits                []domain.AuditEvent
	failUpdateEnvironment bool
}

type fakeProviderStore struct {
	items []domain.ProviderConnection
}

func (f fakeProviderStore) ListProviderConnections(context.Context) ([]domain.ProviderConnection, error) {
	return f.items, nil
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

func TestFailJobWritesRunnerErrorLog(t *testing.T) {
	store := newFakeRunnerStore()
	logDir := filepath.Join(t.TempDir(), "logs")
	job := domain.Job{
		ID:        "failed-plan",
		Type:      domain.JobTypePlan,
		Status:    domain.JobStatusRunning,
		LogDir:    logDir,
		UpdatedAt: time.Now().UTC(),
	}

	failJob(store, job, "tofu not found in PATH")

	updated := store.jobs[job.ID]
	if updated.Status != domain.JobStatusFailed {
		t.Fatalf("status = %q, want failed", updated.Status)
	}
	payload, err := os.ReadFile(filepath.Join(logDir, "runner.error.log"))
	if err != nil {
		t.Fatalf("read runner error log: %v", err)
	}
	if !strings.Contains(string(payload), "tofu not found") {
		t.Fatalf("unexpected runner error log: %s", string(payload))
	}
}

func TestPrepareDestroyPlanJobReusesAppliedWorkdir(t *testing.T) {
	store := newFakeRunnerStore()
	store.envs["env-destroy"] = domain.Environment{
		ID:      "env-destroy",
		Workdir: "/tmp/applied-workdir",
	}
	job := domain.Job{
		ID:            "destroy-plan",
		Type:          domain.JobTypePlan,
		Operation:     domain.EnvironmentOperationDestroy,
		EnvironmentID: "env-destroy",
	}

	updated, err := prepareDestroyPlanJob(context.Background(), store, job)
	if err != nil {
		t.Fatalf("prepareDestroyPlanJob: %v", err)
	}
	if updated.Workdir != "/tmp/applied-workdir" {
		t.Fatalf("workdir = %q, want applied workdir", updated.Workdir)
	}
	if updated.LogDir != filepath.Join("/tmp/applied-workdir", ".infra-orch", "logs", "destroy-plan") {
		t.Fatalf("log_dir = %q", updated.LogDir)
	}
	if stored := store.jobs[job.ID]; stored.Workdir != "/tmp/applied-workdir" {
		t.Fatalf("stored workdir = %q, want applied workdir", stored.Workdir)
	}
}

func TestPrepareDestroyPlanJobRequiresAppliedWorkdir(t *testing.T) {
	store := newFakeRunnerStore()
	store.envs["env-destroy"] = domain.Environment{ID: "env-destroy"}
	_, err := prepareDestroyPlanJob(context.Background(), store, domain.Job{
		ID:            "destroy-plan",
		Type:          domain.JobTypePlan,
		Operation:     domain.EnvironmentOperationDestroy,
		EnvironmentID: "env-destroy",
	})
	if err == nil {
		t.Fatalf("expected missing workdir error")
	}
	if !strings.Contains(err.Error(), "existing applied workdir") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestResolveOpenStackProviderExportsCloudsFromProviderStore(t *testing.T) {
	workdirsRoot := t.TempDir()
	cloudName, configPath, err := resolveOpenStackProvider(context.Background(), fakeProviderStore{items: []domain.ProviderConnection{{
		Name:              "demo",
		AuthURL:           "https://openstack.example:5000/v3",
		RegionName:        "RegionOne",
		Interface:         "public",
		IdentityInterface: "public",
		Username:          "demo-user",
		Password:          "demo-pass",
		ProjectName:       "demo-project",
		UserDomainName:    "Default",
		ProjectDomainName: "Default",
	}}}, workdirsRoot, "", "")
	if err != nil {
		t.Fatalf("resolveOpenStackProvider: %v", err)
	}
	if cloudName != "demo" {
		t.Fatalf("cloudName = %q, want demo", cloudName)
	}
	payload, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read generated clouds.yaml: %v", err)
	}
	text := string(payload)
	for _, want := range []string{"clouds:", "demo:", "auth_url: https://openstack.example:5000/v3", "username: demo-user", "password: demo-pass"} {
		if !strings.Contains(text, want) {
			t.Fatalf("generated clouds.yaml missing %q:\n%s", want, text)
		}
	}
	info, err := os.Stat(configPath)
	if err != nil {
		t.Fatalf("stat generated clouds.yaml: %v", err)
	}
	if got := info.Mode().Perm(); got != 0o600 {
		t.Fatalf("clouds.yaml mode = %o, want 600", got)
	}
}

func TestResolveOpenStackProviderKeepsExistingConfigPath(t *testing.T) {
	configPath := filepath.Join(t.TempDir(), "clouds.yaml")
	if err := os.WriteFile(configPath, []byte("clouds: {}\n"), 0o600); err != nil {
		t.Fatalf("write clouds.yaml: %v", err)
	}
	cloudName, gotPath, err := resolveOpenStackProvider(context.Background(), fakeProviderStore{}, t.TempDir(), "existing", configPath)
	if err != nil {
		t.Fatalf("resolveOpenStackProvider: %v", err)
	}
	if cloudName != "existing" || gotPath != configPath {
		t.Fatalf("cloud/path = %q/%q, want existing/%q", cloudName, gotPath, configPath)
	}
}

func TestResolveOpenStackProviderPrefersStoreOverExistingConfigPath(t *testing.T) {
	workdirsRoot := t.TempDir()
	configPath := filepath.Join(t.TempDir(), "clouds.yaml")
	if err := os.WriteFile(configPath, []byte("clouds:\n  stale: {}\n"), 0o600); err != nil {
		t.Fatalf("write clouds.yaml: %v", err)
	}

	cloudName, gotPath, err := resolveOpenStackProvider(context.Background(), fakeProviderStore{items: []domain.ProviderConnection{{
		Name:              "demo",
		AuthURL:           "https://openstack.example:5000/v3",
		Username:          "demo-user",
		Password:          "demo-pass",
		ProjectName:       "demo-project",
		UserDomainName:    "Default",
		ProjectDomainName: "Default",
	}}}, workdirsRoot, "demo", configPath)
	if err != nil {
		t.Fatalf("resolveOpenStackProvider: %v", err)
	}
	if cloudName != "demo" {
		t.Fatalf("cloudName = %q, want demo", cloudName)
	}
	if gotPath == configPath {
		t.Fatalf("got existing config path, want generated provider store clouds.yaml")
	}
	payload, err := os.ReadFile(gotPath)
	if err != nil {
		t.Fatalf("read generated clouds.yaml: %v", err)
	}
	if !strings.Contains(string(payload), "demo-user") {
		t.Fatalf("generated clouds.yaml did not use provider store payload:\n%s", string(payload))
	}
}

func TestConfigureOpenStackEnvRefreshesExecutorAndProcessEnv(t *testing.T) {
	t.Setenv("OS_CLOUD", "stale")
	t.Setenv("OS_CLIENT_CONFIG_FILE", "/tmp/stale-clouds.yaml")

	exec := &executor.CommandExecutor{}
	configureOpenStackEnv(exec, "demo", "/tmp/demo-clouds.yaml")

	if got := exec.Env["OS_CLOUD"]; got != "demo" {
		t.Fatalf("executor OS_CLOUD = %q, want demo", got)
	}
	if got := os.Getenv("OS_CLOUD"); got != "demo" {
		t.Fatalf("process OS_CLOUD = %q, want demo", got)
	}
	if got := exec.Env["OS_CLIENT_CONFIG_FILE"]; got != "/tmp/demo-clouds.yaml" {
		t.Fatalf("executor OS_CLIENT_CONFIG_FILE = %q", got)
	}

	configureOpenStackEnv(exec, "", "")
	if _, ok := exec.Env["OS_CLOUD"]; ok {
		t.Fatalf("executor OS_CLOUD should be unset")
	}
	if got := os.Getenv("OS_CLOUD"); got != "" {
		t.Fatalf("process OS_CLOUD = %q, want empty", got)
	}
	if _, ok := exec.Env["OS_CLIENT_CONFIG_FILE"]; ok {
		t.Fatalf("executor OS_CLIENT_CONFIG_FILE should be unset")
	}
}
