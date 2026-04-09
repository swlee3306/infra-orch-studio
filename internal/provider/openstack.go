package provider

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

type CloudConnection struct {
	Name             string            `json:"name"`
	Region           string            `json:"region,omitempty"`
	AuthURL          string            `json:"auth_url"`
	Interface        string            `json:"interface,omitempty"`
	IdentityIface    string            `json:"identity_interface,omitempty"`
	EndpointOverride map[string]string `json:"endpoint_override,omitempty"`
}

type CloudConfig struct {
	Name              string
	RegionName        string
	Interface         string
	IdentityInterface string
	EndpointOverride  map[string]string
	Auth              CloudAuth
}

type CloudAuth struct {
	AuthURL           string
	Username          string
	Password          string
	ProjectName       string
	ProjectID         string
	UserDomainName    string
	ProjectDomainName string
}

type Catalog struct {
	Provider       string           `json:"provider"`
	FetchedAt      time.Time        `json:"fetched_at"`
	Images         []string         `json:"images"`
	Flavors        []string         `json:"flavors"`
	Networks       []string         `json:"networks"`
	Instances      []string         `json:"instances"`
	ImageDetails   []ResourceDetail `json:"image_details,omitempty"`
	FlavorDetails  []ResourceDetail `json:"flavor_details,omitempty"`
	NetworkDetails []ResourceDetail `json:"network_details,omitempty"`
	InstanceDetails []ResourceDetail `json:"instance_details,omitempty"`
	Errors         []string         `json:"errors,omitempty"`
}

type ResourceDetail struct {
	ID         string            `json:"id"`
	Name       string            `json:"name"`
	Attributes map[string]string `json:"attributes,omitempty"`
}

type Service struct {
	path   string
	clouds map[string]cloudEntry
}

func New(path string) *Service {
	return &Service{path: path}
}

func NewWithClouds(configs []CloudConfig) *Service {
	clouds := make(map[string]cloudEntry, len(configs))
	for _, item := range configs {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			continue
		}
		clouds[name] = cloudEntry{
			RegionName:        strings.TrimSpace(item.RegionName),
			IdentityAPIVer:    3,
			Interface:         strings.TrimSpace(item.Interface),
			IdentityInterface: strings.TrimSpace(item.IdentityInterface),
			EndpointOverride:  item.EndpointOverride,
			Auth: cloudAuth{
				AuthURL:           strings.TrimSpace(item.Auth.AuthURL),
				Username:          strings.TrimSpace(item.Auth.Username),
				Password:          item.Auth.Password,
				ProjectName:       strings.TrimSpace(item.Auth.ProjectName),
				ProjectID:         strings.TrimSpace(item.Auth.ProjectID),
				UserDomainName:    strings.TrimSpace(item.Auth.UserDomainName),
				ProjectDomainName: strings.TrimSpace(item.Auth.ProjectDomainName),
			},
		}
	}
	return &Service{clouds: clouds}
}

func (s *Service) ListClouds() ([]CloudConnection, error) {
	clouds, err := s.loadCloudMap()
	if err != nil {
		return nil, err
	}
	out := make([]CloudConnection, 0, len(clouds))
	for name, c := range clouds {
		out = append(out, CloudConnection{
			Name:             name,
			Region:           c.RegionName,
			AuthURL:          strings.TrimSpace(c.Auth.AuthURL),
			Interface:        strings.TrimSpace(c.Interface),
			IdentityIface:    strings.TrimSpace(c.IdentityInterface),
			EndpointOverride: c.EndpointOverride,
		})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Name < out[j].Name })
	return out, nil
}

func (s *Service) FetchCatalog(cloudName string) (Catalog, error) {
	clouds, err := s.loadCloudMap()
	if err != nil {
		return Catalog{}, err
	}
	cloud, ok := clouds[cloudName]
	if !ok {
		return Catalog{}, fmt.Errorf("cloud %q not found in %s", cloudName, s.path)
	}
	token, endpoints, err := authenticate(cloud)
	if err != nil {
		return Catalog{}, err
	}

	c := Catalog{
		Provider:  cloudName,
		FetchedAt: time.Now().UTC(),
	}
	addErr := func(err error) {
		if err == nil {
			return
		}
		c.Errors = append(c.Errors, err.Error())
	}

	if items, err := fetchImageDetails(token, cloud, endpoints); err != nil {
		addErr(fmt.Errorf("images: %w", err))
	} else {
		c.ImageDetails = items
		c.Images = namesFromDetails(items)
	}
	if items, err := fetchFlavorDetails(token, cloud, endpoints); err != nil {
		addErr(fmt.Errorf("flavors: %w", err))
	} else {
		c.FlavorDetails = items
		c.Flavors = namesFromDetails(items)
	}
	if items, err := fetchNetworkDetails(token, cloud, endpoints); err != nil {
		addErr(fmt.Errorf("networks: %w", err))
	} else {
		c.NetworkDetails = items
		c.Networks = namesFromDetails(items)
	}
	if items, err := fetchInstanceDetails(token, cloud, endpoints); err != nil {
		addErr(fmt.Errorf("instances: %w", err))
	} else {
		c.InstanceDetails = items
		c.Instances = namesFromDetails(items)
	}
	return c, nil
}

func (s *Service) loadCloudMap() (map[string]cloudEntry, error) {
	if len(s.clouds) > 0 {
		return s.clouds, nil
	}
	parsed, err := loadCloudsFile(s.path)
	if err != nil {
		return nil, err
	}
	return parsed.Clouds, nil
}

type cloudsFile struct {
	Clouds map[string]cloudEntry `yaml:"clouds"`
}

type cloudEntry struct {
	RegionName        string            `yaml:"region_name"`
	IdentityAPIVer    int               `yaml:"identity_api_version"`
	Interface         string            `yaml:"interface"`
	IdentityInterface string            `yaml:"identity_interface"`
	EndpointOverride  map[string]string `yaml:"endpoint_override"`
	Auth              cloudAuth         `yaml:"auth"`
}

type cloudAuth struct {
	AuthURL           string `yaml:"auth_url"`
	Username          string `yaml:"username"`
	Password          string `yaml:"password"`
	ProjectName       string `yaml:"project_name"`
	ProjectID         string `yaml:"project_id"`
	UserDomainName    string `yaml:"user_domain_name"`
	ProjectDomainName string `yaml:"project_domain_name"`
}

func loadCloudsFile(path string) (cloudsFile, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return cloudsFile{}, fmt.Errorf("read clouds file: %w", err)
	}
	var out cloudsFile
	if err := yaml.Unmarshal(b, &out); err != nil {
		return cloudsFile{}, fmt.Errorf("parse clouds yaml: %w", err)
	}
	if len(out.Clouds) == 0 {
		return cloudsFile{}, fmt.Errorf("no cloud entries in %s", path)
	}
	return out, nil
}

type endpointMap map[string]string

func authenticate(cloud cloudEntry) (string, endpointMap, error) {
	authURL := strings.TrimSpace(cloud.Auth.AuthURL)
	if authURL == "" {
		return "", nil, fmt.Errorf("auth_url is required")
	}
	authURL = strings.TrimRight(authURL, "/")
	if !strings.HasSuffix(authURL, "/v3") {
		authURL += "/v3"
	}
	target := authURL + "/auth/tokens"
	body := map[string]any{
		"auth": map[string]any{
			"identity": map[string]any{
				"methods": []string{"password"},
				"password": map[string]any{
					"user": map[string]any{
						"name":     cloud.Auth.Username,
						"password": cloud.Auth.Password,
						"domain": map[string]string{
							"name": defaultIfEmpty(cloud.Auth.UserDomainName, "Default"),
						},
					},
				},
			},
			"scope": map[string]any{
				"project": map[string]any{
					"name": defaultIfEmpty(cloud.Auth.ProjectName, cloud.Auth.ProjectID),
					"domain": map[string]string{
						"name": defaultIfEmpty(cloud.Auth.ProjectDomainName, "Default"),
					},
				},
			},
		},
	}
	b, _ := json.Marshal(body)
	req, _ := http.NewRequest(http.MethodPost, target, bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", nil, err
	}
	defer resp.Body.Close()
	payload, _ := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", nil, fmt.Errorf("keystone auth %d: %s", resp.StatusCode, strings.TrimSpace(string(payload)))
	}
	token := resp.Header.Get("X-Subject-Token")
	if token == "" {
		return "", nil, fmt.Errorf("missing X-Subject-Token in keystone response")
	}

	var parsed struct {
		Token struct {
			Catalog []struct {
				Type      string `json:"type"`
				Name      string `json:"name"`
				Endpoints []struct {
					Interface string `json:"interface"`
					Region    string `json:"region"`
					URL       string `json:"url"`
				} `json:"endpoints"`
			} `json:"catalog"`
		} `json:"token"`
	}
	if err := json.Unmarshal(payload, &parsed); err != nil {
		return "", nil, fmt.Errorf("decode keystone token: %w", err)
	}
	endpoints := make(endpointMap)
	iface := defaultIfEmpty(cloud.Interface, "public")
	region := strings.TrimSpace(cloud.RegionName)
	for _, svc := range parsed.Token.Catalog {
		chosen := ""
		for _, ep := range svc.Endpoints {
			if ep.Interface != iface {
				continue
			}
			if region != "" && ep.Region != region {
				continue
			}
			chosen = strings.TrimRight(ep.URL, "/")
			break
		}
		if chosen != "" {
			endpoints[svc.Type] = chosen
		}
	}
	return token, endpoints, nil
}

func fetchImageDetails(token string, cloud cloudEntry, endpoints endpointMap) ([]ResourceDetail, error) {
	base := chooseEndpoint(cloud, endpoints, "image")
	if base == "" {
		return nil, fmt.Errorf("image endpoint not found")
	}
	u := withPath(base, "/v2/images")
	body, err := doGet(token, u)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Images []map[string]any `json:"images"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	out := make([]ResourceDetail, 0, len(parsed.Images))
	for _, item := range parsed.Images {
		name := getString(item, "name")
		id := getString(item, "id")
		if name == "" && id == "" {
			continue
		}
		out = append(out, ResourceDetail{
			ID:   id,
			Name: nameOrFallback(name, id),
			Attributes: compactAttributes(map[string]string{
				"status":          getString(item, "status"),
				"visibility":      getString(item, "visibility"),
				"disk_format":     getString(item, "disk_format"),
				"container_format": getString(item, "container_format"),
				"size":            stringify(item["size"]),
				"min_disk":        stringify(item["min_disk"]),
				"min_ram":         stringify(item["min_ram"]),
				"owner":           getString(item, "owner"),
				"created_at":      getString(item, "created_at"),
				"updated_at":      getString(item, "updated_at"),
			}),
		})
	}
	return sortDetails(out), nil
}

func fetchFlavorDetails(token string, cloud cloudEntry, endpoints endpointMap) ([]ResourceDetail, error) {
	base := chooseEndpoint(cloud, endpoints, "compute")
	if base == "" {
		return nil, fmt.Errorf("compute endpoint not found")
	}
	u := withPath(base, "/v2.1/flavors/detail")
	body, err := doGet(token, u)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Flavors []map[string]any `json:"flavors"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	out := make([]ResourceDetail, 0, len(parsed.Flavors))
	for _, item := range parsed.Flavors {
		name := getString(item, "name")
		id := getString(item, "id")
		if name == "" && id == "" {
			continue
		}
		out = append(out, ResourceDetail{
			ID:   id,
			Name: nameOrFallback(name, id),
			Attributes: compactAttributes(map[string]string{
				"vcpus":    stringify(item["vcpus"]),
				"ram_mb":   stringify(item["ram"]),
				"disk_gb":  stringify(item["disk"]),
				"swap_mb":  stringify(item["swap"]),
				"is_public": stringify(item["os-flavor-access:is_public"]),
				"disabled": stringify(item["OS-FLV-DISABLED:disabled"]),
			}),
		})
	}
	return sortDetails(out), nil
}

func fetchNetworkDetails(token string, cloud cloudEntry, endpoints endpointMap) ([]ResourceDetail, error) {
	base := chooseEndpoint(cloud, endpoints, "network")
	if base == "" {
		return nil, fmt.Errorf("network endpoint not found")
	}
	u := withPath(base, "/v2.0/networks")
	body, err := doGet(token, u)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Networks []map[string]any `json:"networks"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	out := make([]ResourceDetail, 0, len(parsed.Networks))
	for _, item := range parsed.Networks {
		name := getString(item, "name")
		id := getString(item, "id")
		if name == "" && id == "" {
			continue
		}
		out = append(out, ResourceDetail{
			ID:   id,
			Name: nameOrFallback(name, id),
			Attributes: compactAttributes(map[string]string{
				"status":         getString(item, "status"),
				"admin_state_up": stringify(item["admin_state_up"]),
				"shared":         stringify(item["shared"]),
				"external":       stringify(item["router:external"]),
				"mtu":            stringify(item["mtu"]),
				"subnets":        stringifyLen(item["subnets"]),
			}),
		})
	}
	return sortDetails(out), nil
}

func fetchInstanceDetails(token string, cloud cloudEntry, endpoints endpointMap) ([]ResourceDetail, error) {
	base := chooseEndpoint(cloud, endpoints, "compute")
	if base == "" {
		return nil, fmt.Errorf("compute endpoint not found")
	}
	u := withPath(base, "/v2.1/servers/detail")
	body, err := doGet(token, u)
	if err != nil {
		return nil, err
	}
	var parsed struct {
		Servers []map[string]any `json:"servers"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	out := make([]ResourceDetail, 0, len(parsed.Servers))
	for _, item := range parsed.Servers {
		name := getString(item, "name")
		id := getString(item, "id")
		if name == "" && id == "" {
			continue
		}
		out = append(out, ResourceDetail{
			ID:   id,
			Name: nameOrFallback(name, id),
			Attributes: compactAttributes(map[string]string{
				"status":      getString(item, "status"),
				"power_state": stringify(item["OS-EXT-STS:power_state"]),
				"task_state":  stringify(item["OS-EXT-STS:task_state"]),
				"vm_state":    stringify(item["OS-EXT-STS:vm_state"]),
				"flavor":      nestedName(item["flavor"]),
				"image":       nestedName(item["image"]),
				"created":     getString(item, "created"),
				"updated":     getString(item, "updated"),
			}),
		})
	}
	return sortDetails(out), nil
}

func doGet(token, target string) ([]byte, error) {
	req, _ := http.NewRequest(http.MethodGet, target, nil)
	req.Header.Set("X-Auth-Token", token)
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("%s -> %d: %s", target, resp.StatusCode, strings.TrimSpace(string(body)))
	}
	return body, nil
}

func chooseEndpoint(cloud cloudEntry, endpoints endpointMap, serviceType string) string {
	if cloud.EndpointOverride != nil {
		if v := strings.TrimSpace(cloud.EndpointOverride[serviceType]); v != "" {
			return strings.TrimRight(v, "/")
		}
	}
	return strings.TrimRight(endpoints[serviceType], "/")
}

func withPath(base, path string) string {
	if base == "" {
		return ""
	}
	parsed, err := url.Parse(base)
	if err != nil {
		return strings.TrimRight(base, "/") + path
	}
	if strings.Contains(parsed.Path, "/v2") || strings.Contains(parsed.Path, "/v3") {
		return strings.TrimRight(base, "/") + stripAPIVersionPrefix(path)
	}
	return strings.TrimRight(base, "/") + path
}

func stripAPIVersionPrefix(path string) string {
	candidates := []string{"/v2.0", "/v2.1", "/v2", "/v3"}
	for _, p := range candidates {
		if strings.HasPrefix(path, p+"/") {
			return strings.TrimPrefix(path, p)
		}
	}
	return path
}

func uniqueSorted(items []string) []string {
	set := make(map[string]struct{}, len(items))
	for _, item := range items {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		set[item] = struct{}{}
	}
	out := make([]string, 0, len(set))
	for item := range set {
		out = append(out, item)
	}
	sort.Strings(out)
	return out
}

func namesFromDetails(items []ResourceDetail) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		name := strings.TrimSpace(item.Name)
		if name == "" {
			name = strings.TrimSpace(item.ID)
		}
		if name == "" {
			continue
		}
		out = append(out, name)
	}
	return uniqueSorted(out)
}

func sortDetails(items []ResourceDetail) []ResourceDetail {
	sort.Slice(items, func(i, j int) bool {
		left := strings.ToLower(strings.TrimSpace(items[i].Name))
		right := strings.ToLower(strings.TrimSpace(items[j].Name))
		if left == right {
			return strings.ToLower(items[i].ID) < strings.ToLower(items[j].ID)
		}
		return left < right
	})
	return items
}

func getString(item map[string]any, key string) string {
	value, ok := item[key]
	if !ok {
		return ""
	}
	return strings.TrimSpace(stringify(value))
}

func stringify(value any) string {
	switch v := value.(type) {
	case nil:
		return ""
	case string:
		return v
	case float64, float32, int, int64, int32, bool:
		return fmt.Sprintf("%v", v)
	default:
		b, err := json.Marshal(v)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

func stringifyLen(value any) string {
	switch v := value.(type) {
	case []any:
		return fmt.Sprintf("%d", len(v))
	case []string:
		return fmt.Sprintf("%d", len(v))
	default:
		return stringify(v)
	}
}

func nestedName(value any) string {
	item, ok := value.(map[string]any)
	if !ok {
		return stringify(value)
	}
	if name := strings.TrimSpace(stringify(item["name"])); name != "" {
		return name
	}
	if id := strings.TrimSpace(stringify(item["id"])); id != "" {
		return id
	}
	return stringify(item)
}

func nameOrFallback(name, id string) string {
	name = strings.TrimSpace(name)
	if name != "" {
		return name
	}
	return strings.TrimSpace(id)
}

func compactAttributes(attrs map[string]string) map[string]string {
	out := make(map[string]string)
	for key, value := range attrs {
		value = strings.TrimSpace(value)
		if value == "" || value == "null" {
			continue
		}
		out[key] = value
	}
	return out
}

func defaultIfEmpty(v, def string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return def
	}
	return v
}
