package renderer

import (
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
)

type WorkdirConfig struct {
	TemplatesRoot string // e.g. ./templates/opentofu/environments
	ModulesRoot   string // e.g. ./templates/opentofu/modules
	WorkdirsRoot  string // e.g. ./workdirs
}

type RenderedWorkdir struct {
	Dir          string // absolute path
	TemplateName string
	VarsPath     string // absolute path
}

// CreateWorkdir copies a fixed template directory into a new working directory and writes
// terraform.tfvars.json for variable injection.
//
// Safety:
// - templateName is restricted to a single path segment (no slashes)
// - template source must be under TemplatesRoot
// - workdir is created under WorkdirsRoot
func CreateWorkdir(cfg WorkdirConfig, templateName, workdirName string, vars any) (RenderedWorkdir, error) {
	if cfg.TemplatesRoot == "" || cfg.ModulesRoot == "" || cfg.WorkdirsRoot == "" {
		return RenderedWorkdir{}, fmt.Errorf("TemplatesRoot, ModulesRoot and WorkdirsRoot are required")
	}
	if templateName == "" || strings.Contains(templateName, "/") || strings.Contains(templateName, "\\") {
		return RenderedWorkdir{}, fmt.Errorf("invalid templateName")
	}
	if workdirName == "" || strings.Contains(workdirName, "/") || strings.Contains(workdirName, "\\") {
		return RenderedWorkdir{}, fmt.Errorf("invalid workdirName")
	}

	tRootAbs, err := filepath.Abs(cfg.TemplatesRoot)
	if err != nil {
		return RenderedWorkdir{}, err
	}
	mRootAbs, err := filepath.Abs(cfg.ModulesRoot)
	if err != nil {
		return RenderedWorkdir{}, err
	}
	wRootAbs, err := filepath.Abs(cfg.WorkdirsRoot)
	if err != nil {
		return RenderedWorkdir{}, err
	}

	src := filepath.Join(tRootAbs, templateName)
	srcAbs, err := filepath.Abs(src)
	if err != nil {
		return RenderedWorkdir{}, err
	}
	if !strings.HasPrefix(srcAbs+string(os.PathSeparator), tRootAbs+string(os.PathSeparator)) {
		return RenderedWorkdir{}, fmt.Errorf("template path escapes TemplatesRoot")
	}

	info, err := os.Stat(srcAbs)
	if err != nil {
		return RenderedWorkdir{}, fmt.Errorf("stat template: %w", err)
	}
	if !info.IsDir() {
		return RenderedWorkdir{}, fmt.Errorf("template is not a directory")
	}

	dstAbs := filepath.Join(wRootAbs, workdirName)
	if err := os.MkdirAll(dstAbs, 0o755); err != nil {
		return RenderedWorkdir{}, fmt.Errorf("mkdir workdir: %w", err)
	}

	if err := copyDir(srcAbs, dstAbs); err != nil {
		return RenderedWorkdir{}, err
	}

	// Copy shared modules into the workdir so module sources can stay relative and self-contained.
	mInfo, err := os.Stat(mRootAbs)
	if err != nil {
		return RenderedWorkdir{}, fmt.Errorf("stat modules root: %w", err)
	}
	if !mInfo.IsDir() {
		return RenderedWorkdir{}, fmt.Errorf("modules root is not a directory")
	}
	modulesDst := filepath.Join(dstAbs, "modules")
	if err := os.MkdirAll(modulesDst, 0o755); err != nil {
		return RenderedWorkdir{}, fmt.Errorf("mkdir modules: %w", err)
	}
	if err := copyDir(mRootAbs, modulesDst); err != nil {
		return RenderedWorkdir{}, err
	}

	varsPath := filepath.Join(dstAbs, "terraform.tfvars.json")
	b, err := json.MarshalIndent(vars, "", "  ")
	if err != nil {
		return RenderedWorkdir{}, fmt.Errorf("marshal vars: %w", err)
	}
	if err := os.WriteFile(varsPath, append(b, '\n'), 0o600); err != nil {
		return RenderedWorkdir{}, fmt.Errorf("write vars: %w", err)
	}

	return RenderedWorkdir{Dir: dstAbs, TemplateName: templateName, VarsPath: varsPath}, nil
}

func copyDir(srcDir, dstDir string) error {
	return filepath.WalkDir(srcDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(srcDir, path)
		if err != nil {
			return err
		}
		if rel == "." {
			return nil
		}
		target := filepath.Join(dstDir, rel)

		info, err := d.Info()
		if err != nil {
			return err
		}

		// Do not follow symlinks in templates.
		if info.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("symlinks are not allowed in templates: %s", rel)
		}

		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}

		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			return err
		}

		srcF, err := os.Open(path)
		if err != nil {
			return err
		}
		defer srcF.Close()

		dstF, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o644)
		if err != nil {
			return err
		}
		defer dstF.Close()

		if _, err := io.Copy(dstF, srcF); err != nil {
			return err
		}
		return nil
	})
}
