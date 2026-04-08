package api

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func TestAuthSignupMeAndLogout(t *testing.T) {
	store := newFakeStore()
	srv := newTestServer(store)

	signupBody := `{"email":"Admin@Example.com","password":"password123"}`
	req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(signupBody))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusCreated {
		t.Fatalf("signup status = %d, want %d", rr.Code, http.StatusCreated)
	}

	var created domain.User
	if err := decodeJSON(bytes.NewReader(rr.Body.Bytes()), &created); err != nil {
		t.Fatalf("decode signup response: %v", err)
	}
	if got, want := created.Email, "admin@example.com"; got != want {
		t.Fatalf("signup email = %q, want %q", got, want)
	}
	if created.PasswordHash != "" {
		t.Fatalf("password hash should not be exposed")
	}

	cookies := rr.Result().Cookies()
	if len(cookies) == 0 {
		t.Fatalf("expected session cookie")
	}
	sessionCookie := cookies[0]

	meReq := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meReq.AddCookie(sessionCookie)
	meRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(meRR, meReq)

	if meRR.Code != http.StatusOK {
		t.Fatalf("me status = %d, want %d", meRR.Code, http.StatusOK)
	}
	var me domain.User
	if err := decodeJSON(bytes.NewReader(meRR.Body.Bytes()), &me); err != nil {
		t.Fatalf("decode me response: %v", err)
	}
	if me.Email != "admin@example.com" || me.IsAdmin {
		t.Fatalf("unexpected me response: %#v", me)
	}

	logoutReq := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	logoutReq.AddCookie(sessionCookie)
	logoutRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(logoutRR, logoutReq)

	if logoutRR.Code != http.StatusNoContent {
		t.Fatalf("logout status = %d, want %d", logoutRR.Code, http.StatusNoContent)
	}

	meAfterLogout := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meAfterLogout.AddCookie(sessionCookie)
	meAfterLogoutRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(meAfterLogoutRR, meAfterLogout)

	if meAfterLogoutRR.Code != http.StatusUnauthorized {
		t.Fatalf("me after logout status = %d, want %d", meAfterLogoutRR.Code, http.StatusUnauthorized)
	}
}

func TestAuthLoginRejectsInvalidPassword(t *testing.T) {
	store := newFakeStore()
	user := mustUser(t, "viewer@example.com", false, "password123")
	if _, err := store.CreateUser(context.Background(), user); err != nil {
		t.Fatalf("seed user: %v", err)
	}
	srv := newTestServer(store)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"viewer@example.com","password":"wrongpass"}`))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusUnauthorized {
		t.Fatalf("login status = %d, want %d", rr.Code, http.StatusUnauthorized)
	}
}

func TestAuthSignupDisabledByDefault(t *testing.T) {
	store := newFakeStore()
	srv := NewServer(Config{
		JobStore:       store,
		AuthStore:      store,
		CookieName:     "test_session",
		SessionTTL:     time.Hour,
		AllowedOrigins: []string{"http://localhost:5173"},
	})

	req := httptest.NewRequest(http.MethodPost, "/api/auth/signup", strings.NewReader(`{"email":"user@example.com","password":"password123"}`))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)

	if rr.Code != http.StatusForbidden {
		t.Fatalf("signup disabled status = %d, want %d", rr.Code, http.StatusForbidden)
	}
}

func TestPublicConfigExposesSignupPolicy(t *testing.T) {
	store := newFakeStore()

	disabled := NewServer(Config{
		JobStore:       store,
		AuthStore:      store,
		CookieName:     "test_session",
		SessionTTL:     time.Hour,
		AllowedOrigins: []string{"http://localhost:5173"},
	})
	enabled := NewServer(Config{
		JobStore:          store,
		AuthStore:         store,
		CookieName:        "test_session",
		SessionTTL:        time.Hour,
		AllowedOrigins:    []string{"http://localhost:5173"},
		AllowPublicSignup: true,
	})

	for _, tc := range []struct {
		name string
		srv  *Server
		want bool
	}{
		{name: "disabled", srv: disabled, want: false},
		{name: "enabled", srv: enabled, want: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/api/public-config", nil)
			rr := httptest.NewRecorder()
			tc.srv.mux.ServeHTTP(rr, req)
			if rr.Code != http.StatusOK {
				t.Fatalf("public config status = %d, want %d", rr.Code, http.StatusOK)
			}
			var payload struct {
				AllowPublicSignup bool `json:"allow_public_signup"`
			}
			if err := decodeJSON(bytes.NewReader(rr.Body.Bytes()), &payload); err != nil {
				t.Fatalf("decode public config: %v", err)
			}
			if payload.AllowPublicSignup != tc.want {
				t.Fatalf("allow_public_signup = %v, want %v", payload.AllowPublicSignup, tc.want)
			}
		})
	}
}

func TestAdminCanProvisionUser(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	operator := mustUser(t, "operator@example.com", false, "password123")
	seedSession(store, admin, "admin-session-token")
	seedSession(store, operator, "operator-session-token")
	srv := newTestServer(store)

	operatorReq := httptest.NewRequest(http.MethodPost, "/api/admin/users", strings.NewReader(`{"email":"viewer@example.com","password":"password123"}`))
	operatorReq.AddCookie(cookieFromToken("operator-session-token", srv.cookieName))
	operatorRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(operatorRR, operatorReq)
	if operatorRR.Code != http.StatusForbidden {
		t.Fatalf("operator provision status = %d, want %d", operatorRR.Code, http.StatusForbidden)
	}

	adminReq := httptest.NewRequest(http.MethodPost, "/api/admin/users", strings.NewReader(`{"email":"viewer@example.com","password":"password123","is_admin":true}`))
	adminReq.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	adminRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(adminRR, adminReq)
	if adminRR.Code != http.StatusCreated {
		t.Fatalf("admin provision status = %d, want %d", adminRR.Code, http.StatusCreated)
	}

	var created domain.User
	if err := decodeJSON(bytes.NewReader(adminRR.Body.Bytes()), &created); err != nil {
		t.Fatalf("decode provisioned user: %v", err)
	}
	if created.Email != "viewer@example.com" || !created.IsAdmin {
		t.Fatalf("unexpected provisioned user: %#v", created)
	}
	if created.PasswordHash != "" {
		t.Fatalf("password hash should not be exposed")
	}

	audits, err := store.ListAuditEvents(context.Background(), "user", created.ID, 10)
	if err != nil {
		t.Fatalf("list user audits: %v", err)
	}
	if len(audits) == 0 || !strings.Contains(audits[0].MetadataJSON, "viewer@example.com") {
		t.Fatalf("expected provisioning audit metadata, got %+v", audits)
	}

	listReq := httptest.NewRequest(http.MethodGet, "/api/admin/users", nil)
	listReq.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	listRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(listRR, listReq)
	if listRR.Code != http.StatusOK {
		t.Fatalf("admin list users status = %d, want %d", listRR.Code, http.StatusOK)
	}
	var listPayload struct {
		Items []domain.User `json:"items"`
	}
	if err := decodeJSON(bytes.NewReader(listRR.Body.Bytes()), &listPayload); err != nil {
		t.Fatalf("decode user list: %v", err)
	}
	if len(listPayload.Items) < 3 {
		t.Fatalf("expected seeded users plus provisioned user, got %d", len(listPayload.Items))
	}
	if listPayload.Items[0].PasswordHash != "" {
		t.Fatalf("password hash should not be exposed from list response")
	}
}

func TestAdminCanDisableUserAndBlockLogin(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	operator := mustUser(t, "operator@example.com", false, "password123")
	seedSession(store, admin, "admin-session-token")
	seedSession(store, operator, "operator-session-token")
	srv := newTestServer(store)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/"+operator.ID+"/disable", strings.NewReader(`{"disabled":true}`))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("disable user status = %d, want %d", rr.Code, http.StatusOK)
	}

	var updated domain.User
	if err := decodeJSON(bytes.NewReader(rr.Body.Bytes()), &updated); err != nil {
		t.Fatalf("decode disabled user: %v", err)
	}
	if !updated.Disabled {
		t.Fatalf("disabled = false, want true")
	}

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"operator@example.com","password":"password123"}`))
	loginRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(loginRR, loginReq)
	if loginRR.Code != http.StatusForbidden {
		t.Fatalf("disabled login status = %d, want %d", loginRR.Code, http.StatusForbidden)
	}

	meReq := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	meReq.AddCookie(cookieFromToken("operator-session-token", srv.cookieName))
	meRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(meRR, meReq)
	if meRR.Code != http.StatusUnauthorized {
		t.Fatalf("disabled session status = %d, want %d", meRR.Code, http.StatusUnauthorized)
	}
}

func TestCannotDisableLastActiveAdmin(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/"+admin.ID+"/disable", strings.NewReader(`{"disabled":true}`))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("disable last admin status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
}

func TestAdminCanResetUserPassword(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	operator := mustUser(t, "operator@example.com", false, "password123")
	seedSession(store, admin, "admin-session-token")
	seedSession(store, operator, "operator-session-token")
	srv := newTestServer(store)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/"+operator.ID+"/password", strings.NewReader(`{"password":"new-password-123"}`))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusOK {
		t.Fatalf("reset password status = %d, want %d", rr.Code, http.StatusOK)
	}

	loginReq := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(`{"email":"operator@example.com","password":"new-password-123"}`))
	loginRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(loginRR, loginReq)
	if loginRR.Code != http.StatusOK {
		t.Fatalf("login with reset password status = %d, want %d", loginRR.Code, http.StatusOK)
	}

	audits, err := store.ListAuditEvents(context.Background(), "user", operator.ID, 10)
	if err != nil {
		t.Fatalf("list user audits: %v", err)
	}
	found := false
	for _, item := range audits {
		if item.Action == "user.password_reset" {
			found = true
			break
		}
	}
	if !found {
		t.Fatalf("expected password reset audit, got %+v", audits)
	}
}

func TestAdminCanChangeUserRole(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	operator := mustUser(t, "operator@example.com", false, "password123")
	secondAdmin := mustUser(t, "second-admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	seedSession(store, operator, "operator-session-token")
	seedSession(store, secondAdmin, "second-admin-session-token")
	srv := newTestServer(store)

	grantReq := httptest.NewRequest(http.MethodPost, "/api/admin/users/"+operator.ID+"/role", strings.NewReader(`{"is_admin":true}`))
	grantReq.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	grantRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(grantRR, grantReq)
	if grantRR.Code != http.StatusOK {
		t.Fatalf("grant role status = %d, want %d", grantRR.Code, http.StatusOK)
	}

	revokeReq := httptest.NewRequest(http.MethodPost, "/api/admin/users/"+secondAdmin.ID+"/role", strings.NewReader(`{"is_admin":false}`))
	revokeReq.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	revokeRR := httptest.NewRecorder()
	srv.mux.ServeHTTP(revokeRR, revokeReq)
	if revokeRR.Code != http.StatusOK {
		t.Fatalf("revoke role status = %d, want %d", revokeRR.Code, http.StatusOK)
	}
}

func TestCannotDemoteLastActiveAdmin(t *testing.T) {
	store := newFakeStore()
	admin := mustUser(t, "admin@example.com", true, "password123")
	seedSession(store, admin, "admin-session-token")
	srv := newTestServer(store)

	req := httptest.NewRequest(http.MethodPost, "/api/admin/users/"+admin.ID+"/role", strings.NewReader(`{"is_admin":false}`))
	req.AddCookie(cookieFromToken("admin-session-token", srv.cookieName))
	rr := httptest.NewRecorder()
	srv.mux.ServeHTTP(rr, req)
	if rr.Code != http.StatusBadRequest {
		t.Fatalf("demote last admin status = %d, want %d", rr.Code, http.StatusBadRequest)
	}
}
