package main

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/swlee3306/infra-orch-studio/internal/runtimecheck"
)

func TestResolvePathUsesWorkingDirectory(t *testing.T) {
	tmp := t.TempDir()
	target := filepath.Join(tmp, "templates", "opentofu", "environments")
	if err := os.MkdirAll(target, 0o755); err != nil {
		t.Fatalf("mkdir target: %v", err)
	}

	prev, err := os.Getwd()
	if err != nil {
		t.Fatalf("getwd: %v", err)
	}
	if err := os.Chdir(tmp); err != nil {
		t.Fatalf("chdir tmp: %v", err)
	}
	defer func() { _ = os.Chdir(prev) }()

	got := runtimecheck.ResolvePath("./templates/opentofu/environments")
	if got != target {
		t.Fatalf("ResolvePath() = %q, want %q", got, target)
	}
}
