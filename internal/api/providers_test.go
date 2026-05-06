package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func TestProviderPreflightChecksAuthAndEndpoints(t *testing.T) {
	keystone := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v3/auth/tokens" {
			t.Fatalf("unexpected keystone path: %s", r.URL.Path)
		}
		w.Header().Set("X-Subject-Token", "token-1")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"token": map[string]any{
				"catalog": []map[string]any{
					{
						"type": "compute",
						"endpoints": []map[string]any{{
							"interface": "public",
							"region":    "RegionOne",
							"url":       "https://compute.example/v2.1",
						}},
					},
					{
						"type": "image",
						"endpoints": []map[string]any{{
							"interface": "public",
							"region":    "RegionOne",
							"url":       "https://image.example",
						}},
					},
					{
						"type": "network",
						"endpoints": []map[string]any{{
							"interface": "public",
							"region":    "RegionOne",
							"url":       "https://network.example",
						}},
					},
				},
			},
		})
	}))
	defer keystone.Close()

	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	store.providers["demo"] = domain.ProviderConnection{
		Name:              "demo",
		AuthURL:           keystone.URL,
		RegionName:        "RegionOne",
		Interface:         "public",
		IdentityInterface: "public",
		Username:          "demo-user",
		Password:          "demo-pass",
		ProjectName:       "demo-project",
		UserDomainName:    "Default",
		ProjectDomainName: "Default",
		CreatedAt:         time.Now().UTC(),
		UpdatedAt:         time.Now().UTC(),
	}
	srv := NewServer(Config{
		JobStore:       store,
		AuthStore:      store,
		ProviderStore:  store,
		CookieName:     "test_session",
		SessionTTL:     time.Hour,
		AllowedOrigins: []string{"http://localhost:5173"},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/providers/demo/preflight", nil)
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("preflight status = %d, want %d: %s", rr.Code, http.StatusOK, rr.Body.String())
	}
	var resp struct {
		Provider          string            `json:"provider"`
		Authenticated     bool              `json:"authenticated"`
		Endpoints         map[string]string `json:"endpoints"`
		MissingEndpoints  []string          `json:"missing_endpoints"`
		ReadyForPlanApply bool              `json:"ready_for_plan_apply"`
	}
	if err := json.Unmarshal(rr.Body.Bytes(), &resp); err != nil {
		t.Fatalf("decode preflight response: %v", err)
	}
	if resp.Provider != "demo" || !resp.Authenticated || !resp.ReadyForPlanApply {
		t.Fatalf("unexpected preflight response: %+v", resp)
	}
	for _, key := range []string{"compute", "image", "network"} {
		if resp.Endpoints[key] == "" {
			t.Fatalf("missing endpoint %s in %+v", key, resp.Endpoints)
		}
	}
	if len(resp.MissingEndpoints) != 0 {
		t.Fatalf("missing endpoints = %+v, want none", resp.MissingEndpoints)
	}
}

func TestProviderUpsertAcceptsProjectIDWithoutProjectName(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := NewServer(Config{
		JobStore:       store,
		AuthStore:      store,
		ProviderStore:  store,
		CookieName:     "test_session",
		SessionTTL:     time.Hour,
		AllowedOrigins: []string{"http://localhost:5173"},
	})

	body := []byte(`{
		"name":"demo",
		"auth_url":"https://openstack.example:5000/v3",
		"username":"demo-user",
		"password":"demo-pass",
		"project_id":"project-id-1",
		"user_domain_name":"Default",
		"project_domain_name":"Default"
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/providers", bytes.NewReader(body))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("upsert status = %d, want %d: %s", rr.Code, http.StatusCreated, rr.Body.String())
	}
	got := store.providers["demo"]
	if got.ProjectID != "project-id-1" {
		t.Fatalf("project_id = %q, want project-id-1", got.ProjectID)
	}
	if got.ProjectName != "" {
		t.Fatalf("project_name = %q, want empty", got.ProjectName)
	}
}

func TestProviderUpsertNormalizesEndpointOverride(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := NewServer(Config{
		JobStore:       store,
		AuthStore:      store,
		ProviderStore:  store,
		CookieName:     "test_session",
		SessionTTL:     time.Hour,
		AllowedOrigins: []string{"http://localhost:5173"},
	})

	body := []byte(`{
		"name":"demo",
		"auth_url":"https://openstack.example:5000/v3",
		"username":"demo-user",
		"password":"demo-pass",
		"project_name":"demo-project",
		"endpoint_override":{" compute ":" https://compute.example/v2.1 "}
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/providers", bytes.NewReader(body))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("upsert status = %d, want %d: %s", rr.Code, http.StatusCreated, rr.Body.String())
	}
	if got := store.providers["demo"].EndpointOverride["compute"]; got != "https://compute.example/v2.1" {
		t.Fatalf("endpoint override = %q", got)
	}
}

func TestProviderUpsertDefaultsBlankDomainNames(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := NewServer(Config{
		JobStore:       store,
		AuthStore:      store,
		ProviderStore:  store,
		CookieName:     "test_session",
		SessionTTL:     time.Hour,
		AllowedOrigins: []string{"http://localhost:5173"},
	})

	body := []byte(`{
		"name":"demo",
		"auth_url":"https://openstack.example:5000/v3",
		"username":"demo-user",
		"password":"demo-pass",
		"project_name":"demo-project",
		"user_domain_name":" ",
		"project_domain_name":" "
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/providers", bytes.NewReader(body))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusCreated {
		t.Fatalf("upsert status = %d, want %d: %s", rr.Code, http.StatusCreated, rr.Body.String())
	}
	got := store.providers["demo"]
	if got.UserDomainName != "Default" {
		t.Fatalf("user_domain_name = %q, want Default", got.UserDomainName)
	}
	if got.ProjectDomainName != "Default" {
		t.Fatalf("project_domain_name = %q, want Default", got.ProjectDomainName)
	}
}

func TestProviderUpsertRejectsEmptyEndpointOverrideValue(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := NewServer(Config{
		JobStore:       store,
		AuthStore:      store,
		ProviderStore:  store,
		CookieName:     "test_session",
		SessionTTL:     time.Hour,
		AllowedOrigins: []string{"http://localhost:5173"},
	})

	body := []byte(`{
		"name":"demo",
		"auth_url":"https://openstack.example:5000/v3",
		"username":"demo-user",
		"password":"demo-pass",
		"project_name":"demo-project",
		"endpoint_override":{"compute":" "}
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/providers", bytes.NewReader(body))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("upsert status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
}

func TestProviderUpsertRejectsInvalidURLs(t *testing.T) {
	tests := []struct {
		name string
		body string
	}{
		{
			name: "auth url",
			body: `{
				"name":"demo",
				"auth_url":"not-a-url",
				"username":"demo-user",
				"password":"demo-pass",
				"project_name":"demo-project"
			}`,
		},
		{
			name: "endpoint override url",
			body: `{
				"name":"demo",
				"auth_url":"https://openstack.example:5000/v3",
				"username":"demo-user",
				"password":"demo-pass",
				"project_name":"demo-project",
				"endpoint_override":{"compute":"not-a-url"}
			}`,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			store := newFakeStore()
			admin := mustUser(t, "admin@example.com", true, "password123")
			seedSession(store, admin, "admin-session-token")
			srv := NewServer(Config{
				JobStore:       store,
				AuthStore:      store,
				ProviderStore:  store,
				CookieName:     "test_session",
				SessionTTL:     time.Hour,
				AllowedOrigins: []string{"http://localhost:5173"},
			})

			req := httptest.NewRequest(http.MethodPost, "/api/providers", bytes.NewReader([]byte(tt.body)))
			req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
			rr := httptest.NewRecorder()
			srv.mux.ServeHTTP(rr, req)
			if rr.Code != http.StatusBadRequest {
				t.Fatalf("upsert status = %d, want %d", rr.Code, http.StatusBadRequest)
			}
		})
	}
}

func TestProviderUpsertRejectsUnsafeName(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := NewServer(Config{
		JobStore:       store,
		AuthStore:      store,
		ProviderStore:  store,
		CookieName:     "test_session",
		SessionTTL:     time.Hour,
		AllowedOrigins: []string{"http://localhost:5173"},
	})

	body := []byte(`{
		"name":"demo/cloud",
		"auth_url":"https://openstack.example:5000/v3",
		"username":"demo-user",
		"password":"demo-pass",
		"project_name":"demo-project"
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/providers", bytes.NewReader(body))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("upsert status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
}

func TestProviderUpsertRejectsInvalidInterface(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := NewServer(Config{
		JobStore:       store,
		AuthStore:      store,
		ProviderStore:  store,
		CookieName:     "test_session",
		SessionTTL:     time.Hour,
		AllowedOrigins: []string{"http://localhost:5173"},
	})

	body := []byte(`{
		"name":"demo",
		"auth_url":"https://openstack.example:5000/v3",
		"username":"demo-user",
		"password":"demo-pass",
		"project_name":"demo-project",
		"interface":"private"
	}`)
	req := httptest.NewRequest(http.MethodPost, "/api/providers", bytes.NewReader(body))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("upsert status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
}
