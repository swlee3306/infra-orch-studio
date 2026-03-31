package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/executor"
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
	tofuBin := env("TOFU_BIN", "tofu")

	// OpenStack provider auth (Phase 9 E2E): injected into terraform.tfvars.json.
	osAuthURL := env("OPENSTACK_AUTH_URL", "")
	osRegion := env("OPENSTACK_REGION", "RegionOne")
	osTenant := env("OPENSTACK_TENANT_NAME", "")
	osUser := env("OPENSTACK_USERNAME", "")
	osPass := env("OPENSTACK_PASSWORD", "")
	osUserDomain := env("OPENSTACK_USER_DOMAIN_NAME", "Default")
	osProjDomain := env("OPENSTACK_PROJECT_DOMAIN_NAME", "Default")

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

	exec := executor.CommandExecutor{TofuBin: tofuBin}

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

		// Inject OpenStack provider auth vars.
		if osAuthURL == "" || osTenant == "" || osUser == "" || osPass == "" {
			job.Status = domain.JobStatusFailed
			job.Error = "missing required OpenStack env vars: OPENSTACK_AUTH_URL, OPENSTACK_TENANT_NAME, OPENSTACK_USERNAME, OPENSTACK_PASSWORD"
			job.UpdatedAt = time.Now().UTC()
			_, _ = store.UpdateJob(context.Background(), job)
			continue
		}
		varsPayload := map[string]any{
			"openstack_auth_url":            osAuthURL,
			"openstack_region":              osRegion,
			"openstack_tenant_name":         osTenant,
			"openstack_username":            osUser,
			"openstack_password":            osPass,
			"openstack_user_domain_name":    osUserDomain,
			"openstack_project_domain_name": osProjDomain,
			"environment_name":              vars.EnvironmentName,
			"network":                       vars.Network,
			"subnet":                        vars.Subnet,
			"instances":                     vars.Instances,
		}

		modulesRoot := env("MODULES_ROOT", "./templates/opentofu/modules")
		wd, err := renderer.CreateWorkdir(renderer.WorkdirConfig{TemplatesRoot: templatesRoot, ModulesRoot: modulesRoot, WorkdirsRoot: workdirsRoot}, templateName, job.ID, varsPayload)
		if err != nil {
			job.Status = domain.JobStatusFailed
			job.Error = err.Error()
			job.UpdatedAt = time.Now().UTC()
			_, _ = store.UpdateJob(context.Background(), job)
			continue
		}
		job.TemplateName = templateName
		job.Workdir = wd.Dir

		// Phase 6/7 execution (still minimal): init + plan, and apply only for explicit tofu.apply jobs.
		if job.Type == domain.JobTypeApply {
			if job.SourceJobID == "" {
				job.Status = domain.JobStatusFailed
				job.Error = "apply job missing source_job_id"
				job.UpdatedAt = time.Now().UTC()
				_, _ = store.UpdateJob(context.Background(), job)
				continue
			}

			// Always load the source (plan) job to obtain the authoritative workdir/plan path.
			src, err := store.GetJob(context.Background(), job.SourceJobID)
			if err != nil {
				job.Status = domain.JobStatusFailed
				job.Error = "failed to load source job: " + err.Error()
				job.UpdatedAt = time.Now().UTC()
				_, _ = store.UpdateJob(context.Background(), job)
				continue
			}
			if src.Type != domain.JobTypePlan || src.Status != domain.JobStatusDone {
				job.Status = domain.JobStatusFailed
				job.Error = "source job must be done tofu.plan"
				job.UpdatedAt = time.Now().UTC()
				_, _ = store.UpdateJob(context.Background(), job)
				continue
			}
			if src.Workdir == "" || src.PlanPath == "" {
				job.Status = domain.JobStatusFailed
				job.Error = "source job missing workdir/plan_path"
				job.UpdatedAt = time.Now().UTC()
				_, _ = store.UpdateJob(context.Background(), job)
				continue
			}

			job.Workdir = src.Workdir
			job.PlanPath = src.PlanPath
			job.TemplateName = src.TemplateName

			if _, err := os.Stat(filepath.Join(job.Workdir, job.PlanPath)); err != nil {
				job.Status = domain.JobStatusFailed
				job.Error = "plan file not found: " + err.Error()
				job.UpdatedAt = time.Now().UTC()
				_, _ = store.UpdateJob(context.Background(), job)
				continue
			}

			applyRes, err := exec.Apply(context.Background(), job.Workdir, job.PlanPath)
			_, _, _ = executor.WriteRunLogs(job.Workdir, "tofu-apply", applyRes.Stdout, applyRes.Stderr)
			if err != nil {
				job.Status = domain.JobStatusFailed
				job.Error = err.Error()
				job.UpdatedAt = time.Now().UTC()
				_, _ = store.UpdateJob(context.Background(), job)
				continue
			}
			job.Status = domain.JobStatusDone
			job.UpdatedAt = time.Now().UTC()
			if _, err := store.UpdateJob(context.Background(), job); err != nil {
				log.Printf("update job failed: id=%s err=%v", job.ID, err)
				continue
			}
			log.Printf("finished job id=%s status=%s workdir=%s", job.ID, job.Status, job.Workdir)
			continue
		}

		initRes, err := exec.Init(context.Background(), job.Workdir)
		_, _, _ = executor.WriteRunLogs(job.Workdir, "tofu-init", initRes.Stdout, initRes.Stderr)
		if err != nil {
			job.Status = domain.JobStatusFailed
			job.Error = err.Error()
			job.UpdatedAt = time.Now().UTC()
			_, _ = store.UpdateJob(context.Background(), job)
			continue
		}

		planRelPath := ".infra-orch/plan/plan.bin"
		planRes, err := exec.Plan(context.Background(), job.Workdir, planRelPath)
		_, _, _ = executor.WriteRunLogs(job.Workdir, "tofu-plan", planRes.Stdout, planRes.Stderr)
		if err != nil {
			job.Status = domain.JobStatusFailed
			job.Error = err.Error()
			job.UpdatedAt = time.Now().UTC()
			_, _ = store.UpdateJob(context.Background(), job)
			continue
		}
		job.PlanPath = planRelPath

		// Placeholder processing delay to keep logs readable.
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
