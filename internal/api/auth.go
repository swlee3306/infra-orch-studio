package api

import (
	"database/sql"
	"errors"
	"net/http"
	"net/mail"
	"os"
	"path"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/security"
	"github.com/swlee3306/infra-orch-studio/internal/storage"
)

type authRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type adminProvisionUserRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	IsAdmin  bool   `json:"is_admin,omitempty"`
}

type adminUserStatusRequest struct {
	Disabled bool `json:"disabled"`
}

type adminUserPasswordRequest struct {
	Password string `json:"password"`
}

func (s *Server) handleSignup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if !s.allowPublicSignup {
		writeError(w, http.StatusForbidden, "public signup is disabled")
		return
	}

	var req authRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	email, err := normalizeEmail(req.Email)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	passwordHash, err := security.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	now := time.Now().UTC()
	user := domain.User{
		ID:           uuid.NewString(),
		Email:        email,
		PasswordHash: passwordHash,
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	user, err = s.auth.CreateUser(r.Context(), user)
	if err != nil {
		if errors.Is(err, storage.ErrConflict) {
			writeError(w, http.StatusConflict, "email already exists")
			return
		}
		writeError(w, http.StatusInternalServerError, "create user failed")
		return
	}

	if err := s.startSession(w, r, user); err != nil {
		writeError(w, http.StatusInternalServerError, "create session failed")
		return
	}
	writeJSON(w, http.StatusCreated, user)
}

func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request, user domain.User) {
	if !user.IsAdmin {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}
	switch r.Method {
	case http.MethodGet:
		items, err := s.auth.ListUsers(r.Context(), 200)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "list users failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	case http.MethodPost:
		var req adminProvisionUserRequest
		if err := decodeJSON(r.Body, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}

		email, err := normalizeEmail(req.Email)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		passwordHash, err := security.HashPassword(req.Password)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		now := time.Now().UTC()
		created, err := s.auth.CreateUser(r.Context(), domain.User{
			ID:           uuid.NewString(),
			Email:        email,
			IsAdmin:      req.IsAdmin,
			PasswordHash: passwordHash,
			CreatedAt:    now,
			UpdatedAt:    now,
		})
		if err != nil {
			if errors.Is(err, storage.ErrConflict) {
				writeError(w, http.StatusConflict, "email already exists")
				return
			}
			writeError(w, http.StatusInternalServerError, "create user failed")
			return
		}
		s.recordAudit(r, user, "user", created.ID, "user.provisioned", "admin provisioned user account", map[string]any{
			"email":    created.Email,
			"is_admin": created.IsAdmin,
		})
		writeJSON(w, http.StatusCreated, created)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleAdminUserRoute(w http.ResponseWriter, r *http.Request, user domain.User) {
	if !user.IsAdmin {
		writeError(w, http.StatusForbidden, "admin access required")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(path.Clean(r.URL.Path), "/api/admin/users/")
	parts := strings.Split(id, "/")
	if len(parts) != 2 || parts[0] == "" {
		http.NotFound(w, r)
		return
	}
	targetID := parts[0]
	actionName := parts[1]

	target, err := s.auth.GetUserByID(r.Context(), targetID)
	if err != nil {
		if err == sql.ErrNoRows {
			http.NotFound(w, r)
			return
		}
		writeError(w, http.StatusInternalServerError, "load user failed")
		return
	}

	switch actionName {
	case "disable":
		var req adminUserStatusRequest
		if err := decodeJSON(r.Body, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		if target.ID == user.ID && req.Disabled {
			writeError(w, http.StatusBadRequest, "cannot disable current admin session")
			return
		}
		if target.IsAdmin && req.Disabled {
			items, err := s.auth.ListUsers(r.Context(), 500)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "list users failed")
				return
			}
			activeAdmins := 0
			for _, item := range items {
				if item.IsAdmin && !item.Disabled && item.ID != target.ID {
					activeAdmins++
				}
			}
			if activeAdmins == 0 {
				writeError(w, http.StatusBadRequest, "cannot disable last active admin")
				return
			}
		}

		updated, err := s.auth.SetUserDisabled(r.Context(), target.ID, req.Disabled)
		if err != nil {
			if err == sql.ErrNoRows {
				http.NotFound(w, r)
				return
			}
			writeError(w, http.StatusInternalServerError, "update user status failed")
			return
		}
		action := "user.enabled"
		message := "admin re-enabled user account"
		if req.Disabled {
			action = "user.disabled"
			message = "admin disabled user account"
		}
		s.recordAudit(r, user, "user", updated.ID, action, message, map[string]any{
			"email":       updated.Email,
			"is_admin":    updated.IsAdmin,
			"is_disabled": updated.Disabled,
		})
		writeJSON(w, http.StatusOK, updated)
	case "password":
		var req adminUserPasswordRequest
		if err := decodeJSON(r.Body, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		passwordHash, err := security.HashPassword(req.Password)
		if err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}
		updated, err := s.auth.SetUserPassword(r.Context(), target.ID, passwordHash)
		if err != nil {
			if err == sql.ErrNoRows {
				http.NotFound(w, r)
				return
			}
			writeError(w, http.StatusInternalServerError, "reset user password failed")
			return
		}
		s.recordAudit(r, user, "user", updated.ID, "user.password_reset", "admin reset user password", map[string]any{
			"email":       updated.Email,
			"is_admin":    updated.IsAdmin,
			"is_disabled": updated.Disabled,
		})
		writeJSON(w, http.StatusOK, updated)
	default:
		http.NotFound(w, r)
	}
}

func (s *Server) handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req authRequest
	if err := decodeJSON(r.Body, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}

	email, err := normalizeEmail(req.Email)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	user, err := s.auth.GetUserByEmail(r.Context(), email)
	if err != nil {
		if err == sql.ErrNoRows {
			writeError(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		writeError(w, http.StatusInternalServerError, "load user failed")
		return
	}
	if err := security.ComparePassword(user.PasswordHash, req.Password); err != nil {
		writeError(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if user.Disabled {
		writeError(w, http.StatusForbidden, "account is disabled")
		return
	}

	if err := s.startSession(w, r, user); err != nil {
		writeError(w, http.StatusInternalServerError, "create session failed")
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	if cookie, err := r.Cookie(s.cookieName); err == nil && cookie.Value != "" {
		_ = s.auth.DeleteSessionByTokenHash(r.Context(), security.HashToken(cookie.Value))
	}
	s.clearSessionCookie(w, shouldUseSecureCookie(r))
	w.WriteHeader(http.StatusNoContent)
}

func (s *Server) handleMe(w http.ResponseWriter, r *http.Request, user domain.User) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (s *Server) startSession(w http.ResponseWriter, r *http.Request, user domain.User) error {
	rawToken, tokenHash, err := security.NewSessionToken()
	if err != nil {
		return err
	}

	now := time.Now().UTC()
	session := domain.Session{
		ID:        uuid.NewString(),
		UserID:    user.ID,
		TokenHash: tokenHash,
		CreatedAt: now,
		ExpiresAt: now.Add(s.sessionTTL),
	}
	if _, err := s.auth.CreateSession(r.Context(), session); err != nil {
		return err
	}

	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName,
		Value:    rawToken,
		Path:     "/",
		HttpOnly: true,
		Secure:   shouldUseSecureCookie(r),
		SameSite: http.SameSiteLaxMode,
		Expires:  session.ExpiresAt,
		MaxAge:   int(s.sessionTTL.Seconds()),
	})
	return nil
}

func (s *Server) clearSessionCookie(w http.ResponseWriter, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     s.cookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
		Expires:  time.Unix(0, 0),
	})
}

func shouldUseSecureCookie(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(os.Getenv("SESSION_COOKIE_SECURE"), "true")
}

func normalizeEmail(email string) (string, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return "", errors.New("email is required")
	}
	if _, err := mail.ParseAddress(email); err != nil {
		return "", errors.New("invalid email")
	}
	return email, nil
}
