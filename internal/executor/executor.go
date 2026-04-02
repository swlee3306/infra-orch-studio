package executor

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
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
	TofuBin string            // default "tofu"
	Env     map[string]string // extra environment variables injected into tofu process
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

func (e CommandExecutor) Plan(ctx context.Context, workdir, outPlanPath string) (RunResult, error) {
	return e.plan(ctx, workdir, outPlanPath, false)
}

func (e CommandExecutor) PlanDestroy(ctx context.Context, workdir, outPlanPath string) (RunResult, error) {
	return e.plan(ctx, workdir, outPlanPath, true)
}

func (e CommandExecutor) plan(ctx context.Context, workdir, outPlanPath string, destroy bool) (RunResult, error) {
	// Ensure plan output directory exists.
	if dir := filepath.Dir(outPlanPath); dir != "." {
		_ = os.MkdirAll(filepath.Join(workdir, dir), 0o755)
	}
	args := []string{
		"plan",
		"-input=false",
		"-no-color",
		"-var-file=terraform.tfvars.json",
		"-out=" + outPlanPath,
	}
	if destroy {
		args = append(args, "-destroy")
	}
	return e.run(ctx, workdir, args...)
}

func (e CommandExecutor) Apply(ctx context.Context, workdir, planPath string) (RunResult, error) {
	return e.run(ctx, workdir,
		"apply",
		"-input=false",
		"-no-color",
		planPath,
	)
}

func (e CommandExecutor) OutputJSON(ctx context.Context, workdir string) (RunResult, error) {
	return e.run(ctx, workdir,
		"output",
		"-json",
	)
}

func (e CommandExecutor) run(ctx context.Context, workdir string, args ...string) (RunResult, error) {
	bin := e.tofuBin()
	path, err := exec.LookPath(bin)
	if err != nil {
		return RunResult{}, fmt.Errorf("%s not found in PATH", bin)
	}

	cmd := exec.CommandContext(ctx, path, args...)
	cmd.Dir = workdir
	if len(e.Env) > 0 {
		cmd.Env = append([]string{}, os.Environ()...)
		for k, v := range e.Env {
			cmd.Env = append(cmd.Env, k+"="+v)
		}
	}

	var stdout, stderr bytes.Buffer
	stdoutWriter := io.Writer(&stdout)
	stderrWriter := io.Writer(&stderr)

	logName := "tofu"
	if len(args) > 0 {
		logName = "tofu-" + strings.ReplaceAll(args[0], " ", "-")
	}
	outFile, errFile, err := openRunLogFiles(workdir, logName)
	if err != nil {
		return RunResult{}, fmt.Errorf("open log files: %w", err)
	}
	defer outFile.Close()
	defer errFile.Close()

	stdoutWriter = io.MultiWriter(&stdout, outFile)
	stderrWriter = io.MultiWriter(&stderr, errFile)
	cmd.Stdout = stdoutWriter
	cmd.Stderr = stderrWriter

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
	outFile, errFile, err := openRunLogFiles(workdir, name)
	if err != nil {
		return "", "", err
	}
	defer outFile.Close()
	defer errFile.Close()

	outPath = outFile.Name()
	errPath = errFile.Name()
	if err := writeFile(outFile, stdout); err != nil {
		return "", "", err
	}
	if err := writeFile(errFile, stderr); err != nil {
		return "", "", err
	}
	return outPath, errPath, nil
}

func openRunLogFiles(workdir, name string) (outFile, errFile *os.File, err error) {
	logDir := filepath.Join(workdir, ".infra-orch", "logs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		return nil, nil, err
	}

	outPath := filepath.Join(logDir, name+".stdout.log")
	errPath := filepath.Join(logDir, name+".stderr.log")
	outFile, err = os.OpenFile(outPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		return nil, nil, err
	}
	errFile, err = os.OpenFile(errPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o600)
	if err != nil {
		_ = outFile.Close()
		return nil, nil, err
	}
	return outFile, errFile, nil
}

func writeFile(f *os.File, b []byte) error {
	if _, err := f.Seek(0, io.SeekStart); err != nil {
		return err
	}
	if err := f.Truncate(0); err != nil {
		return err
	}
	_, err := io.Copy(f, bytes.NewReader(append(b, '\n')))
	return err
}
