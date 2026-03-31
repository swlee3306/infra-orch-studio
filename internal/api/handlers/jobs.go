package handlers

import (
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/storage"
	"github.com/swlee3306/infra-orch-studio/internal/validation"
)

type createJobRequest struct {
	Environment domain.EnvironmentSpec `json:"environment"`
}

// JobsCollection handles /jobs.
//
// MVP:
// - POST /jobs : create an environment.create job
// - GET  /jobs?limit=50 : list jobs
func JobsCollection(store storage.Store) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodPost:
			var req createJobRequest
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				writeError(w, http.StatusBadRequest, "invalid json")
				return
			}
			if err := validation.ValidateEnvironmentSpec(req.Environment); err != nil {
				writeError(w, http.StatusBadRequest, err.Error())
				return
			}

			now := time.Now().UTC()
			j := domain.Job{
				ID:          uuid.NewString(),
				Type:        domain.JobTypeEnvironmentCreate,
				Status:      domain.JobStatusQueued,
				CreatedAt:   now,
				UpdatedAt:   now,
				Environment: req.Environment,
			}
			created, err := store.CreateJob(r.Context(), j)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "create job failed")
				return
			}
			writeJSON(w, http.StatusCreated, created)
			return

		case http.MethodGet:
			limit := 50
			if s := r.URL.Query().Get("limit"); s != "" {
				if n, err := strconv.Atoi(s); err == nil {
					limit = n
				}
			}
			jobs, err := store.ListJobs(r.Context(), limit)
			if err != nil {
				writeError(w, http.StatusInternalServerError, "list jobs failed")
				return
			}
			writeJSON(w, http.StatusOK, map[string]any{"items": jobs})
			return

		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
	})
}

// JobsItem handles /jobs/{id}.
func JobsItem(store storage.Store) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/jobs/")
		if id == "" || strings.Contains(id, "/") {
			writeError(w, http.StatusBadRequest, "invalid job id")
			return
		}

		j, err := store.GetJob(r.Context(), id)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, http.StatusNotFound, "job not found")
				return
			}
			writeError(w, http.StatusInternalServerError, "get job failed")
			return
		}
		writeJSON(w, http.StatusOK, j)
	})
}
