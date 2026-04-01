package api

import (
	"database/sql"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/validation"
)

type createJobRequest struct {
	Type        string                 `json:"type,omitempty"`
	Environment domain.EnvironmentSpec `json:"environment"`
}

func (s *Server) handleJobs(w http.ResponseWriter, r *http.Request, user domain.User) {
	switch r.Method {
	case http.MethodPost:
		var req createJobRequest
		if err := decodeJSON(r.Body, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		if err := validation.ValidateEnvironmentSpec(req.Environment); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		jobType := domain.JobTypeEnvironmentCreate
		if req.Type != "" {
			jobType = domain.JobType(req.Type)
		}
		switch jobType {
		case domain.JobTypeEnvironmentCreate, domain.JobTypePlan:
		case domain.JobTypeApply:
			writeError(w, http.StatusBadRequest, "apply must be triggered via POST /api/jobs/{id}/apply")
			return
		default:
			writeError(w, http.StatusBadRequest, "unsupported job type")
			return
		}

		now := time.Now().UTC()
		job := domain.Job{
			ID:          uuid.NewString(),
			Type:        jobType,
			Status:      domain.JobStatusQueued,
			CreatedAt:   now,
			UpdatedAt:   now,
			Environment: req.Environment,
		}
		created, err := s.jobs.CreateJob(r.Context(), job)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "create job failed")
			return
		}
		writeJSON(w, http.StatusCreated, created)

	case http.MethodGet:
		limit := 50
		if raw := r.URL.Query().Get("limit"); raw != "" {
			if n, err := strconv.Atoi(raw); err == nil {
				limit = n
			}
		}
		jobs, err := s.jobs.ListJobs(r.Context(), limit)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "list jobs failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": jobs, "viewer": user})

	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleJobRoute(w http.ResponseWriter, r *http.Request, user domain.User) {
	path := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	switch {
	case strings.HasSuffix(path, "/apply"):
		if !user.IsAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		s.handleApply(w, r)
	default:
		s.handleJob(w, r)
	}
}

func (s *Server) handleJob(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	if id == "" || strings.Contains(id, "/") {
		writeError(w, http.StatusBadRequest, "invalid job id")
		return
	}

	job, err := s.jobs.GetJob(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "job not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "get job failed")
		return
	}
	writeJSON(w, http.StatusOK, job)
}

func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	path := strings.TrimPrefix(r.URL.Path, "/api/jobs/")
	path = strings.TrimSuffix(path, "/apply")
	id := strings.TrimSuffix(path, "/")
	if id == "" || strings.Contains(id, "/") {
		writeError(w, http.StatusBadRequest, "invalid job id")
		return
	}

	src, err := s.jobs.GetJob(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "source job not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "load source job failed")
		return
	}
	if src.Type != domain.JobTypePlan {
		writeError(w, http.StatusBadRequest, "source job must be type tofu.plan")
		return
	}
	if src.Status != domain.JobStatusDone {
		writeError(w, http.StatusBadRequest, "source job must be done before apply")
		return
	}
	if src.PlanPath == "" || src.Workdir == "" {
		writeError(w, http.StatusBadRequest, "source job has no plan artifact")
		return
	}

	now := time.Now().UTC()
	job := domain.Job{
		ID:           uuid.NewString(),
		Type:         domain.JobTypeApply,
		Status:       domain.JobStatusQueued,
		CreatedAt:    now,
		UpdatedAt:    now,
		Environment:  src.Environment,
		TemplateName: src.TemplateName,
		Workdir:      src.Workdir,
		PlanPath:     src.PlanPath,
		SourceJobID:  src.ID,
	}
	created, err := s.jobs.CreateJob(r.Context(), job)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create apply job failed")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}
