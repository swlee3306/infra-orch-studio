package api

import (
	"database/sql"
	"net/http"
	"strings"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/security"
)

type authedHandler func(http.ResponseWriter, *http.Request, domain.User)

func (s *Server) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := strings.TrimSpace(r.Header.Get("Origin"))
		if origin != "" {
			if _, ok := s.allowedOrigins[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
				w.Header().Set("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
			}
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (s *Server) withAuth(fn authedHandler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, user, err := s.sessionFromRequest(r)
		if err != nil {
			if err == sql.ErrNoRows {
				writeError(w, http.StatusUnauthorized, "authentication required")
				return
			}
			writeError(w, http.StatusInternalServerError, "authenticate session failed")
			return
		}
		fn(w, r, user)
	})
}

func (s *Server) sessionFromRequest(r *http.Request) (domain.Session, domain.User, error) {
	cookie, err := r.Cookie(s.cookieName)
	if err != nil {
		return domain.Session{}, domain.User{}, sql.ErrNoRows
	}
	tokenHash := security.HashToken(cookie.Value)
	return s.auth.GetSessionWithUser(r.Context(), tokenHash)
}
