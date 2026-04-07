package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
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

	approveReq := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/approve", strings.NewReader(`{"comment":"approved after CAB review"}`))
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
	foundApprovalComment := false
	for _, item := range auditResp.Items {
		if item.Action == "environment.approved" && strings.Contains(item.MetadataJSON, "CAB review") {
			foundApprovalComment = true
			break
		}
	}
	if !foundApprovalComment {
		t.Fatalf("approval audit metadata missing comment: %+v", auditResp.Items)
	}
}

func TestRequestDraftsReturnsStructuredEnvironmentDraft(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)

	req := httptest.NewRequest(http.MethodPost, "/api/request-drafts", strings.NewReader(`{
		"prompt": "create a production environment named payments-api for tenant finops with 3 instances, ubuntu, medium flavor, web and db access, network 10.44.0.0/24 and subnet 10.44.0.0/26"
	}`))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusOK)
	}

	var resp struct {
		TemplateName   string                 `json:"template_name"`
		Spec           domain.EnvironmentSpec `json:"spec"`
		Assumptions    []string               `json:"assumptions"`
		Warnings       []string               `json:"warnings"`
		RequiresReview bool                   `json:"requires_review"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if resp.TemplateName != "basic" {
		t.Fatalf("template = %q, want basic", resp.TemplateName)
	}
	if resp.Spec.EnvironmentName != "payments-api" {
		t.Fatalf("environment name = %q", resp.Spec.EnvironmentName)
	}
	if resp.Spec.TenantName != "finops" {
		t.Fatalf("tenant = %q", resp.Spec.TenantName)
	}
	if resp.Spec.Instances[0].Count != 3 {
		t.Fatalf("instance count = %d, want 3", resp.Spec.Instances[0].Count)
	}
	if resp.Spec.Network.CIDR != "10.44.0.0/24" || resp.Spec.Subnet.CIDR != "10.44.0.0/26" {
		t.Fatalf("cidrs = %s / %s", resp.Spec.Network.CIDR, resp.Spec.Subnet.CIDR)
	}
	if !resp.RequiresReview {
		t.Fatalf("requires_review = false, want true")
	}
	if len(resp.Assumptions) == 0 {
		t.Fatalf("expected assumptions")
	}
	if len(resp.Warnings) == 0 {
		t.Fatalf("expected warnings for production-like request")
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

func TestEnvironmentDestroyRequiresAdminAndConfirmationName(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	operator := mustUser(t, "operator@example.com", false, "password123")
	seedSession(store, admin, "admin-session-token")
	seedSession(store, operator, "operator-session-token")
	srv := newTestServer(store)

	now := time.Now().UTC()
	env := domain.Environment{
		ID:             uuid.NewString(),
		Name:           "env-destroy",
		Status:         domain.EnvironmentStatusActive,
		Operation:      domain.EnvironmentOperationUpdate,
		ApprovalStatus: domain.ApprovalStatusNotRequested,
		Spec: domain.EnvironmentSpec{
			EnvironmentName: "env-destroy",
			TenantName:      "tenant-a",
			Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
			Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24", EnableDHCP: true},
			Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
		},
		MaxRetries: 3,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if _, err := store.CreateEnvironment(nil, env); err != nil {
		t.Fatalf("create environment: %v", err)
	}

	operatorReq := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/destroy", strings.NewReader(`{"confirmation_name":"env-destroy"}`))
	operatorReq.AddCookie(cookieFromToken("operator-session-token", srv.cookieName))
	operatorRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(operatorRR, operatorReq)
	if operatorRR.Code != http.StatusForbidden {
		t.Fatalf("operator destroy status = %d, want %d", operatorRR.Code, http.StatusForbidden)
	}

	badReq := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/destroy", strings.NewReader(`{"confirmation_name":"wrong-name"}`))
	badReq.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	badRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(badRR, badReq)
	if badRR.Code != http.StatusBadRequest {
		t.Fatalf("bad confirmation status = %d, want %d", badRR.Code, http.StatusBadRequest)
	}

	okReq := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/destroy", strings.NewReader(`{"confirmation_name":"env-destroy","comment":"sunset request CHG-42"}`))
	okReq.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	okRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(okRR, okReq)
	if okRR.Code != http.StatusCreated {
		t.Fatalf("destroy status = %d, want %d", okRR.Code, http.StatusCreated)
	}

	audits, err := store.ListAuditEvents(nil, "environment", env.ID, 10)
	if err != nil {
		t.Fatalf("list audit events: %v", err)
	}
	if len(audits) == 0 || !strings.Contains(audits[0].MetadataJSON, "CHG-42") {
		t.Fatalf("expected destroy audit metadata to include comment, got %+v", audits)
	}
}

func TestEnvironmentPlanRejectsDestroyOperationForNonAdmin(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	operator := mustUser(t, "operator@example.com", false, "password123")
	seedSession(store, admin, "admin-session-token")
	seedSession(store, operator, "operator-session-token")
	srv := newTestServer(store)

	now := time.Now().UTC()
	env := domain.Environment{
		ID:             uuid.NewString(),
		Name:           "env-plan-destroy",
		Status:         domain.EnvironmentStatusActive,
		Operation:      domain.EnvironmentOperationUpdate,
		ApprovalStatus: domain.ApprovalStatusNotRequested,
		Spec: domain.EnvironmentSpec{
			EnvironmentName: "env-plan-destroy",
			TenantName:      "tenant-a",
			Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
			Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24", EnableDHCP: true},
			Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
		},
		MaxRetries: 3,
		CreatedAt:  now,
		UpdatedAt:  now,
	}
	if _, err := store.CreateEnvironment(nil, env); err != nil {
		t.Fatalf("create environment: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/plan", strings.NewReader(`{"operation":"destroy"}`))
	req.AddCookie(cookieFromToken("operator-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("destroy plan by operator status = %d, want %d", rr.Code, http.StatusForbidden)
	}
}

func TestEnvironmentApplyRejectsInvalidState(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)

	now := time.Now().UTC()
	env := domain.Environment{
		ID:             uuid.NewString(),
		Name:           "env-applying",
		Status:         domain.EnvironmentStatusApplying,
		Operation:      domain.EnvironmentOperationUpdate,
		ApprovalStatus: domain.ApprovalStatusApproved,
		Spec: domain.EnvironmentSpec{
			EnvironmentName: "env-applying",
			TenantName:      "tenant-a",
			Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
			Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24", EnableDHCP: true},
			Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
		},
		LastPlanJobID: uuid.NewString(),
		LastJobID:     uuid.NewString(),
		MaxRetries:    3,
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if _, err := store.CreateEnvironment(nil, env); err != nil {
		t.Fatalf("create environment: %v", err)
	}
	planJob := domain.Job{
		ID:            env.LastPlanJobID,
		Type:          domain.JobTypePlan,
		Status:        domain.JobStatusDone,
		CreatedAt:     now,
		UpdatedAt:     now,
		EnvironmentID: env.ID,
		Operation:     env.Operation,
		Environment:   env.Spec,
		TemplateName:  "basic",
		Workdir:       "/tmp/workdir",
		PlanPath:      ".infra-orch/plan/plan.bin",
		MaxRetries:    env.MaxRetries,
		RequestedBy:   admin.Email,
	}
	if _, err := store.CreateJob(nil, planJob); err != nil {
		t.Fatalf("create plan job: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/apply", nil)
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("apply from applying status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
}

func TestEnvironmentRetryRequiresAdminForFailedApply(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	operator := mustUser(t, "operator@example.com", false, "password123")
	seedSession(store, admin, "admin-session-token")
	seedSession(store, operator, "operator-session-token")
	srv := newTestServer(store)

	now := time.Now().UTC()
	env := domain.Environment{
		ID:             uuid.NewString(),
		Name:           "env-apply-retry",
		Status:         domain.EnvironmentStatusFailed,
		Operation:      domain.EnvironmentOperationUpdate,
		ApprovalStatus: domain.ApprovalStatusApproved,
		Spec: domain.EnvironmentSpec{
			EnvironmentName: "env-apply-retry",
			TenantName:      "tenant-a",
			Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
			Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24", EnableDHCP: true},
			Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
		},
		LastJobID:     uuid.NewString(),
		RetryCount:    0,
		MaxRetries:    3,
		CreatedAt:     now,
		UpdatedAt:     now,
		LastPlanJobID: uuid.NewString(),
	}
	if _, err := store.CreateEnvironment(nil, env); err != nil {
		t.Fatalf("create environment: %v", err)
	}
	job := domain.Job{
		ID:            env.LastJobID,
		Type:          domain.JobTypeApply,
		Status:        domain.JobStatusFailed,
		CreatedAt:     now,
		UpdatedAt:     now,
		EnvironmentID: env.ID,
		Operation:     env.Operation,
		Environment:   env.Spec,
		TemplateName:  "basic",
		Workdir:       "/tmp/workdir",
		PlanPath:      ".infra-orch/plan/plan.bin",
		MaxRetries:    env.MaxRetries,
		RequestedBy:   admin.Email,
	}
	if _, err := store.CreateJob(nil, job); err != nil {
		t.Fatalf("create job: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/retry", nil)
	req.AddCookie(cookieFromToken("operator-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusForbidden {
		t.Fatalf("retry failed apply by operator status = %d, want %d", rr.Code, http.StatusForbidden)
	}
}

func TestEnvironmentPlanResetsAttemptScopedArtifacts(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)

	now := time.Now().UTC()
	env := domain.Environment{
		ID:             uuid.NewString(),
		Name:           "env-reset-plan",
		Status:         domain.EnvironmentStatusActive,
		Operation:      domain.EnvironmentOperationUpdate,
		ApprovalStatus: domain.ApprovalStatusApproved,
		Spec: domain.EnvironmentSpec{
			EnvironmentName: "env-reset-plan",
			TenantName:      "tenant-a",
			Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
			Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24", EnableDHCP: true},
			Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
		},
		LastPlanJobID:  uuid.NewString(),
		LastApplyJobID: uuid.NewString(),
		LastJobID:      uuid.NewString(),
		Workdir:        "/tmp/workdir-old",
		PlanPath:       ".infra-orch/plan/old.bin",
		OutputsJSON:    `{"old":"output"}`,
		LastError:      "previous failure",
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if _, err := store.CreateEnvironment(nil, env); err != nil {
		t.Fatalf("create environment: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/plan", nil)
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("plan status = %d, want %d", rr.Code, http.StatusCreated)
	}

	updated, err := store.GetEnvironment(nil, env.ID)
	if err != nil {
		t.Fatalf("get environment: %v", err)
	}
	if updated.Workdir != "" || updated.PlanPath != "" || updated.OutputsJSON != "" || updated.LastError != "" {
		t.Fatalf("attempt-scoped fields not cleared: %+v", updated)
	}
	if updated.ApprovalStatus != domain.ApprovalStatusNotRequested {
		t.Fatalf("approval status = %s, want %s", updated.ApprovalStatus, domain.ApprovalStatusNotRequested)
	}
}

func TestEnvironmentPlanRetryClearsAttemptScopedArtifacts(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)

	now := time.Now().UTC()
	env := domain.Environment{
		ID:             uuid.NewString(),
		Name:           "env-plan-retry",
		Status:         domain.EnvironmentStatusFailed,
		Operation:      domain.EnvironmentOperationUpdate,
		ApprovalStatus: domain.ApprovalStatusPending,
		Spec: domain.EnvironmentSpec{
			EnvironmentName: "env-plan-retry",
			TenantName:      "tenant-a",
			Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
			Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24", EnableDHCP: true},
			Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
		},
		LastPlanJobID: uuid.NewString(),
		LastJobID:     uuid.NewString(),
		RetryCount:    0,
		MaxRetries:    3,
		Workdir:       "/tmp/workdir-old",
		PlanPath:      ".infra-orch/plan/old.bin",
		OutputsJSON:   `{"old":"output"}`,
		LastError:     "plan failed",
		CreatedAt:     now,
		UpdatedAt:     now,
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
		TemplateName:  "basic",
		MaxRetries:    env.MaxRetries,
		RetryCount:    0,
		RequestedBy:   admin.Email,
	}
	if _, err := store.CreateJob(nil, job); err != nil {
		t.Fatalf("create job: %v", err)
	}

	req := httptest.NewRequest(http.MethodPost, "/api/environments/"+env.ID+"/retry", nil)
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("retry status = %d, want %d", rr.Code, http.StatusCreated)
	}

	updated, err := store.GetEnvironment(nil, env.ID)
	if err != nil {
		t.Fatalf("get environment: %v", err)
	}
	if updated.Workdir != "" || updated.PlanPath != "" || updated.OutputsJSON != "" || updated.LastError != "" {
		t.Fatalf("attempt-scoped fields not cleared on retry: %+v", updated)
	}
	if updated.ApprovalStatus != domain.ApprovalStatusNotRequested {
		t.Fatalf("approval status after retry = %s, want %s", updated.ApprovalStatus, domain.ApprovalStatusNotRequested)
	}
}

func TestTemplatesEndpointListsRepoBackedCatalog(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")

	root := t.TempDir()
	templatesRoot := filepath.Join(root, "templates")
	modulesRoot := filepath.Join(root, "modules")
	for _, dir := range []string{
		filepath.Join(templatesRoot, "basic"),
		filepath.Join(modulesRoot, "network"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	if err := os.WriteFile(filepath.Join(templatesRoot, "basic", "main.tf"), []byte("module {}"), 0o644); err != nil {
		t.Fatalf("write template file: %v", err)
	}
	if err := os.WriteFile(filepath.Join(modulesRoot, "network", "variables.tf"), []byte("variable {}"), 0o644); err != nil {
		t.Fatalf("write module file: %v", err)
	}

	srv := NewServer(Config{
		JobStore:       store,
		AuthStore:      store,
		CookieName:     "test_session",
		SessionTTL:     time.Hour,
		AllowedOrigins: []string{"http://localhost:5173"},
		TemplatesRoot:  templatesRoot,
		ModulesRoot:    modulesRoot,
	})

	req := httptest.NewRequest(http.MethodGet, "/api/templates", nil)
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("templates status = %d, want %d", rr.Code, http.StatusOK)
	}

	var resp struct {
		EnvironmentSets []struct {
			Name  string   `json:"name"`
			Files []string `json:"files"`
		} `json:"environment_sets"`
		Modules []struct {
			Name  string   `json:"name"`
			Files []string `json:"files"`
		} `json:"modules"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode templates response: %v", err)
	}
	if len(resp.EnvironmentSets) != 1 || resp.EnvironmentSets[0].Name != "basic" {
		t.Fatalf("unexpected environment sets: %+v", resp.EnvironmentSets)
	}
	if len(resp.Modules) != 1 || resp.Modules[0].Name != "network" {
		t.Fatalf("unexpected modules: %+v", resp.Modules)
	}
}

func TestTemplatesEndpointHandlesMissingRootsAsEmptyCatalog(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")

	root := t.TempDir()
	srv := NewServer(Config{
		JobStore:      store,
		AuthStore:     store,
		CookieName:    "test_session",
		TemplatesRoot: filepath.Join(root, "missing-templates"),
		ModulesRoot:   filepath.Join(root, "missing-modules"),
	})

	req := httptest.NewRequest(http.MethodGet, "/api/templates", nil)
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("templates status = %d, want %d", rr.Code, http.StatusOK)
	}

	var resp struct {
		EnvironmentSets []any `json:"environment_sets"`
		Modules         []any `json:"modules"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode templates response: %v", err)
	}
	if len(resp.EnvironmentSets) != 0 {
		t.Fatalf("environment_sets = %+v, want empty", resp.EnvironmentSets)
	}
	if len(resp.Modules) != 0 {
		t.Fatalf("modules = %+v, want empty", resp.Modules)
	}
}

func TestAuditFeedEndpointListsEnvironmentEvents(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)

	now := time.Now().UTC()
	envID := uuid.NewString()
	if _, err := store.CreateAuditEvent(nil, domain.AuditEvent{
		ID:           uuid.NewString(),
		ResourceType: "environment",
		ResourceID:   envID,
		Action:       "environment.approved",
		ActorEmail:   "admin@example.com",
		Message:      "approved",
		CreatedAt:    now,
	}); err != nil {
		t.Fatalf("create audit event: %v", err)
	}
	if _, err := store.CreateAuditEvent(nil, domain.AuditEvent{
		ID:           uuid.NewString(),
		ResourceType: "job",
		ResourceID:   uuid.NewString(),
		Action:       "job.succeeded",
		ActorEmail:   "system",
		Message:      "job done",
		CreatedAt:    now.Add(-time.Minute),
	}); err != nil {
		t.Fatalf("create audit event: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/audit?resource_type=environment&limit=5", nil)
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("audit feed status = %d, want %d", rr.Code, http.StatusOK)
	}

	var resp struct {
		Items []domain.AuditEvent `json:"items"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode audit feed response: %v", err)
	}
	if len(resp.Items) != 1 || resp.Items[0].ResourceType != "environment" {
		t.Fatalf("unexpected audit feed items: %+v", resp.Items)
	}
}

func TestEnvironmentJobsAndArtifactsEndpoints(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)

	now := time.Now().UTC()
	env := domain.Environment{
		ID:             uuid.NewString(),
		Name:           "env-jobs",
		Status:         domain.EnvironmentStatusActive,
		Operation:      domain.EnvironmentOperationUpdate,
		ApprovalStatus: domain.ApprovalStatusApproved,
		Spec: domain.EnvironmentSpec{
			EnvironmentName: "env-jobs",
			TenantName:      "tenant-a",
			Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
			Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24", EnableDHCP: true},
			Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
		},
		LastPlanJobID:  uuid.NewString(),
		LastApplyJobID: uuid.NewString(),
		Workdir:        "/tmp/workdir",
		PlanPath:       ".infra-orch/plan/plan.bin",
		OutputsJSON:    `{"vm_ip":{"value":"10.0.0.10"}}`,
		CreatedAt:      now,
		UpdatedAt:      now,
	}
	if _, err := store.CreateEnvironment(nil, env); err != nil {
		t.Fatalf("create environment: %v", err)
	}
	for _, job := range []domain.Job{
		{
			ID:            env.LastPlanJobID,
			Type:          domain.JobTypePlan,
			Status:        domain.JobStatusDone,
			CreatedAt:     now,
			UpdatedAt:     now,
			EnvironmentID: env.ID,
			Operation:     env.Operation,
			Environment:   env.Spec,
			TemplateName:  "basic",
			Workdir:       env.Workdir,
			PlanPath:      env.PlanPath,
		},
		{
			ID:            env.LastApplyJobID,
			Type:          domain.JobTypeApply,
			Status:        domain.JobStatusDone,
			CreatedAt:     now.Add(time.Minute),
			UpdatedAt:     now.Add(time.Minute),
			EnvironmentID: env.ID,
			Operation:     env.Operation,
			Environment:   env.Spec,
			TemplateName:  "basic",
			Workdir:       env.Workdir,
			PlanPath:      env.PlanPath,
			OutputsJSON:   env.OutputsJSON,
		},
		{
			ID:            uuid.NewString(),
			Type:          domain.JobTypePlan,
			Status:        domain.JobStatusDone,
			CreatedAt:     now,
			UpdatedAt:     now,
			EnvironmentID: uuid.NewString(),
			Operation:     env.Operation,
			Environment:   env.Spec,
		},
	} {
		if _, err := store.CreateJob(nil, job); err != nil {
			t.Fatalf("create job: %v", err)
		}
	}

	jobsReq := httptest.NewRequest(http.MethodGet, "/api/environments/"+env.ID+"/jobs", nil)
	jobsReq.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	jobsRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(jobsRR, jobsReq)
	if jobsRR.Code != http.StatusOK {
		t.Fatalf("environment jobs status = %d, want %d", jobsRR.Code, http.StatusOK)
	}
	var jobsResp struct {
		Items []domain.Job `json:"items"`
	}
	if err := json.Unmarshal(jobsRR.Body.Bytes(), &jobsResp); err != nil {
		t.Fatalf("decode jobs response: %v", err)
	}
	if len(jobsResp.Items) != 2 {
		t.Fatalf("jobs count = %d, want 2", len(jobsResp.Items))
	}

	artifactsReq := httptest.NewRequest(http.MethodGet, "/api/environments/"+env.ID+"/artifacts", nil)
	artifactsReq.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	artifactsRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(artifactsRR, artifactsReq)
	if artifactsRR.Code != http.StatusOK {
		t.Fatalf("artifacts status = %d, want %d", artifactsRR.Code, http.StatusOK)
	}
	var artifactsResp struct {
		EnvironmentID string      `json:"environment_id"`
		Workdir       string      `json:"workdir"`
		PlanPath      string      `json:"plan_path"`
		OutputsJSON   string      `json:"outputs_json"`
		LastPlanJob   *domain.Job `json:"last_plan_job"`
		LastApplyJob  *domain.Job `json:"last_apply_job"`
	}
	if err := json.Unmarshal(artifactsRR.Body.Bytes(), &artifactsResp); err != nil {
		t.Fatalf("decode artifacts response: %v", err)
	}
	if artifactsResp.EnvironmentID != env.ID || artifactsResp.LastPlanJob == nil || artifactsResp.LastApplyJob == nil {
		t.Fatalf("unexpected artifacts payload: %+v", artifactsResp)
	}
}

func TestEnvironmentPlanReviewEndpoint(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)

	now := time.Now().UTC()
	env := domain.Environment{
		ID:             uuid.NewString(),
		Name:           "env-review",
		Status:         domain.EnvironmentStatusPendingApproval,
		Operation:      domain.EnvironmentOperationUpdate,
		ApprovalStatus: domain.ApprovalStatusPending,
		Spec: domain.EnvironmentSpec{
			EnvironmentName: "env-review",
			TenantName:      "tenant-a",
			Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
			Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/27", EnableDHCP: true},
			Instances: []domain.Instance{
				{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 2},
				{Name: "vm-b", Image: "ubuntu", Flavor: "small", Count: 2},
			},
		},
		LastPlanJobID: uuid.NewString(),
		CreatedAt:     now,
		UpdatedAt:     now,
	}
	if _, err := store.CreateEnvironment(nil, env); err != nil {
		t.Fatalf("create environment: %v", err)
	}
	if _, err := store.CreateJob(nil, domain.Job{
		ID:            env.LastPlanJobID,
		Type:          domain.JobTypePlan,
		Status:        domain.JobStatusDone,
		CreatedAt:     now,
		UpdatedAt:     now,
		EnvironmentID: env.ID,
		Operation:     env.Operation,
		Environment:   env.Spec,
		TemplateName:  "basic",
		Workdir:       "/tmp/workdir",
		PlanPath:      ".infra-orch/plan/plan.bin",
	}); err != nil {
		t.Fatalf("create plan job: %v", err)
	}

	req := httptest.NewRequest(http.MethodGet, "/api/environments/"+env.ID+"/plan-review", nil)
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("plan review status = %d, want %d", rr.Code, http.StatusOK)
	}

	var resp struct {
		ReviewSignals []struct {
			Label    string `json:"label"`
			Severity string `json:"severity"`
		} `json:"review_signals"`
		ImpactSummary struct {
			Downtime string `json:"downtime"`
		} `json:"impact_summary"`
		PlanJob *domain.Job `json:"plan_job"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode plan review response: %v", err)
	}
	if resp.PlanJob == nil || resp.PlanJob.TemplateName != "basic" {
		t.Fatalf("unexpected plan job payload: %+v", resp.PlanJob)
	}
	if resp.ImpactSummary.Downtime != "Medium" {
		t.Fatalf("downtime = %q, want %q", resp.ImpactSummary.Downtime, "Medium")
	}
	foundHigh := false
	for _, item := range resp.ReviewSignals {
		if item.Label == "Subnet capacity pressure" && item.Severity == "high" {
			foundHigh = true
			break
		}
	}
	if !foundHigh {
		t.Fatalf("expected subnet capacity signal in %+v", resp.ReviewSignals)
	}
}

func TestPlanReviewPreviewEndpoint(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)

	req := httptest.NewRequest(http.MethodPost, "/api/environments/plan-review-preview", strings.NewReader(`{
		"spec": {
			"environment_name": "preview-a",
			"tenant_name": "tenant-a",
			"network": {"name": "net-a", "cidr": "10.0.0.0/24"},
			"subnet": {"name": "sub-a", "cidr": "10.0.0.0/27", "enable_dhcp": true},
			"instances": [
				{"name": "vm-a", "image": "ubuntu", "flavor": "small", "count": 2},
				{"name": "vm-b", "image": "ubuntu", "flavor": "small", "count": 2}
			]
		},
		"operation": "create",
		"template_name": "basic"
	}`))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("preview review status = %d, want %d", rr.Code, http.StatusOK)
	}

	var resp struct {
		ReviewSignals []struct {
			Label string `json:"label"`
		} `json:"review_signals"`
		ImpactSummary struct {
			Downtime string `json:"downtime"`
		} `json:"impact_summary"`
		PlanJob *domain.Job `json:"plan_job"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode preview review response: %v", err)
	}
	if resp.PlanJob == nil || resp.PlanJob.TemplateName != "basic" {
		t.Fatalf("unexpected preview plan job payload: %+v", resp.PlanJob)
	}
	if resp.ImpactSummary.Downtime != "Medium" {
		t.Fatalf("downtime = %q, want %q", resp.ImpactSummary.Downtime, "Medium")
	}
	if len(resp.ReviewSignals) == 0 {
		t.Fatalf("expected preview signals, got none")
	}
}

func TestTemplateInspectAndValidateEndpoints(t *testing.T) {
	root := t.TempDir()
	templatesRoot := filepath.Join(root, "templates")
	modulesRoot := filepath.Join(root, "modules")
	for _, dir := range []string{
		filepath.Join(templatesRoot, "basic"),
		filepath.Join(modulesRoot, "network"),
	} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	for _, file := range []string{"main.tf", "outputs.tf", "variables.tf", "versions.tf"} {
		if err := os.WriteFile(filepath.Join(templatesRoot, "basic", file), []byte("content"), 0o644); err != nil {
			t.Fatalf("write env template file: %v", err)
		}
	}
	if err := os.WriteFile(filepath.Join(templatesRoot, "basic", "README.md"), []byte("readme"), 0o644); err != nil {
		t.Fatalf("write env template readme: %v", err)
	}
	for _, file := range []string{"main.tf", "variables.tf"} {
		if err := os.WriteFile(filepath.Join(modulesRoot, "network", file), []byte("content"), 0o644); err != nil {
			t.Fatalf("write module file: %v", err)
		}
	}

	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := NewServer(Config{
		JobStore:      store,
		AuthStore:     store,
		CookieName:    "test_session",
		TemplatesRoot: templatesRoot,
		ModulesRoot:   modulesRoot,
	})
	cookie := cookieFromToken("admin-session-token", "test_session")

	getReq := httptest.NewRequest(http.MethodGet, "/api/templates/environment/basic", nil)
	getReq.AddCookie(cookie)
	getRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(getRR, getReq)
	if getRR.Code != http.StatusOK {
		t.Fatalf("template inspect status = %d, want %d", getRR.Code, http.StatusOK)
	}
	var getResp struct {
		Validation struct {
			Valid bool `json:"valid"`
		} `json:"validation"`
	}
	if err := json.Unmarshal(getRR.Body.Bytes(), &getResp); err != nil {
		t.Fatalf("decode template inspect response: %v", err)
	}
	if !getResp.Validation.Valid {
		t.Fatalf("expected environment template to be valid")
	}

	validateReq := httptest.NewRequest(http.MethodPost, "/api/templates/module/network/validate", nil)
	validateReq.AddCookie(cookie)
	validateRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(validateRR, validateReq)
	if validateRR.Code != http.StatusOK {
		t.Fatalf("template validate status = %d, want %d", validateRR.Code, http.StatusOK)
	}
	var validateResp struct {
		Valid   bool     `json:"valid"`
		Missing []string `json:"missing_files"`
	}
	if err := json.Unmarshal(validateRR.Body.Bytes(), &validateResp); err != nil {
		t.Fatalf("decode template validate response: %v", err)
	}
	if validateResp.Valid {
		t.Fatalf("expected module validation to fail due to missing outputs.tf")
	}
	if len(validateResp.Missing) != 1 || validateResp.Missing[0] != "outputs.tf" {
		t.Fatalf("unexpected missing files: %+v", validateResp.Missing)
	}
}
