package runtimecheck

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestValidateTemplateAssets(t *testing.T) {
	root := t.TempDir()
	templatesRoot := filepath.Join(root, "templates")
	modulesRoot := filepath.Join(root, "modules")
	basicRoot := filepath.Join(templatesRoot, "basic")
	for _, dir := range []string{basicRoot, modulesRoot} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	for _, name := range []string{"main.tf", "variables.tf", "outputs.tf", "versions.tf"} {
		if err := os.WriteFile(filepath.Join(basicRoot, name), []byte("content"), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}

	if err := ValidateTemplateAssets(templatesRoot, modulesRoot); err != nil {
		t.Fatalf("validate template assets: %v", err)
	}
}

func TestValidateTemplateAssetsRequiresDefaultTemplateFiles(t *testing.T) {
	root := t.TempDir()
	templatesRoot := filepath.Join(root, "templates")
	modulesRoot := filepath.Join(root, "modules")
	basicRoot := filepath.Join(templatesRoot, "basic")
	for _, dir := range []string{basicRoot, modulesRoot} {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", dir, err)
		}
	}
	if err := os.WriteFile(filepath.Join(basicRoot, "main.tf"), []byte("content"), 0o644); err != nil {
		t.Fatalf("write main.tf: %v", err)
	}

	err := ValidateTemplateAssets(templatesRoot, modulesRoot)
	if err == nil || !strings.Contains(err.Error(), "variables.tf") {
		t.Fatalf("err = %v, want missing file error", err)
	}
}

func TestInstanceTemplateAppliesSecurityGroupsToPorts(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "templates", "opentofu", "modules", "instance", "main.tf"))
	if err != nil {
		t.Fatalf("read instance module template: %v", err)
	}
	text := string(payload)
	for _, want := range []string{
		`data "openstack_networking_secgroup_v2" "selected"`,
		"security_group_ids = [",
		"data.openstack_networking_secgroup_v2.selected[name].id",
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("instance module missing %q:\n%s", want, text)
		}
	}
	if strings.Contains(text, "\n  security_groups =") {
		t.Fatalf("instance module should not set compute security_groups when using explicit ports:\n%s", text)
	}
}

func TestInstanceTemplateAcceptsImageAndFlavorIDs(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "templates", "opentofu", "modules", "instance", "main.tf"))
	if err != nil {
		t.Fatalf("read instance module template: %v", err)
	}
	text := string(payload)
	for _, want := range []string{
		"uuid_pattern =",
		`image_id    = startswith(each.value.image, "id:") ? trimprefix(each.value.image, "id:") : (can(regex(local.uuid_pattern, each.value.image)) ? each.value.image : null)`,
		`image_name  = startswith(each.value.image, "id:") || can(regex(local.uuid_pattern, each.value.image)) ? null : each.value.image`,
		`flavor_id   = startswith(each.value.flavor, "id:") ? trimprefix(each.value.flavor, "id:") : (can(regex(local.uuid_pattern, each.value.flavor)) ? each.value.flavor : null)`,
		`flavor_name = startswith(each.value.flavor, "id:") || can(regex(local.uuid_pattern, each.value.flavor)) ? null : each.value.flavor`,
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("instance module missing %q:\n%s", want, text)
		}
	}
}

func TestBasicTemplatePinsOpenStackProviderMajorVersion(t *testing.T) {
	payload, err := os.ReadFile(filepath.Join("..", "..", "templates", "opentofu", "environments", "basic", "versions.tf"))
	if err != nil {
		t.Fatalf("read basic versions template: %v", err)
	}
	text := string(payload)
	for _, want := range []string{
		`source  = "hashicorp/openstack"`,
		`version = ">= 1.54.0, < 4.0.0"`,
	} {
		if !strings.Contains(text, want) {
			t.Fatalf("versions template missing %q:\n%s", want, text)
		}
	}
}
