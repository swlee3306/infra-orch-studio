package api

import (
	"database/sql"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

type reviewSignal struct {
	Label    string `json:"label"`
	Detail   string `json:"detail"`
	Severity string `json:"severity"`
}

type impactSummary struct {
	Downtime    string `json:"downtime"`
	BlastRadius string `json:"blast_radius"`
	CostDelta   string `json:"cost_delta"`
}

func (s *Server) handleEnvironmentPlanReview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id, err := environmentActionID(r.URL.Path, "plan-review")
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

	var planJob *domain.Job
	if env.LastPlanJobID != "" {
		job, err := s.jobs.GetJob(r.Context(), env.LastPlanJobID)
		if err == nil {
			planJob = &job
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"review_signals": buildReviewSignals(env.Spec, string(env.Operation), planJob),
		"impact_summary": buildImpactSummary(env.Spec, string(env.Operation)),
		"plan_job":       planJob,
	})
}

func summarizeSpec(spec domain.EnvironmentSpec) (instanceTotal int, securityGroupTotal int, subnetCapacityWarning bool) {
	for _, item := range spec.Instances {
		instanceTotal += item.Count
	}
	securityGroupTotal = len(spec.SecurityGroups)
	subnetCapacityWarning = strings.HasSuffix(spec.Subnet.CIDR, "/26") ||
		strings.HasSuffix(spec.Subnet.CIDR, "/27") ||
		strings.HasSuffix(spec.Subnet.CIDR, "/28")
	return
}

func buildReviewSignals(spec domain.EnvironmentSpec, operation string, planJob *domain.Job) []reviewSignal {
	instanceTotal, _, subnetCapacityWarning := summarizeSpec(spec)
	items := make([]reviewSignal, 0, 5)

	if operation == string(domain.EnvironmentOperationDestroy) {
		items = append(items, reviewSignal{
			Label:    "Destroy operation",
			Detail:   "This plan is destructive and will require an explicit confirmation before it should be approved.",
			Severity: "high",
		})
	}
	if instanceTotal >= 4 {
		items = append(items, reviewSignal{
			Label:    "Large instance footprint",
			Detail:   fmt.Sprintf("%d instances are requested, which increases rollout time and blast radius.", instanceTotal),
			Severity: "medium",
		})
	}
	if subnetCapacityWarning {
		items = append(items, reviewSignal{
			Label:    "Subnet capacity pressure",
			Detail:   fmt.Sprintf("Subnet %s suggests limited remaining address space for future changes.", spec.Subnet.CIDR),
			Severity: "high",
		})
	}
	if len(spec.SecurityGroups) == 0 {
		items = append(items, reviewSignal{
			Label:    "Security references missing",
			Detail:   "No security groups are attached. Validate tenant baseline inheritance before apply.",
			Severity: "high",
		})
	} else {
		items = append(items, reviewSignal{
			Label:    "Security references inherited",
			Detail:   fmt.Sprintf("%s will be included in the resulting environment state.", strings.Join(spec.SecurityGroups, ", ")),
			Severity: "low",
		})
	}

	templateName := "basic"
	if planJob != nil && planJob.TemplateName != "" {
		templateName = planJob.TemplateName
	}
	items = append(items, reviewSignal{
		Label:    "Template-backed plan",
		Detail:   fmt.Sprintf("Network %s and subnet %s will be rendered through template %s.", spec.Network.Name, spec.Subnet.Name, templateName),
		Severity: "low",
	})

	return items
}

func buildImpactSummary(spec domain.EnvironmentSpec, operation string) impactSummary {
	instanceTotal, securityGroupTotal, _ := summarizeSpec(spec)
	downtime := "Low"
	if operation == string(domain.EnvironmentOperationDestroy) {
		downtime = "High"
	} else if instanceTotal >= 4 {
		downtime = "Medium"
	}

	costDelta := fmt.Sprintf("Estimated footprint includes %d instances and %d security references.", instanceTotal, securityGroupTotal)
	if operation == string(domain.EnvironmentOperationDestroy) {
		costDelta = "Negative spend delta expected after destroy is applied."
	}

	return impactSummary{
		Downtime:    downtime,
		BlastRadius: fmt.Sprintf("%s / %s / %s", orDash(spec.TenantName), orDash(spec.Network.Name), orDash(spec.Subnet.Name)),
		CostDelta:   costDelta,
	}
}

func orDash(value string) string {
	if value == "" {
		return "-"
	}
	return value
}
