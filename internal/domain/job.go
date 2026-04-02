package domain

import "time"

type JobType string

type JobStatus string

const (
	JobTypeEnvironmentCreate  JobType = "environment.create"
	JobTypeEnvironmentUpdate  JobType = "environment.update"
	JobTypeEnvironmentDestroy JobType = "environment.destroy"
	JobTypePlan               JobType = "tofu.plan"
	JobTypeApply              JobType = "tofu.apply"
)

const (
	JobStatusQueued  JobStatus = "queued"
	JobStatusRunning JobStatus = "running"
	JobStatusDone    JobStatus = "done"
	JobStatusFailed  JobStatus = "failed"
)

// Job is the unit of work executed by runner.
//
// For MVP, we keep Job intentionally small; we'll evolve it as runner/executor come online.
type Job struct {
	ID        string    `json:"id"`
	Type      JobType   `json:"type"`
	Status    JobStatus `json:"status"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`

	EnvironmentID string               `json:"environment_id,omitempty"`
	Operation     EnvironmentOperation `json:"operation,omitempty"`
	Environment   EnvironmentSpec      `json:"environment"`

	// Rendering/execution metadata (Phase 5+).
	TemplateName string `json:"template_name,omitempty"`
	Workdir      string `json:"workdir,omitempty"`
	LogDir       string `json:"log_dir,omitempty"`

	// Artifacts (Phase 6+).
	PlanPath    string `json:"plan_path,omitempty"`
	OutputsJSON string `json:"outputs_json,omitempty"`

	// Links (Phase 7+). For derived jobs, SourceJobID points to the source job.
	SourceJobID string `json:"source_job_id,omitempty"`
	RetryCount  int    `json:"retry_count,omitempty"`
	MaxRetries  int    `json:"max_retries,omitempty"`
	RequestedBy string `json:"requested_by,omitempty"`

	// Result pointers. In Phase 6+ we will store logs/plan/output references here.
	Error string `json:"error,omitempty"`
}
