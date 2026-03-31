package executor

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"time"
)

// CommandExecutor runs OpenTofu commands in a given working directory.
//
// Phase 6-1 scope:
// - tofu init
// - capture stdout/stderr
//
// We keep this small and stdlib-only.
type CommandExecutor struct {
	TofuBin string // default "tofu"
}

type RunResult struct {
	StartedAt time.Time
	EndedAt   time.Time

	ExitCode int
	Stdout   []byte
	Stderr   []byte
}

func (e CommandExecutor) tofuBin() string {
	if e.TofuBin != "" {
		return e.TofuBin
	}
	return "tofu"
}

func (e CommandExecutor) Init(ctx context.Context, workdir string) (RunResult, error) {
	return e.run(ctx, workdir, "init", "-input=false", "-no-color")
}

func (e CommandExecutor) run(ctx context.Context, workdir string, args ...string) (RunResult, error) {
	bin := e.tofuBin()
	path, err := exec.LookPath(bin)
	if err != nil {
		return RunResult{}, fmt.Errorf("%s not found in PATH", bin)
	}

	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Dir = workdir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	res := RunResult{StartedAt: time.Now().UTC()}
	err = cmd.Run()
	res.EndedAt = time.Now().UTC()
	res.Stdout = stdout.Bytes()
	res.Stderr = stderr.Bytes()
	res.ExitCode = exitCode(err)

	if err != nil {
		return res, fmt.Errorf("tofu %v failed (exit=%d)", args, res.ExitCode)
	}
	return res, nil
}

func exitCode(err error) int {
	if err == nil {
		return 0
	}
	var ee *exec.ExitError
	if ok := errorAs(err, &ee); ok {
		return ee.ExitCode()
	}
	return 1
}

// errorAs is a tiny shim to keep the file readable.
func errorAs(err error, target any) bool {
	switch t := target.(type) {
	case **exec.ExitError:
		ee, ok := err.(*exec.ExitError)
		if ok {
			*t = ee
			return true
		}
	}
	return false
}

// WriteRunLogs writes stdout/stderr to files under workdir.
func WriteRunLogs(workdir, name string, stdout, stderr []byte) (outPath, errPath string, err error) {
	logDir := filepath.Join(workdir, ".infra-orch", "logs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return "", "", err
	}

	outPath = filepath.Join(logDir, name+".stdout.log")
	errPath = filepath.Join(logDir, name+".stderr.log")

	if err := writeFile0600(outPath, stdout); err != nil {
		return "", "", err
	}
	if err := writeFile0600(errPath, stderr); err != nil {
		return "", "", err
	}
	return outPath, errPath, nil
}

func writeFile0600(path string, b []byte) error {
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return err
	}
	defer f.Close()
	_, err = io.Copy(f, bytes.NewReader(append(b, '\n')))
	return err
}
