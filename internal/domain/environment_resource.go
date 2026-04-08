package domain

import "time"

type EnvironmentOperation string

type EnvironmentStatus string

type ApprovalStatus string

const (
	EnvironmentOperationCreate  EnvironmentOperation = "create"
	EnvironmentOperationUpdate  EnvironmentOperation = "update"
	EnvironmentOperationDestroy EnvironmentOperation = "destroy"
)

const (
	EnvironmentStatusDraft           EnvironmentStatus = "draft"
	EnvironmentStatusPlanning        EnvironmentStatus = "planning"
	EnvironmentStatusPendingApproval EnvironmentStatus = "pending_approval"
	EnvironmentStatusApproved        EnvironmentStatus = "approved"
	EnvironmentStatusApplying        EnvironmentStatus = "applying"
	EnvironmentStatusActive          EnvironmentStatus = "active"
	EnvironmentStatusDestroying      EnvironmentStatus = "destroying"
	EnvironmentStatusDestroyed       EnvironmentStatus = "destroyed"
	EnvironmentStatusFailed          EnvironmentStatus = "failed"
)

const (
	ApprovalStatusNotRequested ApprovalStatus = "not_requested"
	ApprovalStatusPending      ApprovalStatus = "pending"
	ApprovalStatusApproved     ApprovalStatus = "approved"
)

type Environment struct {
	ID               string               `json:"id"`
	Name             string               `json:"name"`
	Status           EnvironmentStatus    `json:"status"`
	Operation        EnvironmentOperation `json:"operation"`
	ApprovalStatus   ApprovalStatus       `json:"approval_status"`
	Spec             EnvironmentSpec      `json:"spec"`
	CreatedByUserID  string               `json:"created_by_user_id,omitempty"`
	CreatedByEmail   string               `json:"created_by_email,omitempty"`
	ApprovedByUserID string               `json:"approved_by_user_id,omitempty"`
	ApprovedByEmail  string               `json:"approved_by_email,omitempty"`
	ApprovedAt       *time.Time           `json:"approved_at,omitempty"`
	LastPlanJobID    string               `json:"last_plan_job_id,omitempty"`
	LastApplyJobID   string               `json:"last_apply_job_id,omitempty"`
	LastJobID        string               `json:"last_job_id,omitempty"`
	LastError        string               `json:"last_error,omitempty"`
	RetryCount       int                  `json:"retry_count,omitempty"`
	MaxRetries       int                  `json:"max_retries,omitempty"`
	Workdir          string               `json:"workdir,omitempty"`
	PlanPath         string               `json:"plan_path,omitempty"`
	OutputsJSON      string               `json:"outputs_json,omitempty"`
	Revision         int                  `json:"revision,omitempty"`
	CreatedAt        time.Time            `json:"created_at"`
	UpdatedAt        time.Time            `json:"updated_at"`
}
