package domain

func IsEnvironmentBusy(status EnvironmentStatus) bool {
	switch status {
	case EnvironmentStatusPlanning, EnvironmentStatusApplying, EnvironmentStatusDestroying:
		return true
	default:
		return false
	}
}

func CanQueuePlan(status EnvironmentStatus, operation EnvironmentOperation) bool {
	if IsEnvironmentBusy(status) {
		return false
	}
	switch operation {
	case EnvironmentOperationCreate:
		return status == EnvironmentStatusDraft || status == EnvironmentStatusDestroyed
	case EnvironmentOperationUpdate:
		return status != EnvironmentStatusDraft && status != EnvironmentStatusDestroyed
	default:
		return false
	}
}

func CanApprovePlan(status EnvironmentStatus, approval ApprovalStatus) bool {
	return status == EnvironmentStatusPendingApproval && approval == ApprovalStatusPending
}

func CanQueueApply(status EnvironmentStatus, approval ApprovalStatus, operation EnvironmentOperation) bool {
	if status != EnvironmentStatusApproved || approval != ApprovalStatusApproved {
		return false
	}
	switch operation {
	case EnvironmentOperationCreate, EnvironmentOperationUpdate, EnvironmentOperationDestroy:
		return true
	default:
		return false
	}
}

func CanQueueDestroy(status EnvironmentStatus) bool {
	return !IsEnvironmentBusy(status) && status != EnvironmentStatusDestroyed
}

func CanRetry(status EnvironmentStatus) bool {
	return status == EnvironmentStatusFailed
}
