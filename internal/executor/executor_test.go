package executor

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestCommandExecutor_RunErrorsWhenBinaryMissing(t *testing.T) {
	e := CommandExecutor{TofuBin: "definitely-not-a-real-binary"}
	_, err := e.Init(context.Background(), ".")
	if err == nil {
		t.Fatalf("expected error")
	}
	if !strings.Contains(err.Error(), "not found") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestCommandExecutorCheckAvailable(t *testing.T) {
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "tofu")
	if err := os.WriteFile(bin, []byte("#!/usr/bin/env bash\necho 'OpenTofu v0.0.0-test'\n"), 0o755); err != nil {
		t.Fatalf("write fake tofu: %v", err)
	}
	if err := (CommandExecutor{TofuBin: bin}).CheckAvailable(context.Background()); err != nil {
		t.Fatalf("CheckAvailable: %v", err)
	}
}

func TestCommandExecutorCheckAvailableReportsInvalidBinary(t *testing.T) {
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "tofu")
	if err := os.WriteFile(bin, []byte("not a runnable binary"), 0o755); err != nil {
		t.Fatalf("write fake tofu: %v", err)
	}
	err := (CommandExecutor{TofuBin: bin}).CheckAvailable(context.Background())
	if err == nil {
		t.Fatalf("expected error")
	}
	if !strings.Contains(err.Error(), "version failed") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestWriteRunLogs(t *testing.T) {
	tmp := t.TempDir()
	out, errp, err := WriteRunLogs(tmp, "init", []byte("ok"), []byte("warn"))
	if err != nil {
		t.Fatalf("WriteRunLogs: %v", err)
	}
	if out == "" || errp == "" {
		t.Fatalf("expected paths")
	}
	// Touch timestamps just to ensure file exists
	_ = time.Now()
}

func TestCommandExecutorPlanApplyOutputFlow(t *testing.T) {
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "tofu")
	script := `#!/usr/bin/env bash
set -euo pipefail
cmd="$1"
shift || true
case "$cmd" in
  init)
    echo "init ok"
    ;;
  validate)
    echo "validate ok"
    ;;
  plan)
    out=""
    for arg in "$@"; do
      case "$arg" in
        -out=*) out="${arg#-out=}" ;;
      esac
    done
    test -n "$out"
    mkdir -p "$(dirname "$out")"
    printf "fake plan" >"$out"
    echo "plan ok"
    ;;
  apply)
    test -f "${@: -1}"
    echo "apply ok"
    ;;
  output)
    echo '{"instance_ids":{"value":["vm-1"]}}'
    ;;
  *)
    echo "unexpected command $cmd" >&2
    exit 9
    ;;
esac
`
	if err := os.WriteFile(bin, []byte(script), 0o755); err != nil {
		t.Fatalf("write fake tofu: %v", err)
	}

	workdir := filepath.Join(tmp, "workdir")
	if err := os.MkdirAll(workdir, 0o755); err != nil {
		t.Fatalf("mkdir workdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workdir, "terraform.tfvars.json"), []byte("{}\n"), 0o600); err != nil {
		t.Fatalf("write vars: %v", err)
	}

	exec := CommandExecutor{TofuBin: bin}
	if _, err := exec.Init(context.Background(), workdir); err != nil {
		t.Fatalf("init: %v", err)
	}
	if _, err := exec.Validate(context.Background(), workdir); err != nil {
		t.Fatalf("validate: %v", err)
	}
	if _, err := exec.Plan(context.Background(), workdir, ".infra-orch/plan/plan.bin"); err != nil {
		t.Fatalf("plan: %v", err)
	}
	if _, err := os.Stat(filepath.Join(workdir, ".infra-orch", "plan", "plan.bin")); err != nil {
		t.Fatalf("plan artifact missing: %v", err)
	}
	if _, err := exec.Apply(context.Background(), workdir, ".infra-orch/plan/plan.bin"); err != nil {
		t.Fatalf("apply: %v", err)
	}
	output, err := exec.OutputJSON(context.Background(), workdir)
	if err != nil {
		t.Fatalf("output: %v", err)
	}
	if !strings.Contains(string(output.Stdout), "instance_ids") {
		t.Fatalf("unexpected output: %s", string(output.Stdout))
	}
	if _, err := os.Stat(filepath.Join(workdir, ".infra-orch", "logs", "tofu-apply.stdout.log")); err != nil {
		t.Fatalf("apply stdout log missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(workdir, ".infra-orch", "logs", "tofu-validate.stdout.log")); err != nil {
		t.Fatalf("validate stdout log missing: %v", err)
	}
}

func TestCommandExecutorUsesCustomLogDir(t *testing.T) {
	tmp := t.TempDir()
	bin := filepath.Join(tmp, "tofu")
	if err := os.WriteFile(bin, []byte("#!/usr/bin/env bash\necho validate ok\n"), 0o755); err != nil {
		t.Fatalf("write fake tofu: %v", err)
	}
	workdir := t.TempDir()
	logDir := filepath.Join(t.TempDir(), "job-logs")
	exec := CommandExecutor{TofuBin: bin, LogDir: logDir}

	if _, err := exec.Validate(context.Background(), workdir); err != nil {
		t.Fatalf("validate: %v", err)
	}
	if _, err := os.Stat(filepath.Join(logDir, "tofu-validate.stdout.log")); err != nil {
		t.Fatalf("validate stdout log missing from custom log dir: %v", err)
	}
	if _, err := os.Stat(filepath.Join(workdir, ".infra-orch", "logs", "tofu-validate.stdout.log")); !os.IsNotExist(err) {
		t.Fatalf("default log dir should not contain validate log, err=%v", err)
	}
}
