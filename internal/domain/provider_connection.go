package domain

import "time"

type ProviderConnection struct {
	Name              string
	AuthURL           string
	RegionName        string
	Interface         string
	IdentityInterface string
	Username          string
	Password          string
	ProjectName       string
	UserDomainName    string
	ProjectDomainName string
	EndpointOverride  map[string]string
	CreatedByUserID   string
	CreatedByEmail    string
	CreatedAt         time.Time
	UpdatedAt         time.Time
}
