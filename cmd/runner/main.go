package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/executor"
	"github.com/swlee3306/infra-orch-studio/internal/renderer"
	"github.com/swlee3306/infra-orch-studio/internal/runtimecheck"
	storemysql "github.com/swlee3306/infra-orch-studio/internal/storage/mysql"
)

type runnerEnvironmentStore interface {
	UpdateJob(context.Context, domain.Job) (domain.Job, error)
	GetEnvironment(context.Context, string) (domain.Environment, error)
	UpdateEnvironment(context.Context, domain.Environment) (domain.Environment, error)
	CreateAuditEvent(context.Context, domain.AuditEvent) (domain.AuditEvent, error)
}

func main() {
	interval := envDuration("RUNNER_POLL_INTERVAL", 2*time.Second)
	processingDelay := envDuration("RUNNER_PROCESSING_DELAY", 300*time.Millisecond)
	templatesRoot := runtimecheck.ResolvePath(env("TEMPLATES_ROOT", "./templates/opentofu/environments"))
	modulesRoot := runtimecheck.ResolvePath(env("MODULES_ROOT", "./templates/opentofu/modules"))
	workdirsRoot := runtimecheck.ResolvePath(env("WORKDIRS_ROOT", "./workdirs"))
	templateName := env("TEMPLATE_NAME", "basic")
	tofuBin := env("TOFU_BIN", "tofu")
	mysqlCfg := storemysql.Config{
		Host:     env("MYSQL_HOST", ""),
		Port:     env("MYSQL_PORT", "3306"),
		Database: env("MYSQL_DB", ""),
		User:     env("MYSQL_USER", ""),
		Password: env("MYSQL_PASSWORD", ""),
		MySQLBin: env("MYSQL_BIN", "mysql"),
	}

	// OpenStack provider auth (clouds.yaml): forwarded to tofu via env vars.
	osCloud := env("OPENSTACK_CLOUD", "")
	osConfigPath := env("OPENSTACK_CONFIG_PATH", "")

	// Also set process env for safety: some providers/tools read directly from OS_*.
	if osCloud != "" {
		_ = os.Setenv("OS_CLOUD", osCloud)
	}
	if osConfigPath != "" {
		_ = os.Setenv("OS_CLIENT_CONFIG_FILE", osConfigPath)
	}

	if err := os.MkdirAll(workdirsRoot, 0o755); err != nil {
		log.Fatalf("mkdir: %v", err)
	}
	if err := runtimecheck.ValidateTemplateAssets(templatesRoot, modulesRoot); err != nil {
		log.Fatalf("validate template assets: %v", err)
	}

	store, err := storemysql.Open(mysqlCfg)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer store.Close()

	log.Printf("runner starting (poll interval=%s, mysql=%s:%s/%s)", interval, mysqlCfg.Host, mysqlCfg.Port, mysqlCfg.Database)

	t := time.NewTicker(interval)
	defer t.Stop()

	exec := executor.CommandExecutor{TofuBin: tofuBin}
	if osCloud != "" {
		if exec.Env == nil {
			exec.Env = map[string]string{}
		}
		exec.Env["OS_CLOUD"] = osCloud
	}
	if osConfigPath != "" {
		if exec.Env == nil {
			exec.Env = map[string]string{}
		}
		exec.Env["OS_CLIENT_CONFIG_FILE"] = osConfigPath
	}

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

		if job.Type == domain.JobTypeApply {
			if job.SourceJobID == "" {
				failJob(store, job, "apply job missing source_job_id")
				continue
			}

			// Always load the source (plan) job to obtain the authoritative workdir/plan path.
			src, err := store.GetJob(context.Background(), job.SourceJobID)
			if err != nil {
				failJob(store, job, "failed to load source job: "+err.Error())
				continue
			}
			if src.Type != domain.JobTypePlan || src.Status != domain.JobStatusDone {
				failJob(store, job, "source job must be done tofu.plan")
				continue
			}
			if src.Workdir == "" || src.PlanPath == "" {
				failJob(store, job, "source job missing workdir/plan_path")
				continue
			}

			log.Printf("apply job id=%s source_job_id=%s src_workdir=%s src_plan_path=%s", job.ID, job.SourceJobID, src.Workdir, src.PlanPath)
			job.Workdir = src.Workdir
			job.PlanPath = src.PlanPath
			job.TemplateName = src.TemplateName
			job.LogDir = filepath.Join(job.Workdir, ".infra-orch", "logs")
			job.Error = ""
			job.UpdatedAt = time.Now().UTC()
			if _, err := store.UpdateJob(context.Background(), job); err != nil {
				log.Printf("persist apply job metadata failed: id=%s err=%v", job.ID, err)
				continue
			}

			if _, err := os.Stat(filepath.Join(job.Workdir, job.PlanPath)); err != nil {
				failJob(store, job, "plan file not found: "+err.Error())
				continue
			}

			applyRes, err := exec.Apply(context.Background(), job.Workdir, job.PlanPath)
			if err != nil {
				log.Printf("apply command failed: id=%s exit=%d stderr=%s", job.ID, applyRes.ExitCode, strings.TrimSpace(string(applyRes.Stderr)))
				failJob(store, job, err.Error())
				continue
			}
			if job.Operation != domain.EnvironmentOperationDestroy {
				if outputRes, err := exec.OutputJSON(context.Background(), job.Workdir); err == nil {
					job.OutputsJSON = strings.TrimSpace(string(outputRes.Stdout))
				}
			}
			job.Status = domain.JobStatusDone
			job.Error = ""
			job.UpdatedAt = time.Now().UTC()
			if _, err := store.UpdateJob(context.Background(), job); err != nil {
				log.Printf("update job failed: id=%s err=%v", job.ID, err)
				continue
			}
			recordRunnerEnvironmentSuccess(store, job)
			log.Printf("finished job id=%s status=%s workdir=%s", job.ID, job.Status, job.Workdir)
			continue
		}

		vars, err := renderer.RenderEnvironmentVars(job.Environment)
		if err != nil {
			failJob(store, job, err.Error())
			continue
		}

		varsPayload := map[string]any{
			"environment_name": vars.EnvironmentName,
			"network":          vars.Network,
			"subnet":           vars.Subnet,
			"instances":        vars.Instances,
		}

		effectiveTemplateName := job.TemplateName
		if effectiveTemplateName == "" {
			effectiveTemplateName = templateName
		}
		wd, err := renderer.CreateWorkdir(renderer.WorkdirConfig{TemplatesRoot: templatesRoot, ModulesRoot: modulesRoot, WorkdirsRoot: workdirsRoot}, effectiveTemplateName, job.ID, varsPayload)
		if err != nil {
			failJob(store, job, err.Error())
			continue
		}
		job.TemplateName = effectiveTemplateName
		job.Workdir = wd.Dir
		job.LogDir = filepath.Join(job.Workdir, ".infra-orch", "logs")
		job.Error = ""
		job.UpdatedAt = time.Now().UTC()
		if _, err := store.UpdateJob(context.Background(), job); err != nil {
			log.Printf("persist workdir metadata failed: id=%s err=%v", job.ID, err)
			continue
		}

		initRes, err := exec.Init(context.Background(), job.Workdir)
		if err != nil {
			log.Printf("init command failed: id=%s exit=%d stderr=%s", job.ID, initRes.ExitCode, strings.TrimSpace(string(initRes.Stderr)))
			failJob(store, job, err.Error())
			continue
		}

		planRelPath := ".infra-orch/plan/plan.bin"
		job.PlanPath = planRelPath
		job.UpdatedAt = time.Now().UTC()
		if _, err := store.UpdateJob(context.Background(), job); err != nil {
			log.Printf("persist plan metadata failed: id=%s err=%v", job.ID, err)
			continue
		}

		planRes, err := func() (executor.RunResult, error) {
			if job.Operation == domain.EnvironmentOperationDestroy {
				return exec.PlanDestroy(context.Background(), job.Workdir, planRelPath)
			}
			return exec.Plan(context.Background(), job.Workdir, planRelPath)
		}()
		if err != nil {
			log.Printf("plan command failed: id=%s exit=%d stderr=%s", job.ID, planRes.ExitCode, strings.TrimSpace(string(planRes.Stderr)))
			failJob(store, job, err.Error())
			continue
		}

		// Placeholder processing delay to keep logs readable.
		time.Sleep(processingDelay)
		job.Status = domain.JobStatusDone
		job.Error = ""
		job.UpdatedAt = time.Now().UTC()

		if _, err := store.UpdateJob(context.Background(), job); err != nil {
			log.Printf("update job failed: id=%s err=%v", job.ID, err)
			continue
		}
		recordRunnerEnvironmentSuccess(store, job)
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

func failJob(store runnerEnvironmentStore, job domain.Job, message string) {
	job.Status = domain.JobStatusFailed
	job.Error = message
	job.UpdatedAt = time.Now().UTC()
	_, _ = store.UpdateJob(context.Background(), job)
	if job.EnvironmentID == "" {
		return
	}
	env, err := store.GetEnvironment(context.Background(), job.EnvironmentID)
	if err != nil {
		return
	}
	if env.LastJobID != "" && env.LastJobID != job.ID {
		recordSystemAudit(store, "environment", env.ID, "job.failed_ignored", "runner ignored stale failed job for environment state", map[string]any{
			"job_id":      job.ID,
			"expected_id": env.LastJobID,
		})
		return
	}
	env.Status = domain.EnvironmentStatusFailed
	env.LastError = message
	env.LastJobID = job.ID
	env.UpdatedAt = time.Now().UTC()
	_, _ = store.UpdateEnvironment(context.Background(), env)
	recordSystemAudit(store, "environment", env.ID, "job.failed", "runner marked environment failed", map[string]any{
		"job_id": job.ID,
		"error":  message,
	})
}

func recordRunnerEnvironmentSuccess(store runnerEnvironmentStore, job domain.Job) {
	if job.EnvironmentID == "" {
		return
	}
	env, err := store.GetEnvironment(context.Background(), job.EnvironmentID)
	if err != nil {
		return
	}
	if env.LastJobID != "" && env.LastJobID != job.ID {
		recordSystemAudit(store, "environment", env.ID, "job.succeeded_ignored", "runner ignored stale successful job for environment state", map[string]any{
			"job_id":      job.ID,
			"expected_id": env.LastJobID,
		})
		return
	}
	env.LastJobID = job.ID
	env.LastError = ""
	env.Workdir = job.Workdir
	env.PlanPath = job.PlanPath
	env.OutputsJSON = job.OutputsJSON
	env.UpdatedAt = time.Now().UTC()

	switch job.Type {
	case domain.JobTypePlan:
		env.LastPlanJobID = job.ID
		env.Status = domain.EnvironmentStatusPendingApproval
		env.ApprovalStatus = domain.ApprovalStatusPending
	case domain.JobTypeApply:
		env.LastApplyJobID = job.ID
		if job.Operation == domain.EnvironmentOperationDestroy {
			env.Status = domain.EnvironmentStatusDestroyed
		} else {
			env.Status = domain.EnvironmentStatusActive
		}
	}
	if _, err := store.UpdateEnvironment(context.Background(), env); err == nil {
		recordSystemAudit(store, "environment", env.ID, "job.succeeded", "runner updated environment state from job", map[string]any{
			"job_id":    job.ID,
			"job_type":  job.Type,
			"operation": job.Operation,
		})
	}
}

func recordSystemAudit(store runnerEnvironmentStore, resourceType, resourceID, action, message string, metadata map[string]any) {
	metadataJSON := ""
	if len(metadata) > 0 {
		if b, err := json.Marshal(metadata); err == nil {
			metadataJSON = string(b)
		}
	}
	event := domain.AuditEvent{
		ID:           uuid.NewString(),
		ResourceType: resourceType,
		ResourceID:   resourceID,
		Action:       action,
		ActorEmail:   "runner@system",
		Message:      message,
		MetadataJSON: metadataJSON,
		CreatedAt:    time.Now().UTC(),
	}
	if _, err := store.CreateAuditEvent(context.Background(), event); err != nil && err != sql.ErrNoRows {
		log.Printf("create audit event failed: action=%s resource=%s/%s err=%v", action, resourceType, resourceID, err)
	}
}
