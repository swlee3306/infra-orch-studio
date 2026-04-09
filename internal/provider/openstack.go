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

type Catalog struct {
	Provider  string    `json:"provider"`
	FetchedAt time.Time `json:"fetched_at"`
	Images    []string  `json:"images"`
	Flavors   []string  `json:"flavors"`
	Networks  []string  `json:"networks"`
	Instances []string  `json:"instances"`
	Errors    []string  `json:"errors,omitempty"`
}

type Service struct {
	path string
}

func New(path string) *Service {
	return &Service{path: path}
}

func (s *Service) ListClouds() ([]CloudConnection, error) {
	parsed, err := loadCloudsFile(s.path)
	if err != nil {
		return nil, err
	}
	out := make([]CloudConnection, 0, len(parsed.Clouds))
	for name, c := range parsed.Clouds {
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
	parsed, err := loadCloudsFile(s.path)
	if err != nil {
		return Catalog{}, err
	}
	cloud, ok := parsed.Clouds[cloudName]
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

	if items, err := fetchImageNames(token, cloud, endpoints); err != nil {
		addErr(fmt.Errorf("images: %w", err))
	} else {
		c.Images = items
	}
	if items, err := fetchFlavorNames(token, cloud, endpoints); err != nil {
		addErr(fmt.Errorf("flavors: %w", err))
	} else {
		c.Flavors = items
	}
	if items, err := fetchNetworkNames(token, cloud, endpoints); err != nil {
		addErr(fmt.Errorf("networks: %w", err))
	} else {
		c.Networks = items
	}
	if items, err := fetchInstanceNames(token, cloud, endpoints); err != nil {
		addErr(fmt.Errorf("instances: %w", err))
	} else {
		c.Instances = items
	}
	return c, nil
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

func fetchImageNames(token string, cloud cloudEntry, endpoints endpointMap) ([]string, error) {
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
		Images []struct {
			Name string `json:"name"`
		} `json:"images"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return uniqueSorted(func() []string {
		out := make([]string, 0, len(parsed.Images))
		for _, i := range parsed.Images {
			if strings.TrimSpace(i.Name) != "" {
				out = append(out, i.Name)
			}
		}
		return out
	}()), nil
}

func fetchFlavorNames(token string, cloud cloudEntry, endpoints endpointMap) ([]string, error) {
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
		Flavors []struct {
			Name string `json:"name"`
		} `json:"flavors"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return uniqueSorted(func() []string {
		out := make([]string, 0, len(parsed.Flavors))
		for _, i := range parsed.Flavors {
			if strings.TrimSpace(i.Name) != "" {
				out = append(out, i.Name)
			}
		}
		return out
	}()), nil
}

func fetchNetworkNames(token string, cloud cloudEntry, endpoints endpointMap) ([]string, error) {
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
		Networks []struct {
			Name string `json:"name"`
		} `json:"networks"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return uniqueSorted(func() []string {
		out := make([]string, 0, len(parsed.Networks))
		for _, i := range parsed.Networks {
			if strings.TrimSpace(i.Name) != "" {
				out = append(out, i.Name)
			}
		}
		return out
	}()), nil
}

func fetchInstanceNames(token string, cloud cloudEntry, endpoints endpointMap) ([]string, error) {
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
		Servers []struct {
			Name string `json:"name"`
		} `json:"servers"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return uniqueSorted(func() []string {
		out := make([]string, 0, len(parsed.Servers))
		for _, i := range parsed.Servers {
			if strings.TrimSpace(i.Name) != "" {
				out = append(out, i.Name)
			}
		}
		return out
	}()), nil
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

func defaultIfEmpty(v, def string) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return def
	}
	return v
}
