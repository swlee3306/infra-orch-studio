package api

import (
	"context"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

type fakeWSStore struct {
	job domain.Job
}

func (f fakeWSStore) GetJob(context.Context, string) (domain.Job, error) {
	return f.job, nil
}

type captureJSONWriter struct {
	items []any
}

func (w *captureJSONWriter) WriteJSON(v any) error {
	w.items = append(w.items, v)
	return nil
}

func TestJobStreamTickEmitsStatusAndLogFromLogDir(t *testing.T) {
	logDir := filepath.Join(t.TempDir(), "logs")
	if err := os.MkdirAll(logDir, 0o755); err != nil {
		t.Fatalf("mkdir logs: %v", err)
	}
	if err := os.WriteFile(filepath.Join(logDir, "tofu-plan.stdout.log"), []byte("plan line\n"), 0o600); err != nil {
		t.Fatalf("write log: %v", err)
	}

	writer := &captureJSONWriter{}
	stream := &jobStream{
		store: fakeWSStore{job: domain.Job{
			ID:        "job-1",
			Type:      domain.JobTypePlan,
			Status:    domain.JobStatusRunning,
			UpdatedAt: time.Now().UTC(),
			LogDir:    logDir,
		}},
		conn:    writer,
		jobID:   "job-1",
		offsets: map[string]int64{},
	}

	if err := stream.tick(context.Background()); err != nil {
		t.Fatalf("tick: %v", err)
	}
	if len(writer.items) != 2 {
		t.Fatalf("events = %d, want status and log", len(writer.items))
	}
	status, ok := writer.items[0].(map[string]any)
	if !ok || status["type"] != "status" || status["jobId"] != "job-1" || status["status"] != domain.JobStatusRunning {
		t.Fatalf("unexpected status event: %#v", writer.items[0])
	}
	logEvent, ok := writer.items[1].(map[string]any)
	if !ok || logEvent["type"] != "log" || logEvent["file"] != "tofu-plan.stdout.log" || logEvent["message"] != "plan line\n" {
		t.Fatalf("unexpected log event: %#v", writer.items[1])
	}

	if err := stream.tick(context.Background()); err != nil {
		t.Fatalf("second tick: %v", err)
	}
	if len(writer.items) != 2 {
		t.Fatalf("second tick emitted duplicate events: %#v", writer.items)
	}
}
