package api

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
)

type createEnvironmentRequest struct {
	Spec         domain.EnvironmentSpec `json:"spec"`
	TemplateName string                 `json:"template_name,omitempty"`
}

type planEnvironmentRequest struct {
	Spec         *domain.EnvironmentSpec     `json:"spec,omitempty"`
	TemplateName string                      `json:"template_name,omitempty"`
	Operation    domain.EnvironmentOperation `json:"operation,omitempty"`
}

func (s *Server) handleEnvironments(w http.ResponseWriter, r *http.Request, user domain.User) {
	switch r.Method {
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
		items, err := s.jobs.ListEnvironments(r.Context(), limit)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "list environments failed")
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items, "viewer": user})
	case http.MethodPost:
		var req createEnvironmentRequest
		if err := decodeJSON(r.Body, &req); err != nil {
			writeError(w, http.StatusBadRequest, "invalid json")
			return
		}
		if err := validateEnvironmentSpecStrict(req.Spec); err != nil {
			writeError(w, http.StatusBadRequest, err.Error())
			return
		}

		now := time.Now().UTC()
		env := domain.Environment{
			ID:              uuid.NewString(),
			Name:            req.Spec.EnvironmentName,
			Status:          domain.EnvironmentStatusPlanning,
			Operation:       domain.EnvironmentOperationCreate,
			ApprovalStatus:  domain.ApprovalStatusNotRequested,
			Spec:            req.Spec,
			CreatedByUserID: user.ID,
			CreatedByEmail:  user.Email,
			MaxRetries:      3,
			CreatedAt:       now,
			UpdatedAt:       now,
		}
		createdEnv, err := s.jobs.CreateEnvironment(r.Context(), env)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "create environment failed")
			return
		}
		job := newEnvironmentPlanJob(createdEnv, req.TemplateName, user.Email, now)
		createdJob, err := s.jobs.CreateJob(r.Context(), job)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "create plan job failed")
			return
		}
		createdEnv.LastPlanJobID = createdJob.ID
		createdEnv.LastJobID = createdJob.ID
		createdEnv.UpdatedAt = time.Now().UTC()
		createdEnv, err = s.jobs.UpdateEnvironment(r.Context(), createdEnv)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "update environment failed")
			return
		}
		s.recordAudit(r, user, "environment", createdEnv.ID, "environment.created", "environment created and initial plan queued", map[string]any{
			"job_id": createdJob.ID,
		})
		writeJSON(w, http.StatusCreated, map[string]any{"environment": createdEnv, "job": createdJob})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleEnvironmentRoute(w http.ResponseWriter, r *http.Request, user domain.User) {
	path := strings.TrimPrefix(r.URL.Path, "/api/environments/")
	switch {
	case strings.HasSuffix(path, "/plan"):
		s.handleEnvironmentPlan(w, r, user)
	case strings.HasSuffix(path, "/approve"):
		if !user.IsAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		s.handleEnvironmentApprove(w, r, user)
	case strings.HasSuffix(path, "/apply"):
		if !user.IsAdmin {
			writeError(w, http.StatusForbidden, "admin access required")
			return
		}
		s.handleEnvironmentApply(w, r, user)
	case strings.HasSuffix(path, "/retry"):
		s.handleEnvironmentRetry(w, r, user)
	case strings.HasSuffix(path, "/destroy"):
		s.handleEnvironmentDestroy(w, r, user)
	case strings.HasSuffix(path, "/audit"):
		s.handleEnvironmentAudit(w, r)
	default:
		s.handleEnvironmentGet(w, r)
	}
}

func (s *Server) handleEnvironmentGet(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id, err := environmentActionID(r.URL.Path, "")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	env, err := s.jobs.GetEnvironment(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "environment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "get environment failed")
		return
	}
	writeJSON(w, http.StatusOK, env)
}

func (s *Server) handleEnvironmentPlan(w http.ResponseWriter, r *http.Request, user domain.User) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id, err := environmentActionID(r.URL.Path, "plan")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	env, err := s.jobs.GetEnvironment(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "environment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "load environment failed")
		return
	}

	var req planEnvironmentRequest
	if r.Body != nil {
		_ = decodeJSON(r.Body, &req)
	}
	if req.Spec != nil {
		env.Spec = *req.Spec
	}
	if err := validateEnvironmentSpecStrict(env.Spec); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	operation := req.Operation
	if operation == "" {
		if env.Status == domain.EnvironmentStatusDraft || env.Status == domain.EnvironmentStatusDestroyed {
			operation = domain.EnvironmentOperationCreate
		} else {
			operation = domain.EnvironmentOperationUpdate
		}
	}

	now := time.Now().UTC()
	env.Name = env.Spec.EnvironmentName
	env.Operation = operation
	env.Status = domain.EnvironmentStatusPlanning
	env.ApprovalStatus = domain.ApprovalStatusNotRequested
	env.ApprovedAt = nil
	env.ApprovedByEmail = ""
	env.ApprovedByUserID = ""
	env.LastError = ""
	env.UpdatedAt = now
	job := newEnvironmentPlanJob(env, req.TemplateName, user.Email, now)
	createdJob, err := s.jobs.CreateJob(r.Context(), job)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create plan job failed")
		return
	}
	env.LastPlanJobID = createdJob.ID
	env.LastJobID = createdJob.ID
	updatedEnv, err := s.jobs.UpdateEnvironment(r.Context(), env)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update environment failed")
		return
	}
	s.recordAudit(r, user, "environment", env.ID, "environment.plan_requested", "environment plan queued", map[string]any{
		"job_id":    createdJob.ID,
		"operation": operation,
	})
	writeJSON(w, http.StatusCreated, map[string]any{"environment": updatedEnv, "job": createdJob})
}

func (s *Server) handleEnvironmentApprove(w http.ResponseWriter, r *http.Request, user domain.User) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id, err := environmentActionID(r.URL.Path, "approve")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	env, err := s.jobs.GetEnvironment(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "environment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "load environment failed")
		return
	}
	if env.LastPlanJobID == "" {
		writeError(w, http.StatusBadRequest, "environment has no plan to approve")
		return
	}
	job, err := s.jobs.GetJob(r.Context(), env.LastPlanJobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "load plan job failed")
		return
	}
	if job.Status != domain.JobStatusDone {
		writeError(w, http.StatusBadRequest, "plan job must be done before approval")
		return
	}
	now := time.Now().UTC()
	env.ApprovalStatus = domain.ApprovalStatusApproved
	env.Status = domain.EnvironmentStatusApproved
	env.ApprovedByUserID = user.ID
	env.ApprovedByEmail = user.Email
	env.ApprovedAt = &now
	env.UpdatedAt = now
	env, err = s.jobs.UpdateEnvironment(r.Context(), env)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update environment failed")
		return
	}
	s.recordAudit(r, user, "environment", env.ID, "environment.approved", "plan approved for apply", map[string]any{
		"plan_job_id": env.LastPlanJobID,
	})
	writeJSON(w, http.StatusOK, env)
}

func (s *Server) handleEnvironmentApply(w http.ResponseWriter, r *http.Request, user domain.User) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id, err := environmentActionID(r.URL.Path, "apply")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	env, err := s.jobs.GetEnvironment(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "environment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "load environment failed")
		return
	}
	if env.ApprovalStatus != domain.ApprovalStatusApproved {
		writeError(w, http.StatusBadRequest, "plan approval is required before apply")
		return
	}
	planJob, err := s.jobs.GetJob(r.Context(), env.LastPlanJobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "load plan job failed")
		return
	}
	if planJob.Status != domain.JobStatusDone || planJob.PlanPath == "" || planJob.Workdir == "" {
		writeError(w, http.StatusBadRequest, "approved plan artifact is not ready")
		return
	}
	now := time.Now().UTC()
	job := domain.Job{
		ID:            uuid.NewString(),
		Type:          domain.JobTypeApply,
		Status:        domain.JobStatusQueued,
		CreatedAt:     now,
		UpdatedAt:     now,
		EnvironmentID: env.ID,
		Operation:     env.Operation,
		Environment:   env.Spec,
		TemplateName:  planJob.TemplateName,
		Workdir:       planJob.Workdir,
		PlanPath:      planJob.PlanPath,
		SourceJobID:   planJob.ID,
		MaxRetries:    env.MaxRetries,
		RequestedBy:   user.Email,
	}
	createdJob, err := s.jobs.CreateJob(r.Context(), job)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create apply job failed")
		return
	}
	env.Status = domain.EnvironmentStatusApplying
	env.LastApplyJobID = createdJob.ID
	env.LastJobID = createdJob.ID
	env.UpdatedAt = now
	env, err = s.jobs.UpdateEnvironment(r.Context(), env)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update environment failed")
		return
	}
	s.recordAudit(r, user, "environment", env.ID, "environment.apply_requested", "apply queued from approved plan", map[string]any{
		"job_id": createdJob.ID,
	})
	writeJSON(w, http.StatusCreated, map[string]any{"environment": env, "job": createdJob})
}

func (s *Server) handleEnvironmentRetry(w http.ResponseWriter, r *http.Request, user domain.User) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id, err := environmentActionID(r.URL.Path, "retry")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	env, err := s.jobs.GetEnvironment(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "environment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "load environment failed")
		return
	}
	if env.LastJobID == "" {
		writeError(w, http.StatusBadRequest, "environment has no job to retry")
		return
	}
	lastJob, err := s.jobs.GetJob(r.Context(), env.LastJobID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "load last job failed")
		return
	}
	if lastJob.Status != domain.JobStatusFailed {
		writeError(w, http.StatusBadRequest, "last job is not failed")
		return
	}
	if env.RetryCount >= env.MaxRetries {
		writeError(w, http.StatusBadRequest, "environment retry budget exhausted")
		return
	}
	now := time.Now().UTC()
	retryJob := lastJob
	retryJob.ID = uuid.NewString()
	retryJob.Status = domain.JobStatusQueued
	retryJob.CreatedAt = now
	retryJob.UpdatedAt = now
	retryJob.Error = ""
	retryJob.RetryCount = lastJob.RetryCount + 1
	retryJob.RequestedBy = user.Email
	createdJob, err := s.jobs.CreateJob(r.Context(), retryJob)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create retry job failed")
		return
	}
	env.RetryCount++
	env.LastJobID = createdJob.ID
	if createdJob.Type == domain.JobTypeApply {
		env.Status = domain.EnvironmentStatusApplying
	} else {
		env.Status = domain.EnvironmentStatusPlanning
	}
	env.LastError = ""
	env.UpdatedAt = now
	env, err = s.jobs.UpdateEnvironment(r.Context(), env)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update environment failed")
		return
	}
	s.recordAudit(r, user, "environment", env.ID, "environment.retry_requested", "retry queued for failed job", map[string]any{
		"job_id": createdJob.ID,
	})
	writeJSON(w, http.StatusCreated, map[string]any{"environment": env, "job": createdJob})
}

func (s *Server) handleEnvironmentDestroy(w http.ResponseWriter, r *http.Request, user domain.User) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id, err := environmentActionID(r.URL.Path, "destroy")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	env, err := s.jobs.GetEnvironment(r.Context(), id)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, http.StatusNotFound, "environment not found")
			return
		}
		writeError(w, http.StatusInternalServerError, "load environment failed")
		return
	}
	now := time.Now().UTC()
	env.Operation = domain.EnvironmentOperationDestroy
	env.Status = domain.EnvironmentStatusPlanning
	env.ApprovalStatus = domain.ApprovalStatusNotRequested
	env.ApprovedAt = nil
	env.ApprovedByEmail = ""
	env.ApprovedByUserID = ""
	env.LastError = ""
	env.UpdatedAt = now
	job := newEnvironmentPlanJob(env, "", user.Email, now)
	createdJob, err := s.jobs.CreateJob(r.Context(), job)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "create destroy plan failed")
		return
	}
	env.LastPlanJobID = createdJob.ID
	env.LastJobID = createdJob.ID
	env, err = s.jobs.UpdateEnvironment(r.Context(), env)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "update environment failed")
		return
	}
	s.recordAudit(r, user, "environment", env.ID, "environment.destroy_requested", "destroy plan queued", map[string]any{
		"job_id": createdJob.ID,
	})
	writeJSON(w, http.StatusCreated, map[string]any{"environment": env, "job": createdJob})
}

func (s *Server) handleEnvironmentAudit(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id, err := environmentActionID(r.URL.Path, "audit")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	items, err := s.jobs.ListAuditEvents(r.Context(), "environment", id, 100)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "list audit events failed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}

func newEnvironmentPlanJob(env domain.Environment, templateName, requestedBy string, now time.Time) domain.Job {
	if templateName == "" {
		templateName = "basic"
	}
	return domain.Job{
		ID:            uuid.NewString(),
		Type:          domain.JobTypePlan,
		Status:        domain.JobStatusQueued,
		CreatedAt:     now,
		UpdatedAt:     now,
		EnvironmentID: env.ID,
		Operation:     env.Operation,
		Environment:   env.Spec,
		TemplateName:  templateName,
		MaxRetries:    env.MaxRetries,
		RequestedBy:   requestedBy,
	}
}

func environmentActionID(path, action string) (string, error) {
	path = strings.TrimPrefix(path, "/api/environments/")
	if action != "" {
		path = strings.TrimSuffix(path, "/"+action)
	}
	id := strings.TrimSuffix(path, "/")
	if id == "" || strings.Contains(id, "/") {
		return "", errors.New("invalid environment id")
	}
	return id, nil
}

func (s *Server) recordAudit(r *http.Request, user domain.User, resourceType, resourceID, action, message string, metadata map[string]any) {
	now := time.Now().UTC()
	metadataJSON := ""
	if len(metadata) > 0 {
		if b, err := json.Marshal(metadata); err == nil {
			metadataJSON = string(b)
		}
	}
	_, _ = s.jobs.CreateAuditEvent(r.Context(), domain.AuditEvent{
		ID:           uuid.NewString(),
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Action:       action,
		ActorUserID:  user.ID,
		ActorEmail:   user.Email,
		Message:      message,
		MetadataJSON: metadataJSON,
		CreatedAt:    now,
	})
}
