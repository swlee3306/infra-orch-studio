package provider

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestExportCloudsYAML(t *testing.T) {
	payload, err := ExportCloudsYAML([]CloudConfig{{
		Name:              "demo",
		RegionName:        "RegionOne",
		Interface:         "public",
		IdentityInterface: "public",
		Auth: CloudAuth{
			AuthURL:           "https://openstack.example:5000/v3",
			Username:          "demo-user",
			Password:          "demo-pass",
			ProjectName:       "demo-project",
			UserDomainName:    "Default",
			ProjectDomainName: "Default",
		},
	}})
	if err != nil {
		t.Fatalf("ExportCloudsYAML: %v", err)
	}
	text := string(payload)
	for _, want := range []string{"clouds:", "demo:", "identity_api_version: 3", "auth_url: https://openstack.example:5000/v3"} {
		if !strings.Contains(text, want) {
			t.Fatalf("export missing %q:\n%s", want, text)
		}
	}

	svc := NewWithClouds([]CloudConfig{{Name: "demo", Auth: CloudAuth{AuthURL: "https://openstack.example"}}})
	items, err := svc.ListClouds()
	if err != nil {
		t.Fatalf("ListClouds: %v", err)
	}
	if len(items) != 1 || items[0].Name != "demo" {
		t.Fatalf("unexpected clouds: %+v", items)
	}
}

func TestCheckAuthReportsRequiredEndpoints(t *testing.T) {
	keystone := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v3/auth/tokens" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("X-Subject-Token", "token-1")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"token": map[string]any{
				"catalog": []map[string]any{
					{"type": "compute", "endpoints": []map[string]string{{"interface": "public", "region": "RegionOne", "url": "https://compute.example/v2.1"}}},
					{"type": "image", "endpoints": []map[string]string{{"interface": "public", "region": "RegionOne", "url": "https://image.example"}}},
					{"type": "network", "endpoints": []map[string]string{{"interface": "public", "region": "RegionOne", "url": "https://network.example"}}},
				},
			},
		})
	}))
	defer keystone.Close()

	svc := NewWithClouds([]CloudConfig{{
		Name:       "demo",
		RegionName: "RegionOne",
		Interface:  "public",
		Auth: CloudAuth{
			AuthURL:           keystone.URL,
			Username:          "demo-user",
			Password:          "demo-pass",
			ProjectName:       "demo-project",
			UserDomainName:    "Default",
			ProjectDomainName: "Default",
		},
	}})
	result, err := svc.CheckAuth("demo")
	if err != nil {
		t.Fatalf("CheckAuth: %v", err)
	}
	if !result.Authenticated || !result.ReadyForPlanApply {
		t.Fatalf("unexpected preflight result: %+v", result)
	}
	for _, key := range []string{"compute", "image", "network"} {
		if result.Endpoints[key] == "" {
			t.Fatalf("missing endpoint %s: %+v", key, result.Endpoints)
		}
	}
}

func TestCheckAuthUsesProjectIDScope(t *testing.T) {
	keystone := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode auth body: %v", err)
		}
		auth := body["auth"].(map[string]any)
		scope := auth["scope"].(map[string]any)
		project := scope["project"].(map[string]any)
		if project["id"] != "project-id-1" {
			t.Fatalf("project id = %#v, want project-id-1; project=%#v", project["id"], project)
		}
		if _, ok := project["name"]; ok {
			t.Fatalf("project name should be omitted when project_id is set: %#v", project)
		}
		if _, ok := project["domain"]; ok {
			t.Fatalf("project domain should be omitted when project_id is set: %#v", project)
		}
		w.Header().Set("X-Subject-Token", "token-1")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"token": map[string]any{
				"catalog": []map[string]any{
					{"type": "compute", "endpoints": []map[string]string{{"interface": "public", "url": "https://compute.example/v2.1"}}},
					{"type": "image", "endpoints": []map[string]string{{"interface": "public", "url": "https://image.example"}}},
					{"type": "network", "endpoints": []map[string]string{{"interface": "public", "url": "https://network.example"}}},
				},
			},
		})
	}))
	defer keystone.Close()

	svc := NewWithClouds([]CloudConfig{{
		Name:      "demo",
		Interface: "public",
		Auth: CloudAuth{
			AuthURL:           keystone.URL,
			Username:          "demo-user",
			Password:          "demo-pass",
			ProjectID:         "project-id-1",
			UserDomainName:    "Default",
			ProjectDomainName: "Default",
		},
	}})
	result, err := svc.CheckAuth("demo")
	if err != nil {
		t.Fatalf("CheckAuth: %v", err)
	}
	if !result.ReadyForPlanApply {
		t.Fatalf("unexpected preflight result: %+v", result)
	}
}

func TestExportCloudsYAMLOmitsEmptyProjectFields(t *testing.T) {
	payload, err := ExportCloudsYAML([]CloudConfig{{
		Name: "demo",
		Auth: CloudAuth{
			AuthURL:        "https://openstack.example:5000/v3",
			Username:       "demo-user",
			Password:       "demo-pass",
			ProjectID:      "project-id-1",
			UserDomainName: "Default",
		},
	}})
	if err != nil {
		t.Fatalf("ExportCloudsYAML: %v", err)
	}
	text := string(payload)
	if !strings.Contains(text, "project_id: project-id-1") {
		t.Fatalf("export missing project_id:\n%s", text)
	}
	if strings.Contains(text, "project_name:") {
		t.Fatalf("export should omit empty project_name:\n%s", text)
	}
	if strings.Contains(text, "project_domain_name:") {
		t.Fatalf("export should omit empty project_domain_name:\n%s", text)
	}
}

func TestWithPathPreservesQueryWhenEndpointHasVersion(t *testing.T) {
	tests := []struct {
		name string
		base string
		path string
		want string
	}{
		{
			name: "image v2",
			base: "https://image.example/v2",
			path: "/v2/images?limit=1000",
			want: "https://image.example/v2/images?limit=1000",
		},
		{
			name: "compute v2.1",
			base: "https://compute.example/v2.1",
			path: "/v2.1/flavors/detail?limit=1000",
			want: "https://compute.example/v2.1/flavors/detail?limit=1000",
		},
		{
			name: "network v2.0 networks",
			base: "https://network.example/v2.0",
			path: "/v2.0/networks?limit=1000",
			want: "https://network.example/v2.0/networks?limit=1000",
		},
		{
			name: "network v2.0 security groups",
			base: "https://network.example/v2.0",
			path: "/v2.0/security-groups?limit=1000",
			want: "https://network.example/v2.0/security-groups?limit=1000",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := withPath(tt.base, tt.path); got != tt.want {
				t.Fatalf("withPath = %q, want %q", got, tt.want)
			}
		})
	}
}
