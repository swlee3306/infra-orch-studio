package renderer

import (
	"encoding/json"
	"testing"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func TestRenderEnvironmentVarsIncludesEmptySecurityGroups(t *testing.T) {
	vars, err := RenderEnvironmentVars(domain.EnvironmentSpec{
		EnvironmentName: "smoke-env",
		Network:         domain.Network{Name: "net", CIDR: "10.0.0.0/24"},
		Subnet:          domain.Subnet{Name: "subnet", CIDR: "10.0.0.0/24", EnableDHCP: true},
		Instances:       []domain.Instance{{Name: "vm", Image: "ubuntu", Flavor: "small", Count: 1}},
	})
	if err != nil {
		t.Fatalf("RenderEnvironmentVars: %v", err)
	}
	payload, err := json.Marshal(vars)
	if err != nil {
		t.Fatalf("marshal vars: %v", err)
	}
	if !json.Valid(payload) {
		t.Fatalf("invalid json: %s", string(payload))
	}
	var decoded struct {
		Instances []struct {
			SecurityGroups []string `json:"security_groups"`
		} `json:"instances"`
	}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("unmarshal vars: %v", err)
	}
	if len(decoded.Instances) != 1 {
		t.Fatalf("instances = %d, want 1", len(decoded.Instances))
	}
	if decoded.Instances[0].SecurityGroups == nil {
		t.Fatalf("security_groups should be an empty array, not null or omitted: %s", string(payload))
	}
}

func TestRenderEnvironmentVarsTrimsOpenStackInputs(t *testing.T) {
	vars, err := RenderEnvironmentVars(domain.EnvironmentSpec{
		EnvironmentName: " smoke-env ",
		Network:         domain.Network{Name: " net ", CIDR: " 10.0.0.0/24 "},
		Subnet:          domain.Subnet{Name: " subnet ", CIDR: " 10.0.0.0/24 ", GatewayIP: " 10.0.0.1 ", EnableDHCP: true},
		Instances:       []domain.Instance{{Name: " vm ", Image: " id:image-1 ", Flavor: " id:flavor-1 ", SSHKeyName: " demo-key ", Count: 1}},
		SecurityGroups:  []string{" default ", ""},
	})
	if err != nil {
		t.Fatalf("RenderEnvironmentVars: %v", err)
	}
	if vars.EnvironmentName != "smoke-env" || vars.Network.Name != "net" || vars.Subnet.GatewayIP != "10.0.0.1" {
		t.Fatalf("top-level fields were not trimmed: %+v", vars)
	}
	if got := vars.Instances[0]; got.Name != "vm" || got.Image != "id:image-1" || got.Flavor != "id:flavor-1" || got.SSHKeyName != "demo-key" {
		t.Fatalf("instance fields were not trimmed: %+v", got)
	}
	if got := vars.Instances[0].SecurityGroups; len(got) != 1 || got[0] != "default" {
		t.Fatalf("security groups = %#v, want [default]", got)
	}
}

func TestRenderEnvironmentVarsRejectsBlankEnvironmentName(t *testing.T) {
	if _, err := RenderEnvironmentVars(domain.EnvironmentSpec{EnvironmentName: " "}); err == nil {
		t.Fatalf("expected blank environment name to be rejected")
	}
}
