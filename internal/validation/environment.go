package validation

import (
	"fmt"
	"net/netip"
	"strings"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func NormalizeEnvironmentSpec(s domain.EnvironmentSpec) domain.EnvironmentSpec {
	s.EnvironmentName = strings.TrimSpace(s.EnvironmentName)
	s.TenantName = strings.TrimSpace(s.TenantName)
	s.Network.Name = strings.TrimSpace(s.Network.Name)
	s.Network.CIDR = strings.TrimSpace(s.Network.CIDR)
	s.Subnet.Name = strings.TrimSpace(s.Subnet.Name)
	s.Subnet.CIDR = strings.TrimSpace(s.Subnet.CIDR)
	s.Subnet.GatewayIP = strings.TrimSpace(s.Subnet.GatewayIP)
	for i := range s.Instances {
		s.Instances[i].Name = strings.TrimSpace(s.Instances[i].Name)
		s.Instances[i].Image = strings.TrimSpace(s.Instances[i].Image)
		s.Instances[i].Flavor = strings.TrimSpace(s.Instances[i].Flavor)
		s.Instances[i].SSHKeyName = strings.TrimSpace(s.Instances[i].SSHKeyName)
	}
	for i := range s.SecurityGroups {
		s.SecurityGroups[i] = strings.TrimSpace(s.SecurityGroups[i])
	}
	return s
}

func ValidateEnvironmentSpec(s domain.EnvironmentSpec) error {
	if strings.TrimSpace(s.EnvironmentName) == "" {
		return fmt.Errorf("environment_name is required")
	}
	if strings.TrimSpace(s.TenantName) == "" {
		return fmt.Errorf("tenant_name is required")
	}
	if strings.TrimSpace(s.Network.Name) == "" {
		return fmt.Errorf("network.name is required")
	}
	if strings.TrimSpace(s.Subnet.Name) == "" {
		return fmt.Errorf("subnet.name is required")
	}
	if len(s.Instances) == 0 {
		return fmt.Errorf("instances must have at least 1 item")
	}
	if len(s.Instances) > 2 {
		return fmt.Errorf("instances supports up to 2 items in MVP")
	}
	totalCount := 0
	for i, inst := range s.Instances {
		if strings.TrimSpace(inst.Name) == "" {
			return fmt.Errorf("instances[%d].name is required", i)
		}
		if strings.TrimSpace(inst.Image) == "" {
			return fmt.Errorf("instances[%d].image is required", i)
		}
		if strings.TrimSpace(inst.Flavor) == "" {
			return fmt.Errorf("instances[%d].flavor is required", i)
		}
		if inst.Count <= 0 {
			return fmt.Errorf("instances[%d].count must be >= 1", i)
		}
		if inst.SSHKeyName != "" && strings.TrimSpace(inst.SSHKeyName) == "" {
			return fmt.Errorf("instances[%d].ssh_key_name must not be blank", i)
		}
		totalCount += inst.Count
	}
	if totalCount > 2 {
		return fmt.Errorf("total instance count supports up to 2 in MVP")
	}
	if strings.TrimSpace(s.Network.CIDR) == "" {
		return fmt.Errorf("network.cidr is required")
	}
	networkPrefix, err := parseIPv4CIDR(s.Network.CIDR, "network.cidr")
	if err != nil {
		return err
	}
	if strings.TrimSpace(s.Subnet.CIDR) == "" {
		return fmt.Errorf("subnet.cidr is required")
	}
	subnetPrefix, err := parseIPv4CIDR(s.Subnet.CIDR, "subnet.cidr")
	if err != nil {
		return err
	}
	if !networkPrefix.Contains(subnetPrefix.Addr()) || subnetPrefix.Bits() < networkPrefix.Bits() {
		return fmt.Errorf("subnet.cidr must be within network.cidr")
	}
	if strings.TrimSpace(s.Subnet.GatewayIP) != "" {
		gateway, err := netip.ParseAddr(strings.TrimSpace(s.Subnet.GatewayIP))
		if err != nil || !gateway.Is4() {
			return fmt.Errorf("subnet.gateway_ip must be a valid IPv4 address")
		}
		if !subnetPrefix.Contains(gateway) {
			return fmt.Errorf("subnet.gateway_ip must be within subnet.cidr")
		}
	}
	for i, group := range s.SecurityGroups {
		if strings.TrimSpace(group) == "" {
			return fmt.Errorf("security_groups[%d] must not be empty", i)
		}
	}
	return nil
}

func parseIPv4CIDR(value, field string) (netip.Prefix, error) {
	prefix, err := netip.ParsePrefix(strings.TrimSpace(value))
	if err != nil || !prefix.Addr().Is4() {
		return netip.Prefix{}, fmt.Errorf("%s must be a valid IPv4 CIDR", field)
	}
	return prefix.Masked(), nil
}
