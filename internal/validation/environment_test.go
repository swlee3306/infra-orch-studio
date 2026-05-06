package validation

import (
	"strings"
	"testing"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func TestValidateEnvironmentSpec(t *testing.T) {
	tests := []struct {
		name         string
		spec         domain.EnvironmentSpec
		wantContains string
	}{
		{
			name: "valid",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24", EnableDHCP: true},
				Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
			},
		},
		{
			name: "missing environment name",
			spec: domain.EnvironmentSpec{
				TenantName: "tenant-a",
				Network:    domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:     domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24"},
				Instances:  []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
			},
			wantContains: "environment_name is required",
		},
		{
			name: "blank instance fields",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24"},
				Instances:       []domain.Instance{{Name: " ", Image: "ubuntu", Flavor: "small", Count: 1}},
			},
			wantContains: "instances[0].name is required",
		},
		{
			name: "too many instances",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24"},
				Instances: []domain.Instance{
					{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1},
					{Name: "vm-b", Image: "ubuntu", Flavor: "small", Count: 1},
					{Name: "vm-c", Image: "ubuntu", Flavor: "small", Count: 1},
				},
			},
			wantContains: "instances supports up to 2 items in MVP",
		},
		{
			name: "zero count",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24"},
				Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 0}},
			},
			wantContains: "instances[0].count must be >= 1",
		},
		{
			name: "negative count",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24"},
				Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: -1}},
			},
			wantContains: "instances[0].count must be >= 1",
		},
		{
			name: "blank ssh key name",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24"},
				Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", SSHKeyName: " ", Count: 1}},
			},
			wantContains: "instances[0].ssh_key_name must not be blank",
		},
		{
			name: "too many total instances",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24"},
				Instances: []domain.Instance{
					{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 2},
					{Name: "vm-b", Image: "ubuntu", Flavor: "small", Count: 1},
				},
			},
			wantContains: "total instance count supports up to 2 in MVP",
		},
		{
			name: "invalid network cidr",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "not-a-cidr"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24"},
				Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
			},
			wantContains: "network.cidr must be a valid IPv4 CIDR",
		},
		{
			name: "invalid subnet cidr",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "2001:db8::/64"},
				Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
			},
			wantContains: "subnet.cidr must be a valid IPv4 CIDR",
		},
		{
			name: "subnet outside network",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.1.0/24"},
				Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
			},
			wantContains: "subnet.cidr must be within network.cidr",
		},
		{
			name: "invalid gateway ip",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24", GatewayIP: "not-an-ip"},
				Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
			},
			wantContains: "subnet.gateway_ip must be a valid IPv4 address",
		},
		{
			name: "gateway outside subnet",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/25", GatewayIP: "10.0.0.200"},
				Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
			},
			wantContains: "subnet.gateway_ip must be within subnet.cidr",
		},
		{
			name: "empty security group",
			spec: domain.EnvironmentSpec{
				EnvironmentName: "dev",
				TenantName:      "tenant-a",
				Network:         domain.Network{Name: "net-a", CIDR: "10.0.0.0/24"},
				Subnet:          domain.Subnet{Name: "sub-a", CIDR: "10.0.0.0/24"},
				Instances:       []domain.Instance{{Name: "vm-a", Image: "ubuntu", Flavor: "small", Count: 1}},
				SecurityGroups:  []string{"default", " "},
			},
			wantContains: "security_groups[1] must not be empty",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := ValidateEnvironmentSpec(tt.spec)
			if tt.wantContains == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantContains)
			}
			if !strings.Contains(err.Error(), tt.wantContains) {
				t.Fatalf("error = %q, want substring %q", err.Error(), tt.wantContains)
			}
		})
	}
}

func TestNormalizeEnvironmentSpecTrimsFields(t *testing.T) {
	spec := NormalizeEnvironmentSpec(domain.EnvironmentSpec{
		EnvironmentName: " env ",
		TenantName:      " tenant ",
		Network:         domain.Network{Name: " net ", CIDR: " 10.0.0.0/24 "},
		Subnet:          domain.Subnet{Name: " subnet ", CIDR: " 10.0.0.0/25 ", GatewayIP: " 10.0.0.1 "},
		Instances:       []domain.Instance{{Name: " vm ", Image: " id:image ", Flavor: " id:flavor ", SSHKeyName: " key ", Count: 1}},
		SecurityGroups:  []string{" default "},
	})

	if spec.EnvironmentName != "env" || spec.TenantName != "tenant" || spec.Network.Name != "net" || spec.Network.CIDR != "10.0.0.0/24" {
		t.Fatalf("top-level fields were not normalized: %+v", spec)
	}
	if spec.Subnet.Name != "subnet" || spec.Subnet.CIDR != "10.0.0.0/25" || spec.Subnet.GatewayIP != "10.0.0.1" {
		t.Fatalf("subnet fields were not normalized: %+v", spec.Subnet)
	}
	if got := spec.Instances[0]; got.Name != "vm" || got.Image != "id:image" || got.Flavor != "id:flavor" || got.SSHKeyName != "key" {
		t.Fatalf("instance fields were not normalized: %+v", got)
	}
	if got := spec.SecurityGroups; len(got) != 1 || got[0] != "default" {
		t.Fatalf("security groups were not normalized: %#v", got)
	}
}
