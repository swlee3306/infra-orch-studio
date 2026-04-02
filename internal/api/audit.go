package api

import (
	"net/http"
	"strconv"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func (s *Server) handleAuditFeed(w http.ResponseWriter, r *http.Request, user domain.User) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	limit := 100
	if raw := r.URL.Query().Get("limit"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil {
			if n > 500 {
				n = 500
			}
			if n > 0 {
				limit = n
			}
		}
	}

	resourceType := r.URL.Query().Get("resource_type")
	resourceID := r.URL.Query().Get("resource_id")
	items, err := s.jobs.ListAuditEvents(r.Context(), resourceType, resourceID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list audit feed failed")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"items":         items,
		"viewer":        user,
		"resource_type": resourceType,
		"resource_id":   resourceID,
		"limit":         limit,
	})
}
