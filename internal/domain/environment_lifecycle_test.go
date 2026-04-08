package domain

import "testing"

func TestCanQueuePlan(t *testing.T) {
	tests := []struct {
		name      string
		status    EnvironmentStatus
		operation EnvironmentOperation
		want      bool
	}{
		{name: "create from draft", status: EnvironmentStatusDraft, operation: EnvironmentOperationCreate, want: true},
		{name: "create from destroyed", status: EnvironmentStatusDestroyed, operation: EnvironmentOperationCreate, want: true},
		{name: "create from active denied", status: EnvironmentStatusActive, operation: EnvironmentOperationCreate, want: false},
		{name: "update from active", status: EnvironmentStatusActive, operation: EnvironmentOperationUpdate, want: true},
		{name: "update from draft denied", status: EnvironmentStatusDraft, operation: EnvironmentOperationUpdate, want: false},
		{name: "busy denied", status: EnvironmentStatusApplying, operation: EnvironmentOperationUpdate, want: false},
		{name: "destroy denied in plan endpoint", status: EnvironmentStatusActive, operation: EnvironmentOperationDestroy, want: false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := CanQueuePlan(tc.status, tc.operation); got != tc.want {
				t.Fatalf("CanQueuePlan(%s, %s) = %v, want %v", tc.status, tc.operation, got, tc.want)
			}
		})
	}
}

func TestCanApproveAndApply(t *testing.T) {
	if !CanApprovePlan(EnvironmentStatusPendingApproval, ApprovalStatusPending) {
		t.Fatalf("expected pending approval state to be approvable")
	}
	if CanApprovePlan(EnvironmentStatusApproved, ApprovalStatusApproved) {
		t.Fatalf("approved state must not be approvable")
	}
	if !CanQueueApply(EnvironmentStatusApproved, ApprovalStatusApproved, EnvironmentOperationUpdate) {
		t.Fatalf("expected approved update to be apply-eligible")
	}
	if CanQueueApply(EnvironmentStatusApplying, ApprovalStatusApproved, EnvironmentOperationUpdate) {
		t.Fatalf("applying state must not be apply-eligible")
	}
	if CanQueueApply(EnvironmentStatusApproved, ApprovalStatusApproved, EnvironmentOperation("")) {
		t.Fatalf("empty operation must not be apply-eligible")
	}
}

func TestCanQueueDestroyAndRetry(t *testing.T) {
	if !CanQueueDestroy(EnvironmentStatusActive) {
		t.Fatalf("active environment should allow destroy queueing")
	}
	if CanQueueDestroy(EnvironmentStatusPlanning) {
		t.Fatalf("planning environment must block destroy queueing")
	}
	if CanQueueDestroy(EnvironmentStatusDestroyed) {
		t.Fatalf("destroyed environment must block destroy queueing")
	}
	if !CanRetry(EnvironmentStatusFailed) {
		t.Fatalf("failed environment should allow retry")
	}
	if CanRetry(EnvironmentStatusActive) {
		t.Fatalf("active environment must not allow retry")
	}
}
