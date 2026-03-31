package renderer

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCreateWorkdir_CopiesTemplateAndWritesVars(t *testing.T) {
	tmp := t.TempDir()
	templatesRoot := filepath.Join(tmp, "templates")
	workdirsRoot := filepath.Join(tmp, "workdirs")

	// fake template structure
	src := filepath.Join(templatesRoot, "basic")
	if err := os.MkdirAll(filepath.Join(src, "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "main.tf"), []byte("// tf\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(src, "nested", "x.txt"), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg := WorkdirConfig{TemplatesRoot: templatesRoot, WorkdirsRoot: workdirsRoot}
	vars := map[string]any{"environment_name": "dev"}
	out, err := CreateWorkdir(cfg, "basic", "job-1", vars)
	if err != nil {
		t.Fatalf("CreateWorkdir: %v", err)
	}

	if _, err := os.Stat(filepath.Join(out.Dir, "main.tf")); err != nil {
		t.Fatalf("expected main.tf copied: %v", err)
	}
	if _, err := os.Stat(filepath.Join(out.Dir, "nested", "x.txt")); err != nil {
		t.Fatalf("expected nested file copied: %v", err)
	}

	b, err := os.ReadFile(out.VarsPath)
	if err != nil {
		t.Fatalf("read vars: %v", err)
	}
	if len(b) == 0 {
		t.Fatalf("vars file empty")
	}
}
