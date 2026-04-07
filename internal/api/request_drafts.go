package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

type requestDraftRequest struct {
	Prompt string `json:"prompt"`
}

type requestDraftResponse struct {
	Prompt         string                 `json:"prompt"`
	TemplateName   string                 `json:"template_name"`
	Spec           domain.EnvironmentSpec `json:"spec"`
	Assumptions    []string               `json:"assumptions"`
	Warnings       []string               `json:"warnings"`
	NextStep       string                 `json:"next_step"`
	RequiresReview bool                   `json:"requires_review"`
}

var (
	instanceCountPattern = regexp.MustCompile(`(?i)\b(\d+)\s*(instances|instance|vms|vm|servers|server|nodes|node)\b`)
	cidrPattern          = regexp.MustCompile(`\b\d{1,3}(?:\.\d{1,3}){3}/\d{1,2}\b`)
	namedPattern         = regexp.MustCompile(`(?i)\b(?:named|name)\s+([a-z0-9][a-z0-9-_]*)\b`)
	tenantPattern        = regexp.MustCompile(`(?i)\btenant\s+([a-z0-9][a-z0-9-_]*)\b`)
)

func (s *Server) handleRequestDrafts(w http.ResponseWriter, r *http.Request, _ domain.User) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	var req requestDraftRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid json")
		return
	}
	prompt := strings.TrimSpace(req.Prompt)
	if prompt == "" {
		writeError(w, http.StatusBadRequest, "prompt is required")
		return
	}

	resp := buildRequestDraft(prompt)
	writeJSON(w, http.StatusOK, resp)
}

func buildRequestDraft(prompt string) requestDraftResponse {
	spec := domain.EnvironmentSpec{
		EnvironmentName: "chat-draft-env",
		TenantName:      "tenant-shared-01",
		Network:         domain.Network{Name: "vnet-chat-01", CIDR: "10.30.0.0/24"},
		Subnet:          domain.Subnet{Name: "snet-chat-01", CIDR: "10.30.0.0/25", GatewayIP: "10.30.0.1", EnableDHCP: true},
		Instances: []domain.Instance{{
			Name:       "app-01",
			Image:      "ubuntu-22.04",
			Flavor:     "m1.medium",
			SSHKeyName: "default",
			Count:      1,
		}},
		SecurityGroups: []string{"sg-web"},
	}
	templateName := "basic"
	assumptions := []string{
		"The request draft is generated from deterministic parsing and platform defaults.",
		"The generated draft still requires plan review and approval before apply.",
	}
	warnings := []string{}

	lower := strings.ToLower(prompt)

	if tenant := extractPatternValue(prompt, tenantPattern); tenant != "" {
		spec.TenantName = slugify(tenant)
	} else {
		assumptions = append(assumptions, "Tenant was not explicit, so tenant-shared-01 was used.")
	}

	if envName := extractPatternValue(prompt, namedPattern); envName != "" {
		spec.EnvironmentName = slugify(envName)
		spec.Instances[0].Name = instanceBaseName(spec.EnvironmentName)
		spec.Network.Name = "vnet-" + suffixName(spec.EnvironmentName)
		spec.Subnet.Name = "snet-" + suffixName(spec.EnvironmentName)
	} else {
		if tenant := spec.TenantName; tenant != "" && tenant != "tenant-shared-01" {
			spec.EnvironmentName = "env-" + suffixName(tenant)
			spec.Instances[0].Name = instanceBaseName(spec.EnvironmentName)
			spec.Network.Name = "vnet-" + suffixName(spec.EnvironmentName)
			spec.Subnet.Name = "snet-" + suffixName(spec.EnvironmentName)
		} else {
			assumptions = append(assumptions, "Environment name was not explicit, so a generic draft name was used.")
		}
	}

	if match := instanceCountPattern.FindStringSubmatch(lower); len(match) > 1 {
		if count, err := strconv.Atoi(match[1]); err == nil && count > 0 {
			spec.Instances[0].Count = count
		}
	}

	switch {
	case strings.Contains(lower, "small"):
		spec.Instances[0].Flavor = "m1.small"
	case strings.Contains(lower, "large"):
		spec.Instances[0].Flavor = "m1.large"
	case strings.Contains(lower, "xlarge"):
		spec.Instances[0].Flavor = "m1.xlarge"
	case strings.Contains(lower, "medium"):
		spec.Instances[0].Flavor = "m1.medium"
	}

	switch {
	case strings.Contains(lower, "rocky"):
		spec.Instances[0].Image = "rocky-9"
	case strings.Contains(lower, "centos"):
		spec.Instances[0].Image = "centos-9"
	case strings.Contains(lower, "ubuntu"):
		spec.Instances[0].Image = "ubuntu-22.04"
	}

	if strings.Contains(lower, "db") || strings.Contains(lower, "database") {
		spec.SecurityGroups = appendUnique(spec.SecurityGroups, "sg-data")
	}
	if strings.Contains(lower, "internal") {
		spec.SecurityGroups = appendUnique(spec.SecurityGroups, "sg-internal")
	}
	if strings.Contains(lower, "public") || strings.Contains(lower, "internet") || strings.Contains(lower, "web") {
		spec.SecurityGroups = appendUnique(spec.SecurityGroups, "sg-web")
	}

	cidrs := cidrPattern.FindAllString(prompt, -1)
	if len(cidrs) >= 1 {
		spec.Network.CIDR = cidrs[0]
	}
	if len(cidrs) >= 2 {
		spec.Subnet.CIDR = cidrs[1]
		spec.Subnet.GatewayIP = firstIP(cidrs[1])
	}
	if len(cidrs) == 1 {
		assumptions = append(assumptions, "Only one CIDR was provided, so subnet CIDR kept the platform default.")
	}

	if strings.Contains(lower, "custom") {
		templateName = "basic"
		warnings = append(warnings, "Custom wording was detected, but the draft still maps to the current basic template contract.")
	}
	if strings.Contains(lower, "prod") || strings.Contains(lower, "production") {
		warnings = append(warnings, "Production-like wording detected. Validate blast radius and approval context carefully.")
	}
	if spec.Instances[0].Count >= 4 {
		warnings = append(warnings, fmt.Sprintf("%d instances were inferred. Review capacity and blast radius before approval.", spec.Instances[0].Count))
	}

	return requestDraftResponse{
		Prompt:         prompt,
		TemplateName:   templateName,
		Spec:           spec,
		Assumptions:    assumptions,
		Warnings:       warnings,
		NextStep:       "Apply the generated draft to the wizard, then continue through plan review and approval.",
		RequiresReview: true,
	}
}

func extractPatternValue(prompt string, pattern *regexp.Regexp) string {
	match := pattern.FindStringSubmatch(prompt)
	if len(match) < 2 {
		return ""
	}
	return strings.TrimSpace(match[1])
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	lastDash := false
	for _, r := range value {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash {
			b.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		return "chat-draft-env"
	}
	return out
}

func suffixName(value string) string {
	parts := strings.Split(slugify(value), "-")
	if len(parts) == 0 {
		return "chat-01"
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return strings.Join(parts[len(parts)-2:], "-")
}

func instanceBaseName(environmentName string) string {
	base := slugify(environmentName)
	if base == "" {
		return "app-01"
	}
	return base + "-01"
}

func appendUnique(items []string, value string) []string {
	for _, item := range items {
		if item == value {
			return items
		}
	}
	return append(items, value)
}

func firstIP(cidr string) string {
	parts := strings.Split(cidr, "/")
	if len(parts) == 0 {
		return ""
	}
	ipParts := strings.Split(parts[0], ".")
	if len(ipParts) != 4 {
		return ""
	}
	ipParts[3] = "1"
	return strings.Join(ipParts, ".")
}
