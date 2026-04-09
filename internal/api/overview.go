package api

import (
	"net/http"
	"sort"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

type overviewFailure struct {
	ID        string                   `json:"id"`
	Name      string                   `json:"name"`
	Status    domain.EnvironmentStatus `json:"status"`
	LastError string                   `json:"last_error"`
	UpdatedAt time.Time                `json:"updated_at"`
}

type overviewResponse struct {
	EnvironmentsTotal    int               `json:"environments_total"`
	PendingApproval      int               `json:"pending_approval"`
	ApprovedWaitingApply int               `json:"approved_waiting_apply"`
	Applying             int               `json:"applying"`
	Failed               int               `json:"failed"`
	Active               int               `json:"active"`
	Destroyed            int               `json:"destroyed"`
	RecentFailures       []overviewFailure `json:"recent_failures"`
}

func maxInt() int {
	return int(^uint(0) >> 1)
}

func (s *Server) handleOverview(w http.ResponseWriter, r *http.Request, _ domain.User) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	items, err := s.jobs.ListEnvironments(r.Context(), maxInt())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list environments failed")
		return
	}

	overview := overviewResponse{
		EnvironmentsTotal: len(items),
	}
	recentFailures := make([]overviewFailure, 0, 5)
	for _, env := range items {
		switch env.Status {
		case domain.EnvironmentStatusPendingApproval:
			overview.PendingApproval++
		case domain.EnvironmentStatusApproved:
			overview.ApprovedWaitingApply++
		case domain.EnvironmentStatusApplying:
			overview.Applying++
		case domain.EnvironmentStatusFailed:
			overview.Failed++
			recentFailures = append(recentFailures, overviewFailure{
				ID:        env.ID,
				Name:      env.Name,
				Status:    env.Status,
				LastError: env.LastError,
				UpdatedAt: env.UpdatedAt.UTC(),
			})
		case domain.EnvironmentStatusActive:
			overview.Active++
		case domain.EnvironmentStatusDestroyed:
			overview.Destroyed++
		}
	}

	sort.Slice(recentFailures, func(i, j int) bool {
		if recentFailures[i].UpdatedAt.Equal(recentFailures[j].UpdatedAt) {
			return recentFailures[i].ID < recentFailures[j].ID
		}
		return recentFailures[i].UpdatedAt.After(recentFailures[j].UpdatedAt)
	})
	if len(recentFailures) > 5 {
		recentFailures = recentFailures[:5]
	}
	overview.RecentFailures = recentFailures

	writeJSON(w, http.StatusOK, overview)
}
