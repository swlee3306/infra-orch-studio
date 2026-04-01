package validation

import (
	"fmt"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func ValidateEnvironmentSpec(s domain.EnvironmentSpec) error {
	if s.EnvironmentName == "" {
		return fmt.Errorf("environment_name is required")
	}
	if s.TenantName == "" {
		return fmt.Errorf("tenant_name is required")
	}
	if s.Network.Name == "" {
		return fmt.Errorf("network.name is required")
	}
	if s.Subnet.Name == "" {
		return fmt.Errorf("subnet.name is required")
	}
	if len(s.Instances) == 0 {
		return fmt.Errorf("instances must have at least 1 item")
	}
	if len(s.Instances) > 2 {
		return fmt.Errorf("instances supports up to 2 items in MVP")
	}
	for i, inst := range s.Instances {
		if inst.Name == "" {
			return fmt.Errorf("instances[%d].name is required", i)
		}
		if inst.Image == "" {
			return fmt.Errorf("instances[%d].image is required", i)
		}
		if inst.Flavor == "" {
			return fmt.Errorf("instances[%d].flavor is required", i)
		}
		if inst.Count <= 0 {
			return fmt.Errorf("instances[%d].count must be >= 1", i)
		}
	}
	if s.Network.CIDR == "" {
		return fmt.Errorf("network.cidr is required")
	}
	if s.Subnet.CIDR == "" {
		return fmt.Errorf("subnet.cidr is required")
	}
	return nil
}
