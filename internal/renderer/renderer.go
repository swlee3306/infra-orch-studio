package renderer

import (
	"fmt"
	"strings"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

// EnvironmentVars is the variable payload expected by templates/opentofu/environments/basic.
// It intentionally mirrors the OpenTofu template's variables.tf.
//
// The domain model remains OpenTofu-agnostic; this struct is part of the rendering layer.
type EnvironmentVars struct {
	EnvironmentName string `json:"environment_name"`

	Network struct {
		Name string `json:"name"`
		CIDR string `json:"cidr"`
	} `json:"network"`

	Subnet struct {
		Name       string `json:"name"`
		CIDR       string `json:"cidr"`
		GatewayIP  string `json:"gateway_ip,omitempty"`
		EnableDHCP bool   `json:"enable_dhcp"`
	} `json:"subnet"`

	Instances []struct {
		Name           string   `json:"name"`
		Image          string   `json:"image"`
		Flavor         string   `json:"flavor"`
		Count          int      `json:"count"`
		SSHKeyName     string   `json:"ssh_key_name,omitempty"`
		SecurityGroups []string `json:"security_groups"`
	} `json:"instances"`
}

func RenderEnvironmentVars(spec domain.EnvironmentSpec) (EnvironmentVars, error) {
	if strings.TrimSpace(spec.EnvironmentName) == "" {
		return EnvironmentVars{}, fmt.Errorf("environment_name is required")
	}

	var v EnvironmentVars
	v.EnvironmentName = strings.TrimSpace(spec.EnvironmentName)
	v.Network.Name = strings.TrimSpace(spec.Network.Name)
	v.Network.CIDR = strings.TrimSpace(spec.Network.CIDR)
	v.Subnet.Name = strings.TrimSpace(spec.Subnet.Name)
	v.Subnet.CIDR = strings.TrimSpace(spec.Subnet.CIDR)
	v.Subnet.GatewayIP = strings.TrimSpace(spec.Subnet.GatewayIP)
	v.Subnet.EnableDHCP = spec.Subnet.EnableDHCP

	v.Instances = make([]struct {
		Name           string   `json:"name"`
		Image          string   `json:"image"`
		Flavor         string   `json:"flavor"`
		Count          int      `json:"count"`
		SSHKeyName     string   `json:"ssh_key_name,omitempty"`
		SecurityGroups []string `json:"security_groups"`
	}, 0, len(spec.Instances))

	securityGroups := spec.SecurityGroups
	if securityGroups == nil {
		securityGroups = []string{}
	}
	renderedSecurityGroups := make([]string, 0, len(securityGroups))
	for _, group := range securityGroups {
		if trimmed := strings.TrimSpace(group); trimmed != "" {
			renderedSecurityGroups = append(renderedSecurityGroups, trimmed)
		}
	}
	for _, inst := range spec.Instances {
		v.Instances = append(v.Instances, struct {
			Name           string   `json:"name"`
			Image          string   `json:"image"`
			Flavor         string   `json:"flavor"`
			Count          int      `json:"count"`
			SSHKeyName     string   `json:"ssh_key_name,omitempty"`
			SecurityGroups []string `json:"security_groups"`
		}{
			Name:           strings.TrimSpace(inst.Name),
			Image:          strings.TrimSpace(inst.Image),
			Flavor:         strings.TrimSpace(inst.Flavor),
			Count:          inst.Count,
			SSHKeyName:     strings.TrimSpace(inst.SSHKeyName),
			SecurityGroups: append([]string{}, renderedSecurityGroups...),
		})
	}

	return v, nil
}
