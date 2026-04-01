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
