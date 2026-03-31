package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/renderer"
	storesqlite "github.com/swlee3306/infra-orch-studio/internal/storage/sqlite"
)

func main() {
	interval := envDuration("RUNNER_POLL_INTERVAL", 2*time.Second)
	dbPath := env("STORE_SQLITE_PATH", "./var/infra-orch.db")
	processingDelay := envDuration("RUNNER_PROCESSING_DELAY", 300*time.Millisecond)
	templatesRoot := env("TEMPLATES_ROOT", "./templates/opentofu/environments")
	workdirsRoot := env("WORKDIRS_ROOT", "./workdirs")
	templateName := env("TEMPLATE_NAME", "basic")

	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		log.Fatalf("mkdir: %v", err)
	}

	store, err := storesqlite.Open(dbPath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer store.Close()

	log.Printf("runner starting (poll interval=%s, db=%s)", interval, dbPath)

	t := time.NewTicker(interval)
	defer t.Stop()

	for range t.C {
		job, ok, err := store.ClaimNextQueuedJob(context.Background())
		if err != nil {
			log.Printf("claim job failed: %v", err)
			continue
		}
		if !ok {
			continue
		}

		log.Printf("claimed job id=%s type=%s", job.ID, job.Type)

		// Phase 5: render -> create workdir.
		vars, err := renderer.RenderEnvironmentVars(job.Environment)
		if err != nil {
			job.Status = domain.JobStatusFailed
			job.Error = err.Error()
			job.UpdatedAt = time.Now().UTC()
			_, _ = store.UpdateJob(context.Background(), job)
			continue
		}

		wd, err := renderer.CreateWorkdir(renderer.WorkdirConfig{TemplatesRoot: templatesRoot, WorkdirsRoot: workdirsRoot}, templateName, job.ID, vars)
		if err != nil {
			job.Status = domain.JobStatusFailed
			job.Error = err.Error()
			job.UpdatedAt = time.Now().UTC()
			_, _ = store.UpdateJob(context.Background(), job)
			continue
		}
		job.TemplateName = templateName
		job.Workdir = wd.Dir

		// Placeholder execution (Phase 3). Real tofu execution will come in Phase 6/7.
		time.Sleep(processingDelay)
		job.Status = domain.JobStatusDone
		job.UpdatedAt = time.Now().UTC()

		if _, err := store.UpdateJob(context.Background(), job); err != nil {
			log.Printf("update job failed: id=%s err=%v", job.ID, err)
			continue
		}
		log.Printf("finished job id=%s status=%s workdir=%s", job.ID, job.Status, job.Workdir)
	}
}

func envDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
