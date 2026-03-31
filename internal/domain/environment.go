package domain

// EnvironmentSpec is the provider-agnostic desired state for an Environment.
// It must not depend on OpenTofu/Terraform concepts.
//
// MVP scope:
// - one network
// - one subnet
// - 1..2 instances
// - optional security group references
type EnvironmentSpec struct {
	EnvironmentName string     `json:"environment_name"`
	TenantName      string     `json:"tenant_name"`
	Network         Network    `json:"network"`
	Subnet          Subnet     `json:"subnet"`
	Instances       []Instance `json:"instances"`
	SecurityGroups  []string   `json:"security_groups,omitempty"`
}

type Network struct {
	Name string `json:"name"`
	CIDR string `json:"cidr"`
}

type Subnet struct {
	Name       string `json:"name"`
	CIDR       string `json:"cidr"`
	GatewayIP  string `json:"gateway_ip,omitempty"`
	EnableDHCP bool   `json:"enable_dhcp"`
}

type Instance struct {
	Name       string `json:"name"`
	Image      string `json:"image"`
	Flavor     string `json:"flavor"`
	SSHKeyName string `json:"ssh_key_name,omitempty"`
	Count      int    `json:"count"`
}
