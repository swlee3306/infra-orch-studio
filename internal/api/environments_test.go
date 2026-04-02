package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func TestEnvironmentLifecycleApprovalAndAudit(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)
	sessionCookie := cookieFromToken("admin-session-token", srv.cookieName)

	createReq := httptest.NewRequest(http.MethodPost, "/api/environments", strings.NewReader(`{
		"spec": {
			"environment_name": "prod-a",
			"tenant_name": "tenant-a",
			"network": {"name": "net-a", "cidr": "10.0.0.0/24"},
			"subnet": {"name": "sub-a", "cidr": "10.0.0.0/24", "enable_dhcp": true},
			"instances": [{"name": "vm-a", "image": "ubuntu", "flavor": "small", "count": 1}]
		}
	}`))
	createReq.AddCookie(sessionCookie)
	createRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(createRR, createReq)
	if createRR.Code != http.StatusCreated {
		t.Fatalf("create environment status = %d, want %d", createRR.Code, http.StatusCreated)
	}

	var createResp struct {
		Environment domain.Environment `json:"environment"`
		Job         domain.Job         `json:"job"`
	}
	if err := json.Unmarshal(createRR.Body.Bytes(), &createResp); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if createResp.Environment.Status != domain.EnvironmentStatusPlanning {
		t.Fatalf("environment status = %s, want %s", createResp.Environment.Status, domain.EnvironmentStatusPlanning)
	}
	if createResp.Job.EnvironmentID != createResp.Environment.ID {
		t.Fatalf("job environment_id = %q, want %q", createResp.Job.EnvironmentID, createResp.Environment.ID)
	}

	planJob := createResp.Job
	planJob.Status = domain.JobStatusDone
	planJob.Workdir = "/tmp/workdir"
	planJob.PlanPath = ".infra-orch/plan/plan.bin"
	planJob.UpdatedAt = time.Now().UTC()
	if _, err := store.UpdateJob(nil, planJob); err != nil {
		t.Fatalf("update plan job: %v", err)
	}

	env := createResp.Environment
	env.Status = domain.EnvironmentStatusPendingApproval
	env.ApprovalStatus = domain.ApprovalStatusPending
	env.LastPlanJobID = planJob.ID
	env.LastJobID = planJob.ID
	env.Workdir = planJob.Workdir
	env.PlanPath = planJob.PlanPath
	env.UpdatedAt = time.Now().UTC()
	if _, err := store.UpdateEnvironment(nil, env); err != nil {
		t.Fatalf("update environment: %v", err)
	}

	approveReq := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/approve", nil)
	approveReq.AddCookie(sessionCookie)
	approveRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(approveRR, approveReq)
	if approveRR.Code != http.StatusOK {
		t.Fatalf("approve status = %d, want %d", approveRR.Code, http.StatusOK)
	}

	applyReq := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/apply", nil)
	applyReq.AddCookie(sessionCookie)
	applyRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(applyRR, applyReq)
	if applyRR.Code != http.StatusCreated {
		t.Fatalf("apply status = %d, want %d", applyRR.Code, http.StatusCreated)
	}

	var applyResp struct {
		Environment domain.Environment `json:"environment"`
		Job         domain.Job         `json:"job"`
	}
	if err := json.Unmarshal(applyRR.Body.Bytes(), &applyResp); err != nil {
		t.Fatalf("decode apply response: %v", err)
	}
	if applyResp.Job.Type != domain.JobTypeApply {
		t.Fatalf("apply job type = %s, want %s", applyResp.Job.Type, domain.JobTypeApply)
	}

	auditReq := httptest.NewRequest(http.MethodGet, "/api/environments/"+env.ID+"/audit", nil)
	auditReq.AddCookie(sessionCookie)
	auditRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(auditRR, auditReq)
	if auditRR.Code != http.StatusOK {
		t.Fatalf("audit status = %d, want %d", auditRR.Code, http.StatusOK)
	}
	var auditResp struct {
		Items []domain.AuditEvent `json:"items"`
	}
	if err := json.Unmarshal(auditRR.Body.Bytes(), &auditResp); err != nil {
		t.Fatalf("decode audit response: %v", err)
	}
	if len(auditResp.Items) < 3 {
		t.Fatalf("audit events = %d, want >= 3", len(auditResp.Items))
	}
}

func TestEnvironmentRetryBudget(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)
	sessionCookie := cookieFromToken("admin-session-token", srv.cookieName)

	now := time.Now().UTC()
	env := domain.Environment{
		ID:             uuid.NewString(),
		Name:           "env-retry",
		Status:         domain.EnvironmentStatusFailed,
		Operation:      domain.EnvironmentOperationUpdate,
		ApprovalStatus: domain.ApprovalStatusNotRequested,
		Spec: domain.EnvironmentSpec{
			EnvironmentName: "env-retry",
			TenantName:      "tenant-a",
			Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
			Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24", EnableDHCP: true},
			Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
		},
		LastJobID:  uuid.NewString(),
		RetryCount: 0,
		MaxRetries: 1,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if _, err := store.CreateEnvironment(nil, env); err != nil {
		t.Fatalf("create environment: %v", err)
	}
	job := domain.Job{
		ID:            env.LastJobID,
		Type:          domain.JobTypePlan,
		Status:        domain.JobStatusFailed,
		CreatedAt:     now,
		UpdatedAt:     now,
		EnvironmentID: env.ID,
		Operation:     env.Operation,
		Environment:   env.Spec,
		MaxRetries:    env.MaxRetries,
		RetryCount:    0,
	}
	if _, err := store.CreateJob(nil, job); err != nil {
		t.Fatalf("create job: %v", err)
	}

	retryReq := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/retry", nil)
	retryReq.AddCookie(sessionCookie)
	retryRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(retryRR, retryReq)
	if retryRR.Code != http.StatusCreated {
		t.Fatalf("retry status = %d, want %d", retryRR.Code, http.StatusCreated)
	}

	retryReq2 := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/retry", nil)
	retryReq2.AddCookie(sessionCookie)
	retryRR2 := httptest.NewRecorder()
	srv.mux.ServeHTTP(retryRR2, retryReq2)
	if retryRR2.Code != http.StatusBadRequest {
		t.Fatalf("retry exhausted status = %d, want %d", retryRR2.Code, http.StatusBadRequest)
	}
}
