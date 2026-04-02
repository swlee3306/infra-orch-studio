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

func TestJobsCreateListGetAndApplyContract(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")

	planJob := domain.Job{
		ID:        uuid.NewString(),
		Type:      domain.JobTypePlan,
		Status:    domain.JobStatusDone,
		CreatedAt: time.Now().UTC().Add(-time.Minute),
		UpdatedAt: time.Now().UTC().Add(-time.Minute),
		Environment: domain.EnvironmentSpec{
			EnvironmentName: "dev",
			TenantName:      "tenant-a",
			Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
			Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24", EnableDHCP: true},
			Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
		},
		TemplateName: "basic",
		Workdir:      "/tmp/workdir-1",
		PlanPath:     ".infra-orch/plan/plan.bin",
	}
	if _, err := store.CreateJob(nil, planJob); err != nil {
		t.Fatalf("seed plan job: %v", err)
	}

	srv := newTestServer(store)
	sessionCookie := cookieFromToken("admin-session-token", srv.cookieName)

	createReq := httptest.NewRequest(http.MethodPost, "/api/jobs", strings.NewReader(`{
		"environment": {
			"environment_name": "dev",
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
		t.Fatalf("create status = %d, want %d", createRR.Code, http.StatusCreated)
	}

	var created domain.Job
	if err := json.Unmarshal(createRR.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode create response: %v", err)
	}
	if created.Type != domain.JobTypeEnvironmentCreate || created.Status != domain.JobStatusQueued {
		t.Fatalf("unexpected created job: %#v", created)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/jobs?limit=2", nil)
	listReq.AddCookie(sessionCookie)
	listRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(listRR, listReq)
	if listRR.Code != http.StatusOK {
		t.Fatalf("list status = %d, want %d", listRR.Code, http.StatusOK)
	}
	var listResp struct {
		Items  []domain.Job `json:"items"`
		Viewer domain.User  `json:"viewer"`
	}
	if err := json.Unmarshal(listRR.Body.Bytes(), &listResp); err != nil {
		t.Fatalf("decode list response: %v", err)
	}
	if len(listResp.Items) != 2 {
		t.Fatalf("list items = %d, want 2", len(listResp.Items))
	}
	if listResp.Viewer.Email != "admin@example.com" || !listResp.Viewer.IsAdmin {
		t.Fatalf("unexpected viewer: %#v", listResp.Viewer)
	}

	getReq := httptest.NewRequest(http.MethodGet, "/api/jobs/"+created.ID, nil)
	getReq.AddCookie(sessionCookie)
	getRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(getRR, getReq)
	if getRR.Code != http.StatusOK {
		t.Fatalf("get status = %d, want %d", getRR.Code, http.StatusOK)
	}

	forbiddenReq := httptest.NewRequest(http.MethodPost, "/api/jobs/"+planJob.ID+"/apply", nil)
	forbiddenReq.AddCookie(cookieFromToken("viewer-session-token", srv.cookieName))
	seedSession(store, mustUser(t, "viewer@example.com", false, "password123"), "viewer-session-token")
	forbiddenRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(forbiddenRR, forbiddenReq)
	if forbiddenRR.Code != http.StatusForbidden {
		t.Fatalf("apply forbidden status = %d, want %d", forbiddenRR.Code, http.StatusForbidden)
	}

	applyReq := httptest.NewRequest(http.MethodPost, "/api/jobs/"+planJob.ID+"/apply", nil)
	applyReq.AddCookie(sessionCookie)
	applyRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(applyRR, applyReq)
	if applyRR.Code != http.StatusCreated {
		t.Fatalf("apply status = %d, want %d", applyRR.Code, http.StatusCreated)
	}

	var applied domain.Job
	if err := json.Unmarshal(applyRR.Body.Bytes(), &applied); err != nil {
		t.Fatalf("decode apply response: %v", err)
	}
	if applied.Type != domain.JobTypeApply {
		t.Fatalf("unexpected apply type: %s", applied.Type)
	}
	if applied.SourceJobID != planJob.ID {
		t.Fatalf("apply source_job_id = %q, want %q", applied.SourceJobID, planJob.ID)
	}
}

func TestJobsGetMissingReturns404(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)

	req := httptest.NewRequest(http.MethodGet, "/api/jobs/does-not-exist", nil)
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusNotFound)
	}
}

func TestJobsApplyRejectsEnvironmentManagedPlan(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")

	planJob := domain.Job{
		ID:            uuid.NewString(),
		Type:          domain.JobTypePlan,
		Status:        domain.JobStatusDone,
		CreatedAt:     time.Now().UTC().Add(-time.Minute),
		UpdatedAt:     time.Now().UTC().Add(-time.Minute),
		EnvironmentID: uuid.NewString(),
		Operation:     domain.EnvironmentOperationCreate,
		Environment: domain.EnvironmentSpec{
			EnvironmentName: "prod",
			TenantName:      "tenant-a",
			Network:         domain.Network{Name: "net-a", CIDR: "10.10.0.0/24"},
			Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.10.0.0/24", EnableDHCP: true},
			Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
		},
		TemplateName: "basic",
		Workdir:      "/tmp/workdir-2",
		PlanPath:     ".infra-orch/plan/plan.bin",
	}
	if _, err := store.CreateJob(nil, planJob); err != nil {
		t.Fatalf("seed plan job: %v", err)
	}

	srv := newTestServer(store)
	req := httptest.NewRequest(http.MethodPost, "/api/jobs/"+planJob.ID+"/apply", nil)
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
	if !strings.Contains(rr.Body.String(), "/api/environments/{id}/apply") {
		t.Fatalf("unexpected body: %s", rr.Body.String())
	}
}

func cookieFromToken(rawToken, name string) *http.Cookie {
	return &http.Cookie{Name: name, Value: rawToken, Path: "/"}
}
