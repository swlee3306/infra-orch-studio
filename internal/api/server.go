package api

import (
	"log"
	"net/http"
	"strings"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/storage"
)

type Config struct {
	JobStore              storage.Store
	AuthStore             storage.AuthStore
	CookieName            string
	SessionTTL            time.Duration
	AllowedOrigins        []string
	TemplatesRoot         string
	ModulesRoot           string
	AllowPublicSignup     bool
	OpenStackConfigPath   string
	OpenStackDefaultCloud string
}

type Server struct {
	mux                   *http.ServeMux
	jobs                  storage.Store
	auth                  storage.AuthStore
	cookieName            string
	sessionTTL            time.Duration
	allowedOrigins        map[string]struct{}
	templatesRoot         string
	modulesRoot           string
	allowPublicSignup     bool
	openstackConfigPath   string
	openstackDefaultCloud string
}

func NewServer(cfg Config) *Server {
	cookieName := cfg.CookieName
	if cookieName == "" {
		cookieName = "infra_orch_session"
	}
	sessionTTL := cfg.SessionTTL
	if sessionTTL <= 0 {
		sessionTTL = 7 * 24 * time.Hour
	}
	origins := cfg.AllowedOrigins
	if len(origins) == 0 {
		origins = []string{"http://localhost:5173", "http://127.0.0.1:5173"}
	}

	s := &Server{
		jobs:                  cfg.JobStore,
		auth:                  cfg.AuthStore,
		cookieName:            cookieName,
		sessionTTL:            sessionTTL,
		allowedOrigins:        make(map[string]struct{}, len(origins)),
		templatesRoot:         cfg.TemplatesRoot,
		modulesRoot:           cfg.ModulesRoot,
		allowPublicSignup:     cfg.AllowPublicSignup,
		openstackConfigPath:   cfg.OpenStackConfigPath,
		openstackDefaultCloud: cfg.OpenStackDefaultCloud,
	}
	for _, origin := range origins {
		origin = strings.TrimSpace(origin)
		if origin == "" {
			continue
		}
		s.allowedOrigins[origin] = struct{}{}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/healthz", s.handleHealthz)
	mux.HandleFunc("/api/public-config", s.handlePublicConfig)
	mux.HandleFunc("/api/auth/signup", s.handleSignup)
	mux.HandleFunc("/api/auth/login", s.handleLogin)
	mux.HandleFunc("/api/auth/logout", s.handleLogout)
	mux.Handle("/api/auth/me", s.withAuth(s.handleMe))
	mux.Handle("/api/admin/users", s.withAuth(s.handleAdminUsers))
	mux.Handle("/api/admin/users/", s.withAuth(s.handleAdminUserRoute))
	mux.Handle("/api/audit", s.withAuth(s.handleAuditFeed))
	mux.Handle("/api/request-drafts", s.withAuth(s.handleRequestDrafts))
	mux.Handle("/api/environments/plan-review-preview", s.withAuth(s.handlePlanReviewPreview))
	mux.Handle("/api/environments", s.withAuth(s.handleEnvironments))
	mux.Handle("/api/environments/", s.withAuth(s.handleEnvironmentRoute))
	mux.Handle("/api/templates", s.withAuth(s.handleTemplates))
	mux.Handle("/api/templates/", s.withAuth(s.handleTemplateRoute))
	mux.Handle("/api/providers", s.withAuth(s.handleProviders))
	mux.Handle("/api/providers/", s.withAuth(s.handleProviderRoute))
	mux.Handle("/api/jobs", s.withAuth(s.handleJobs))
	mux.Handle("/api/jobs/", s.withAuth(s.handleJobRoute))
	mux.Handle("/ws", s.withAuth(s.handleWS))
	s.mux = mux

	return s
}

func (s *Server) ListenAndServe(addr string) error {
	log.Printf("api listening on %s", addr)
	return http.ListenAndServe(addr, s.withCORS(s.mux))
}
