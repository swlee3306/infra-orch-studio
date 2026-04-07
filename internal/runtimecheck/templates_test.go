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
