package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func TestOverviewRequiresAuth(t *testing.T) {
	store := newFakeStore()
	srv := newTestServer(store)

	req := httptest.NewRequest(http.MethodGet, "/api/overview", nil)
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("overview status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestOverviewAggregatesEnvironmentState(t *testing.T) {
	store := newFakeStore()
	user := mustUser(t, "operator@example.com", false, "password123")
	seedSession(store, user, "operator-session-token")
	srv := newTestServer(store)

	base := time.Date(2026, 4, 9, 12, 0, 0, 0, time.UTC)
	addEnv := func(name string, status domain.EnvironmentStatus, updatedOffset time.Duration, lastError string) domain.Environment {
		env := domain.Environment{
			ID:             uuid.NewString(),
			Name:           name,
			Status:         status,
			Operation:      domain.EnvironmentOperationUpdate,
			ApprovalStatus: domain.ApprovalStatusNotRequested,
			Spec: domain.EnvironmentSpec{
				EnvironmentName: name,
				TenantName:      "tenant-a",
			},
			CreatedAt: base.Add(-updatedOffset - time.Hour),
			UpdatedAt: base.Add(-updatedOffset),
			LastError: lastError,
		}
		switch status {
		case domain.EnvironmentStatusPendingApproval:
			env.ApprovalStatus = domain.ApprovalStatusPending
		case domain.EnvironmentStatusApproved:
			env.ApprovalStatus = domain.ApprovalStatusApproved
		}
		if _, err := store.CreateEnvironment(nil, env); err != nil {
			t.Fatalf("seed environment %s: %v", name, err)
		}
		return env
	}

	addEnv("pending-1", domain.EnvironmentStatusPendingApproval, 9*time.Hour, "")
	addEnv("approved-1", domain.EnvironmentStatusApproved, 8*time.Hour, "")
	addEnv("applying-1", domain.EnvironmentStatusApplying, 7*time.Hour, "")
	addEnv("active-1", domain.EnvironmentStatusActive, 6*time.Hour, "")
	addEnv("destroyed-1", domain.EnvironmentStatusDestroyed, 5*time.Hour, "")
	addEnv("draft-1", domain.EnvironmentStatusDraft, 4*time.Hour, "")

	failed := []domain.Environment{
		addEnv("failed-1", domain.EnvironmentStatusFailed, 10*time.Minute, "latest failure"),
		addEnv("failed-2", domain.EnvironmentStatusFailed, 20*time.Minute, "second failure"),
		addEnv("failed-3", domain.EnvironmentStatusFailed, 30*time.Minute, "third failure"),
		addEnv("failed-4", domain.EnvironmentStatusFailed, 40*time.Minute, "fourth failure"),
		addEnv("failed-5", domain.EnvironmentStatusFailed, 50*time.Minute, "fifth failure"),
		addEnv("failed-6", domain.EnvironmentStatusFailed, 60*time.Minute, "oldest failure"),
	}

	req := httptest.NewRequest(http.MethodGet, "/api/overview", nil)
	req.AddCookie(cookieFromToken("operator-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusOK {
		t.Fatalf("overview status = %d, want %d", rr.Code, http.StatusOK)
	}

	var resp struct {
		EnvironmentsTotal    int `json:"environments_total"`
		PendingApproval      int `json:"pending_approval"`
		ApprovedWaitingApply int `json:"approved_waiting_apply"`
		Applying             int `json:"applying"`
		Failed               int `json:"failed"`
		Active               int `json:"active"`
		Destroyed            int `json:"destroyed"`
		RecentFailures       []struct {
			ID        string                   `json:"id"`
			Name      string                   `json:"name"`
			Status    domain.EnvironmentStatus `json:"status"`
			LastError string                   `json:"last_error"`
			UpdatedAt time.Time                `json:"updated_at"`
		} `json:"recent_failures"`
	}
	if err := decodeJSON(bytes.NewReader(rr.Body.Bytes()), &resp); err != nil {
		t.Fatalf("decode overview response: %v", err)
	}

	if resp.EnvironmentsTotal != 12 {
		t.Fatalf("environments_total = %d, want %d", resp.EnvironmentsTotal, 12)
	}
	if resp.PendingApproval != 1 {
		t.Fatalf("pending_approval = %d, want 1", resp.PendingApproval)
	}
	if resp.ApprovedWaitingApply != 1 {
		t.Fatalf("approved_waiting_apply = %d, want 1", resp.ApprovedWaitingApply)
	}
	if resp.Applying != 1 {
		t.Fatalf("applying = %d, want 1", resp.Applying)
	}
	if resp.Failed != 6 {
		t.Fatalf("failed = %d, want 6", resp.Failed)
	}
	if resp.Active != 1 {
		t.Fatalf("active = %d, want 1", resp.Active)
	}
	if resp.Destroyed != 1 {
		t.Fatalf("destroyed = %d, want 1", resp.Destroyed)
	}
	if len(resp.RecentFailures) != 5 {
		t.Fatalf("recent_failures length = %d, want 5", len(resp.RecentFailures))
	}

	for i, want := range failed[:5] {
		got := resp.RecentFailures[i]
		if got.ID != want.ID || got.Name != want.Name {
			t.Fatalf("recent failure %d = %#v, want id=%q name=%q", i, got, want.ID, want.Name)
		}
		if got.Status != domain.EnvironmentStatusFailed {
			t.Fatalf("recent failure %d status = %s, want failed", i, got.Status)
		}
		if got.LastError != want.LastError {
			t.Fatalf("recent failure %d last_error = %q, want %q", i, got.LastError, want.LastError)
		}
		if !got.UpdatedAt.Equal(want.UpdatedAt) {
			t.Fatalf("recent failure %d updated_at = %s, want %s", i, got.UpdatedAt, want.UpdatedAt)
		}
	}
}
