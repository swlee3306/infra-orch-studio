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
		if err := validateEnvironmentSpecStrict(req.Environment); err != nil {
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
			Operation:   domain.EnvironmentOperationCreate,
			Environment: req.Environment,
			MaxRetries:  3,
			RequestedBy: user.Email,
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
				if n > 200 {
					n = 200
				}
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
	case strings.HasSuffix(path, "/plan"):
		s.handlePlan(w, r)
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

func (s *Server) handlePlan(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	id, err := jobActionID(r.URL.Path, "plan")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
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
	if err := validateEnvironmentSpecStrict(src.Environment); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	now := time.Now().UTC()
	job := buildDerivedJob(src, domain.JobTypePlan, now)
	created, err := s.jobs.CreateJob(r.Context(), job)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create plan job failed")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handleApply(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	id, err := jobActionID(r.URL.Path, "apply")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
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
	if src.EnvironmentID != "" {
		writeError(w, http.StatusBadRequest, "environment-managed plans must be applied via POST /api/environments/{id}/apply")
		return
	}
	if err := validateEnvironmentSpecStrict(src.Environment); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	now := time.Now().UTC()
	job := buildDerivedJob(src, domain.JobTypeApply, now)
	created, err := s.jobs.CreateJob(r.Context(), job)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create apply job failed")
		return
	}
	writeJSON(w, http.StatusCreated, created)
}

func jobActionID(path, action string) (string, error) {
	path = strings.TrimPrefix(path, "/api/jobs/")
	path = strings.TrimSuffix(path, "/"+action)
	id := strings.TrimSuffix(path, "/")
	if id == "" || strings.Contains(id, "/") {
		return "", errors.New("invalid job id")
	}
	return id, nil
}

func buildDerivedJob(src domain.Job, jobType domain.JobType, now time.Time) domain.Job {
	job := domain.Job{
		ID:            uuid.NewString(),
		Type:          jobType,
		Status:        domain.JobStatusQueued,
		CreatedAt:     now,
		UpdatedAt:     now,
		EnvironmentID: src.EnvironmentID,
		Operation:     src.Operation,
		Environment:   src.Environment,
		TemplateName:  src.TemplateName,
		MaxRetries:    src.MaxRetries,
		RequestedBy:   src.RequestedBy,
	}

	switch jobType {
	case domain.JobTypePlan:
		job.SourceJobID = src.ID
	case domain.JobTypeApply:
		job.Workdir = src.Workdir
		job.PlanPath = src.PlanPath
		job.SourceJobID = src.ID
	}

	return job
}

func validateEnvironmentSpecStrict(spec domain.EnvironmentSpec) error {
	if spec.Network.CIDR == "" {
		return errors.New("network.cidr is required")
	}
	if spec.Subnet.CIDR == "" {
		return errors.New("subnet.cidr is required")
	}
	return nil
}
