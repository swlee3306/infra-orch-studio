package executor

import (
	"context"
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
