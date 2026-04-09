package api

import (
	"net/http"
	"os"
	"strings"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/provider"
)

type providerListResponse struct {
	Items        []provider.CloudConnection `json:"items"`
	DefaultCloud string                     `json:"default_cloud,omitempty"`
}

func (s *Server) handleProviders(w http.ResponseWriter, r *http.Request, _ domain.User) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if strings.TrimSpace(s.openstackConfigPath) == "" {
		http.Error(w, "openstack config path is not configured", http.StatusServiceUnavailable)
		return
	}
	if _, err := os.Stat(s.openstackConfigPath); err != nil {
		http.Error(w, "openstack clouds file is not available", http.StatusServiceUnavailable)
		return
	}
	svc := provider.New(s.openstackConfigPath)
	items, err := svc.ListClouds()
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, providerListResponse{
		Items:        items,
		DefaultCloud: s.openstackDefaultCloud,
	})
}

func (s *Server) handleProviderRoute(w http.ResponseWriter, r *http.Request, _ domain.User) {
	path := strings.TrimPrefix(r.URL.Path, "/api/providers/")
	parts := strings.Split(path, "/")
	if len(parts) != 2 || parts[1] != "resources" || strings.TrimSpace(parts[0]) == "" {
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	if strings.TrimSpace(s.openstackConfigPath) == "" {
		http.Error(w, "openstack config path is not configured", http.StatusServiceUnavailable)
		return
	}
	svc := provider.New(s.openstackConfigPath)
	result, err := svc.FetchCatalog(parts[0])
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadGateway)
		return
	}
	writeJSON(w, http.StatusOK, result)
}
