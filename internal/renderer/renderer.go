package renderer

import (
	"fmt"

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
		SecurityGroups []string `json:"security_groups,omitempty"`
	} `json:"instances"`
}

func RenderEnvironmentVars(spec domain.EnvironmentSpec) (EnvironmentVars, error) {
	if spec.EnvironmentName == "" {
		return EnvironmentVars{}, fmt.Errorf("environment_name is required")
	}

	var v EnvironmentVars
	v.EnvironmentName = spec.EnvironmentName
	v.Network.Name = spec.Network.Name
	v.Network.CIDR = spec.Network.CIDR
	v.Subnet.Name = spec.Subnet.Name
	v.Subnet.CIDR = spec.Subnet.CIDR
	v.Subnet.GatewayIP = spec.Subnet.GatewayIP
	v.Subnet.EnableDHCP = spec.Subnet.EnableDHCP

	v.Instances = make([]struct {
		Name           string   `json:"name"`
		Image          string   `json:"image"`
		Flavor         string   `json:"flavor"`
		Count          int      `json:"count"`
		SSHKeyName     string   `json:"ssh_key_name,omitempty"`
		SecurityGroups []string `json:"security_groups,omitempty"`
	}, 0, len(spec.Instances))

	for _, inst := range spec.Instances {
		v.Instances = append(v.Instances, struct {
			Name           string   `json:"name"`
			Image          string   `json:"image"`
			Flavor         string   `json:"flavor"`
			Count          int      `json:"count"`
			SSHKeyName     string   `json:"ssh_key_name,omitempty"`
			SecurityGroups []string `json:"security_groups,omitempty"`
		}{
			Name:           inst.Name,
			Image:          inst.Image,
			Flavor:         inst.Flavor,
			Count:          inst.Count,
			SSHKeyName:     inst.SSHKeyName,
			SecurityGroups: spec.SecurityGroups,
		})
	}

	return v, nil
}
