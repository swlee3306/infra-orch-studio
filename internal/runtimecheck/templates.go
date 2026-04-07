package runtimecheck

import (
	"fmt"
	"os"
	"path/filepath"
)

var requiredEnvironmentTemplateFiles = []string{"main.tf", "variables.tf", "outputs.tf", "versions.tf"}

func ResolvePath(path string) string {
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return path
	}

	candidates := make([]string, 0, 3)
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(wd, path))
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, path),
			filepath.Join(exeDir, "..", path),
		)
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			abs, absErr := filepath.Abs(candidate)
			if absErr == nil {
				return abs
			}
			return candidate
		}
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	return abs
}

func ValidateTemplateAssets(templatesRoot, modulesRoot string) error {
	if err := requireDir(templatesRoot, "templates root"); err != nil {
		return err
	}
	if err := requireDir(modulesRoot, "modules root"); err != nil {
		return err
	}

	basicRoot := filepath.Join(templatesRoot, "basic")
	if err := requireDir(basicRoot, "default environment template"); err != nil {
		return err
	}
	for _, name := range requiredEnvironmentTemplateFiles {
		path := filepath.Join(basicRoot, name)
		info, err := os.Stat(path)
		if err != nil {
			if os.IsNotExist(err) {
				return fmt.Errorf("default environment template is missing required file %s", name)
			}
			return fmt.Errorf("stat default environment template file %s: %w", name, err)
		}
		if info.IsDir() {
			return fmt.Errorf("default environment template file %s is a directory", name)
		}
	}
	return nil
}

func requireDir(path, label string) error {
	if path == "" {
		return fmt.Errorf("%s is required", label)
	}
	info, err := os.Stat(path)
	if err != nil {
		if os.IsNotExist(err) {
			return fmt.Errorf("%s not found at %s", label, path)
		}
		return fmt.Errorf("stat %s: %w", label, err)
	}
	if !info.IsDir() {
		return fmt.Errorf("%s is not a directory: %s", label, path)
	}
	return nil
}
