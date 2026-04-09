package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/provider"
	"github.com/swlee3306/infra-orch-studio/internal/storage"
)

type providerListResponse struct {
	Items        []provider.CloudConnection `json:"items"`
	DefaultCloud string                     `json:"default_cloud,omitempty"`
}

type providerUpsertRequest struct {
	Name              string            `json:"name"`
	AuthURL           string            `json:"auth_url"`
	RegionName        string            `json:"region_name"`
	Interface         string            `json:"interface"`
	IdentityInterface string            `json:"identity_interface"`
	Username          string            `json:"username"`
	Password          string            `json:"password"`
	ProjectName       string            `json:"project_name"`
	UserDomainName    string            `json:"user_domain_name"`
	ProjectDomainName string            `json:"project_domain_name"`
	EndpointOverride  map[string]string `json:"endpoint_override"`
}

func (s *Server) handleProviders(w http.ResponseWriter, r *http.Request, user domain.User) {
	switch r.Method {
	case http.MethodGet:
		s.handleProvidersList(w, r)
	case http.MethodPost:
		s.handleProvidersUpsert(w, r, user)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleProvidersList(w http.ResponseWriter, r *http.Request) {
	if s.providers != nil {
		items, err := s.providers.ListProviderConnections(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		cloudItems := make([]provider.CloudConnection, 0, len(items))
		for _, item := range items {
			cloudItems = append(cloudItems, provider.CloudConnection{
				Name:             item.Name,
				Region:           item.RegionName,
				AuthURL:          item.AuthURL,
				Interface:        item.Interface,
				IdentityIface:    item.IdentityInterface,
				EndpointOverride: item.EndpointOverride,
			})
		}
		defaultCloud := strings.TrimSpace(s.openstackDefaultCloud)
		if defaultCloud == "" && len(cloudItems) > 0 {
			defaultCloud = cloudItems[0].Name
		}
		writeJSON(w, http.StatusOK, providerListResponse{Items: cloudItems, DefaultCloud: defaultCloud})
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

func (s *Server) handleProvidersUpsert(w http.ResponseWriter, r *http.Request, user domain.User) {
	if !user.IsAdmin {
		writeError(w, http.StatusForbidden, "admin role required")
		return
	}
	if s.providers == nil {
		writeError(w, http.StatusServiceUnavailable, "provider store is not configured")
		return
	}
	var req providerUpsertRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.AuthURL = strings.TrimSpace(req.AuthURL)
	req.Interface = strings.TrimSpace(req.Interface)
	req.IdentityInterface = strings.TrimSpace(req.IdentityInterface)
	req.RegionName = strings.TrimSpace(req.RegionName)
	req.Username = strings.TrimSpace(req.Username)
	req.ProjectName = strings.TrimSpace(req.ProjectName)
	req.UserDomainName = strings.TrimSpace(req.UserDomainName)
	req.ProjectDomainName = strings.TrimSpace(req.ProjectDomainName)
	if req.Name == "" || req.AuthURL == "" || req.Username == "" || strings.TrimSpace(req.Password) == "" || req.ProjectName == "" {
		writeError(w, http.StatusBadRequest, "name, auth_url, username, password, and project_name are required")
		return
	}
	if req.Interface == "" {
		req.Interface = "internal"
	}
	if req.IdentityInterface == "" {
		req.IdentityInterface = req.Interface
	}
	if req.UserDomainName == "" {
		req.UserDomainName = "Default"
	}
	if req.ProjectDomainName == "" {
		req.ProjectDomainName = "Default"
	}
	now := time.Now().UTC()
	conn := domain.ProviderConnection{
		Name:              req.Name,
		AuthURL:           req.AuthURL,
		RegionName:        req.RegionName,
		Interface:         req.Interface,
		IdentityInterface: req.IdentityInterface,
		Username:          req.Username,
		Password:          req.Password,
		ProjectName:       req.ProjectName,
		UserDomainName:    req.UserDomainName,
		ProjectDomainName: req.ProjectDomainName,
		EndpointOverride:  req.EndpointOverride,
		CreatedByUserID:   user.ID,
		CreatedByEmail:    user.Email,
		CreatedAt:         now,
		UpdatedAt:         now,
	}
	saved, err := s.providers.UpsertProviderConnection(r.Context(), conn)
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	_, _ = s.jobs.CreateAuditEvent(r.Context(), domain.AuditEvent{
		ID:           uuid.NewString(),
		ResourceType: "provider",
		ResourceID:   saved.Name,
		Action:       "provider.connection.upserted",
		ActorUserID:  user.ID,
		ActorEmail:   user.Email,
		Message:      "provider connection was created or updated",
		MetadataJSON: auditMetadataJSON(map[string]any{
			"name":               saved.Name,
			"auth_url":           saved.AuthURL,
			"region_name":        saved.RegionName,
			"interface":          saved.Interface,
			"identity_interface": saved.IdentityInterface,
			"project_name":       saved.ProjectName,
		}),
		CreatedAt: now,
	})

	writeJSON(w, http.StatusCreated, provider.CloudConnection{
		Name:             saved.Name,
		Region:           saved.RegionName,
		AuthURL:          saved.AuthURL,
		Interface:        saved.Interface,
		IdentityIface:    saved.IdentityInterface,
		EndpointOverride: saved.EndpointOverride,
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
	if s.providers != nil {
		item, err := s.providers.GetProviderConnection(r.Context(), parts[0])
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) {
				http.Error(w, "provider not found", http.StatusNotFound)
				return
			}
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		svc := provider.NewWithClouds([]provider.CloudConfig{{
			Name:              item.Name,
			RegionName:        item.RegionName,
			Interface:         item.Interface,
			IdentityInterface: item.IdentityInterface,
			EndpointOverride:  item.EndpointOverride,
			Auth: provider.CloudAuth{
				AuthURL:           item.AuthURL,
				Username:          item.Username,
				Password:          item.Password,
				ProjectName:       item.ProjectName,
				UserDomainName:    item.UserDomainName,
				ProjectDomainName: item.ProjectDomainName,
			},
		}})
		result, err := svc.FetchCatalog(parts[0])
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadGateway)
			return
		}
		writeJSON(w, http.StatusOK, result)
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

func auditMetadataJSON(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return "{}"
	}
	return string(b)
}
