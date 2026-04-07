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
