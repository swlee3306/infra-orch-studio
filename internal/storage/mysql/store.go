package mysql

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/storage"
)

const (
	mysqlTimeLayout = "2006-01-02 15:04:05.999999"
	sqlTimeFormat   = "%Y-%m-%dT%H:%i:%s.%fZ"
)

type Config struct {
	Host     string
	Port     string
	Database string
	User     string
	Password string
	MySQLBin string
}

type Store struct {
	cfg Config
}

func Open(cfg Config) (*Store, error) {
	if cfg.Host == "" {
		return nil, errors.New("mysql host is required")
	}
	if cfg.Database == "" {
		return nil, errors.New("mysql database is required")
	}
	if cfg.User == "" {
		return nil, errors.New("mysql user is required")
	}
	if cfg.Port == "" {
		cfg.Port = "3306"
	}
	if cfg.MySQLBin == "" {
		cfg.MySQLBin = "mysql"
	}
	if _, err := exec.LookPath(cfg.MySQLBin); err != nil {
		return nil, fmt.Errorf("mysql binary %q not found in PATH", cfg.MySQLBin)
	}
	if err := validateIdentifier(cfg.Database); err != nil {
		return nil, fmt.Errorf("invalid mysql database name: %w", err)
	}

	s := &Store{cfg: cfg}
	if err := s.ensureDatabase(context.Background()); err != nil {
		return nil, err
	}
	if err := s.migrate(context.Background()); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return nil }

func (s *Store) ensureDatabase(ctx context.Context) error {
	query := fmt.Sprintf(
		"CREATE DATABASE IF NOT EXISTS %s CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
		quoteIdentifier(s.cfg.Database),
	)
	_, err := s.exec(ctx, false, query)
	if err != nil {
		return fmt.Errorf("ensure database: %w", err)
	}
	return nil
}

func (s *Store) migrate(ctx context.Context) error {
	const ddl = `
CREATE TABLE IF NOT EXISTS users (
	id VARCHAR(64) PRIMARY KEY,
	email VARCHAR(255) NOT NULL UNIQUE,
	password_hash TEXT NOT NULL,
	is_admin BOOLEAN NOT NULL DEFAULT FALSE,
	created_at DATETIME(6) NOT NULL,
	updated_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sessions (
	id VARCHAR(64) PRIMARY KEY,
	user_id VARCHAR(64) NOT NULL,
	token_hash CHAR(64) NOT NULL UNIQUE,
	created_at DATETIME(6) NOT NULL,
	expires_at DATETIME(6) NOT NULL,
	INDEX idx_sessions_user_id (user_id),
	INDEX idx_sessions_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS jobs (
	id VARCHAR(64) PRIMARY KEY,
	type VARCHAR(64) NOT NULL,
	status VARCHAR(32) NOT NULL,
	created_at DATETIME(6) NOT NULL,
	updated_at DATETIME(6) NOT NULL,
	environment_id VARCHAR(64) NOT NULL DEFAULT '',
	operation VARCHAR(32) NOT NULL DEFAULT '',
	environment_json LONGTEXT NOT NULL,
	template_name TEXT NOT NULL,
	workdir TEXT NOT NULL,
	log_dir VARCHAR(2048) NOT NULL DEFAULT '',
	plan_path TEXT NOT NULL,
	outputs_json LONGTEXT NOT NULL,
	source_job_id VARCHAR(64) NOT NULL,
	claim_token VARCHAR(128) NOT NULL DEFAULT '',
	retry_count INT NOT NULL DEFAULT 0,
	max_retries INT NOT NULL DEFAULT 0,
	requested_by VARCHAR(255) NOT NULL DEFAULT '',
	error TEXT NOT NULL,
	INDEX idx_jobs_created_at (created_at),
	INDEX idx_jobs_status_created_at (status, created_at),
	INDEX idx_jobs_claim_token (claim_token),
	INDEX idx_jobs_environment_id (environment_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS environments (
	id VARCHAR(64) PRIMARY KEY,
	name VARCHAR(255) NOT NULL,
	status VARCHAR(32) NOT NULL,
	operation VARCHAR(32) NOT NULL,
	approval_status VARCHAR(32) NOT NULL,
	spec_json LONGTEXT NOT NULL,
	created_by_user_id VARCHAR(64) NOT NULL DEFAULT '',
	created_by_email VARCHAR(255) NOT NULL DEFAULT '',
	approved_by_user_id VARCHAR(64) NOT NULL DEFAULT '',
	approved_by_email VARCHAR(255) NOT NULL DEFAULT '',
	approved_at DATETIME(6) NULL,
	last_plan_job_id VARCHAR(64) NOT NULL DEFAULT '',
	last_apply_job_id VARCHAR(64) NOT NULL DEFAULT '',
	last_job_id VARCHAR(64) NOT NULL DEFAULT '',
	last_error TEXT NOT NULL,
	retry_count INT NOT NULL DEFAULT 0,
	max_retries INT NOT NULL DEFAULT 0,
	workdir TEXT NOT NULL,
	plan_path TEXT NOT NULL,
	outputs_json LONGTEXT NOT NULL,
	created_at DATETIME(6) NOT NULL,
	updated_at DATETIME(6) NOT NULL,
	INDEX idx_environments_updated_at (updated_at),
	INDEX idx_environments_status_updated_at (status, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS audit_events (
	id VARCHAR(64) PRIMARY KEY,
	resource_type VARCHAR(64) NOT NULL,
	resource_id VARCHAR(64) NOT NULL,
	action VARCHAR(128) NOT NULL,
	actor_user_id VARCHAR(64) NOT NULL DEFAULT '',
	actor_email VARCHAR(255) NOT NULL DEFAULT '',
	message TEXT NOT NULL,
	metadata_json LONGTEXT NOT NULL,
	created_at DATETIME(6) NOT NULL,
	INDEX idx_audit_resource_created_at (resource_type, resource_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP(6);
`
	if _, err := s.exec(ctx, true, ddl); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	for _, col := range []struct {
		name       string
		definition string
	}{
		{name: "environment_id", definition: "VARCHAR(64) NOT NULL DEFAULT ''"},
		{name: "operation", definition: "VARCHAR(32) NOT NULL DEFAULT ''"},
		{name: "log_dir", definition: "VARCHAR(2048) NOT NULL DEFAULT ''"},
		{name: "outputs_json", definition: "LONGTEXT NOT NULL"},
		{name: "retry_count", definition: "INT NOT NULL DEFAULT 0"},
		{name: "max_retries", definition: "INT NOT NULL DEFAULT 0"},
		{name: "requested_by", definition: "VARCHAR(255) NOT NULL DEFAULT ''"},
	} {
		if err := s.addColumnIfMissing(ctx, "jobs", col.name, col.definition); err != nil {
			return fmt.Errorf("migrate alter jobs: %w", err)
		}
	}
	return nil
}

func (s *Store) addColumnIfMissing(ctx context.Context, tableName string, columnName string, definition string) error {
	query := fmt.Sprintf(
		`SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = %s AND table_name = %s AND column_name = %s;`,
		quoteString(s.cfg.Database),
		quoteString(tableName),
		quoteString(columnName),
	)
	out, err := s.exec(ctx, false, query)
	if err != nil {
		return err
	}
	lines := outputLines(out)
	if len(lines) > 0 && lines[len(lines)-1] != "0" {
		return nil
	}
	alter := fmt.Sprintf(
		`ALTER TABLE %s ADD COLUMN %s %s;`,
		quoteIdentifier(tableName),
		quoteIdentifier(columnName),
		definition,
	)
	_, err = s.exec(ctx, true, alter)
	return err
}

func (s *Store) CreateJob(ctx context.Context, j domain.Job) (domain.Job, error) {
	envJSON, err := json.Marshal(j.Environment)
	if err != nil {
		return domain.Job{}, fmt.Errorf("marshal environment: %w", err)
	}

	query := fmt.Sprintf(
		`INSERT INTO jobs (
			id, type, status, created_at, updated_at, environment_id, operation, environment_json, template_name, workdir, log_dir, plan_path, outputs_json, source_job_id, claim_token, retry_count, max_retries, requested_by, error
		) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '', %d, %d, %s, %s);`,
		quoteString(j.ID),
		quoteString(string(j.Type)),
		quoteString(string(j.Status)),
		quoteTime(j.CreatedAt),
		quoteTime(j.UpdatedAt),
		quoteString(j.EnvironmentID),
		quoteString(string(j.Operation)),
		quoteString(string(envJSON)),
		quoteString(j.TemplateName),
		quoteString(j.Workdir),
		quoteString(j.LogDir),
		quoteString(j.PlanPath),
		quoteString(j.OutputsJSON),
		quoteString(j.SourceJobID),
		j.RetryCount,
		j.MaxRetries,
		quoteString(j.RequestedBy),
		quoteString(j.Error),
	)
	if _, err := s.exec(ctx, true, query); err != nil {
		return domain.Job{}, err
	}
	return j, nil
}

func (s *Store) GetJob(ctx context.Context, id string) (domain.Job, error) {
	query := fmt.Sprintf(
		`SELECT %s FROM jobs WHERE id = %s LIMIT 1;`,
		jobSelectColumns(),
		quoteString(id),
	)
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return domain.Job{}, err
	}
	lines := outputLines(out)
	if len(lines) == 0 {
		return domain.Job{}, sql.ErrNoRows
	}
	return parseJobLine(lines[0])
}

func (s *Store) ListJobs(ctx context.Context, limit int) ([]domain.Job, error) {
	if limit <= 0 {
		limit = 50
	}
	query := fmt.Sprintf(
		`SELECT %s FROM jobs ORDER BY created_at DESC LIMIT %d;`,
		jobSelectColumns(),
		limit,
	)
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return nil, err
	}
	lines := outputLines(out)
	jobs := make([]domain.Job, 0, len(lines))
	for _, line := range lines {
		job, err := parseJobLine(line)
		if err != nil {
			return nil, err
		}
		jobs = append(jobs, job)
	}
	return jobs, nil
}

func (s *Store) UpdateJob(ctx context.Context, j domain.Job) (domain.Job, error) {
	envJSON, err := json.Marshal(j.Environment)
	if err != nil {
		return domain.Job{}, fmt.Errorf("marshal environment: %w", err)
	}

	query := fmt.Sprintf(
		`UPDATE jobs
		 SET type = %s,
		     status = %s,
		     updated_at = %s,
		     environment_id = %s,
		     operation = %s,
		     environment_json = %s,
		     template_name = %s,
		     workdir = %s,
		     log_dir = %s,
		     plan_path = %s,
		     outputs_json = %s,
		     source_job_id = %s,
		     claim_token = '',
		     retry_count = %d,
		     max_retries = %d,
		     requested_by = %s,
		     error = %s
		 WHERE id = %s;
		 SELECT ROW_COUNT();`,
		quoteString(string(j.Type)),
		quoteString(string(j.Status)),
		quoteTime(j.UpdatedAt),
		quoteString(j.EnvironmentID),
		quoteString(string(j.Operation)),
		quoteString(string(envJSON)),
		quoteString(j.TemplateName),
		quoteString(j.Workdir),
		quoteString(j.LogDir),
		quoteString(j.PlanPath),
		quoteString(j.OutputsJSON),
		quoteString(j.SourceJobID),
		j.RetryCount,
		j.MaxRetries,
		quoteString(j.RequestedBy),
		quoteString(j.Error),
		quoteString(j.ID),
	)
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return domain.Job{}, err
	}
	lines := outputLines(out)
	if len(lines) == 0 || strings.TrimSpace(lines[len(lines)-1]) == "0" {
		return domain.Job{}, sql.ErrNoRows
	}
	return j, nil
}

func (s *Store) ClaimNextQueuedJob(ctx context.Context) (domain.Job, bool, error) {
	token := uuid.NewString()
	now := time.Now().UTC()

	query := fmt.Sprintf(
		`UPDATE jobs
		 SET status = %s,
		     updated_at = %s,
		     claim_token = %s
		 WHERE id = (
		     SELECT id FROM (
		         SELECT id
		         FROM jobs
		         WHERE status = %s
		         ORDER BY created_at ASC
		         LIMIT 1
		     ) AS next_job
		 ) AND status = %s;
		 SELECT %s FROM jobs WHERE claim_token = %s LIMIT 1;`,
		quoteString(string(domain.JobStatusRunning)),
		quoteTime(now),
		quoteString(token),
		quoteString(string(domain.JobStatusQueued)),
		quoteString(string(domain.JobStatusQueued)),
		jobSelectColumns(),
		quoteString(token),
	)
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return domain.Job{}, false, err
	}
	lines := outputLines(out)
	if len(lines) == 0 {
		return domain.Job{}, false, nil
	}
	job, err := parseJobLine(lines[len(lines)-1])
	if err != nil {
		return domain.Job{}, false, err
	}
	return job, true, nil
}

func (s *Store) CreateUser(ctx context.Context, user domain.User) (domain.User, error) {
	query := fmt.Sprintf(
		`INSERT INTO users (id, email, password_hash, is_admin, created_at, updated_at)
		 VALUES (%s, %s, %s, %s, %s, %s);`,
		quoteString(user.ID),
		quoteString(strings.ToLower(user.Email)),
		quoteString(user.PasswordHash),
		boolLiteral(user.IsAdmin),
		quoteTime(user.CreatedAt),
		quoteTime(user.UpdatedAt),
	)
	if _, err := s.exec(ctx, true, query); err != nil {
		return domain.User{}, err
	}
	user.Email = strings.ToLower(user.Email)
	return user, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (domain.User, error) {
	query := fmt.Sprintf(
		`SELECT %s FROM users WHERE email = %s LIMIT 1;`,
		userSelectColumns(),
		quoteString(strings.ToLower(email)),
	)
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return domain.User{}, err
	}
	lines := outputLines(out)
	if len(lines) == 0 {
		return domain.User{}, sql.ErrNoRows
	}
	return parseUserLine(lines[0])
}

func (s *Store) GetUserByID(ctx context.Context, id string) (domain.User, error) {
	query := fmt.Sprintf(
		`SELECT %s FROM users WHERE id = %s LIMIT 1;`,
		userSelectColumns(),
		quoteString(id),
	)
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return domain.User{}, err
	}
	lines := outputLines(out)
	if len(lines) == 0 {
		return domain.User{}, sql.ErrNoRows
	}
	return parseUserLine(lines[0])
}

func (s *Store) ListUsers(ctx context.Context, limit int) ([]domain.User, error) {
	if limit <= 0 {
		limit = 50
	}
	query := fmt.Sprintf(
		`SELECT %s FROM users ORDER BY created_at DESC LIMIT %d;`,
		userSelectColumns(),
		limit,
	)
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return nil, err
	}
	lines := outputLines(out)
	users := make([]domain.User, 0, len(lines))
	for _, line := range lines {
		user, err := parseUserLine(line)
		if err != nil {
			return nil, err
		}
		users = append(users, user)
	}
	return users, nil
}

func (s *Store) UpsertAdminUser(ctx context.Context, user domain.User) (domain.User, error) {
	now := user.UpdatedAt
	if now.IsZero() {
		now = time.Now().UTC()
	}
	if user.CreatedAt.IsZero() {
		user.CreatedAt = now
	}
	user.UpdatedAt = now
	user.IsAdmin = true
	query := fmt.Sprintf(
		`INSERT INTO users (id, email, password_hash, is_admin, created_at, updated_at)
		 VALUES (%s, %s, %s, TRUE, %s, %s)
		 ON DUPLICATE KEY UPDATE
		     password_hash = VALUES(password_hash),
		     is_admin = TRUE,
		     updated_at = VALUES(updated_at);`,
		quoteString(user.ID),
		quoteString(strings.ToLower(user.Email)),
		quoteString(user.PasswordHash),
		quoteTime(user.CreatedAt),
		quoteTime(user.UpdatedAt),
	)
	if _, err := s.exec(ctx, true, query); err != nil {
		return domain.User{}, err
	}
	return s.GetUserByEmail(ctx, user.Email)
}

func (s *Store) CreateSession(ctx context.Context, session domain.Session) (domain.Session, error) {
	query := fmt.Sprintf(
		`INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at)
		 VALUES (%s, %s, %s, %s, %s);`,
		quoteString(session.ID),
		quoteString(session.UserID),
		quoteString(session.TokenHash),
		quoteTime(session.CreatedAt),
		quoteTime(session.ExpiresAt),
	)
	if _, err := s.exec(ctx, true, query); err != nil {
		return domain.Session{}, err
	}
	return session, nil
}

func (s *Store) GetSessionWithUser(ctx context.Context, tokenHash string) (domain.Session, domain.User, error) {
	query := fmt.Sprintf(
		`SELECT %s, %s
		 FROM sessions s
		 JOIN users u ON u.id = s.user_id
		 WHERE s.token_hash = %s
		   AND s.expires_at > UTC_TIMESTAMP(6)
		 LIMIT 1;`,
		sessionSelectColumns("s"),
		userSelectColumnsWithAlias("u"),
		quoteString(tokenHash),
	)
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}
	lines := outputLines(out)
	if len(lines) == 0 {
		return domain.Session{}, domain.User{}, sql.ErrNoRows
	}
	return parseSessionUserLine(lines[0])
}

func (s *Store) DeleteSessionByTokenHash(ctx context.Context, tokenHash string) error {
	query := fmt.Sprintf(`DELETE FROM sessions WHERE token_hash = %s;`, quoteString(tokenHash))
	_, err := s.exec(ctx, true, query)
	return err
}

func (s *Store) CreateEnvironment(ctx context.Context, env domain.Environment) (domain.Environment, error) {
	specJSON, err := json.Marshal(env.Spec)
	if err != nil {
		return domain.Environment{}, fmt.Errorf("marshal environment spec: %w", err)
	}
	approvedAt := "NULL"
	if env.ApprovedAt != nil {
		approvedAt = quoteTime(*env.ApprovedAt)
	}
	query := fmt.Sprintf(
		`INSERT INTO environments (
			id, name, status, operation, approval_status, spec_json, created_by_user_id, created_by_email, approved_by_user_id, approved_by_email, approved_at, last_plan_job_id, last_apply_job_id, last_job_id, last_error, retry_count, max_retries, workdir, plan_path, outputs_json, created_at, updated_at
		) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %d, %d, %s, %s, %s, %s, %s);`,
		quoteString(env.ID),
		quoteString(env.Name),
		quoteString(string(env.Status)),
		quoteString(string(env.Operation)),
		quoteString(string(env.ApprovalStatus)),
		quoteString(string(specJSON)),
		quoteString(env.CreatedByUserID),
		quoteString(env.CreatedByEmail),
		quoteString(env.ApprovedByUserID),
		quoteString(env.ApprovedByEmail),
		approvedAt,
		quoteString(env.LastPlanJobID),
		quoteString(env.LastApplyJobID),
		quoteString(env.LastJobID),
		quoteString(env.LastError),
		env.RetryCount,
		env.MaxRetries,
		quoteString(env.Workdir),
		quoteString(env.PlanPath),
		quoteString(env.OutputsJSON),
		quoteTime(env.CreatedAt),
		quoteTime(env.UpdatedAt),
	)
	if _, err := s.exec(ctx, true, query); err != nil {
		return domain.Environment{}, err
	}
	return env, nil
}

func (s *Store) GetEnvironment(ctx context.Context, id string) (domain.Environment, error) {
	query := fmt.Sprintf(`SELECT %s FROM environments WHERE id = %s LIMIT 1;`, environmentSelectColumns(), quoteString(id))
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return domain.Environment{}, err
	}
	lines := outputLines(out)
	if len(lines) == 0 {
		return domain.Environment{}, sql.ErrNoRows
	}
	return parseEnvironmentLine(lines[0])
}

func (s *Store) ListEnvironments(ctx context.Context, limit int) ([]domain.Environment, error) {
	if limit <= 0 {
		limit = 50
	}
	query := fmt.Sprintf(`SELECT %s FROM environments ORDER BY updated_at DESC LIMIT %d;`, environmentSelectColumns(), limit)
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return nil, err
	}
	lines := outputLines(out)
	items := make([]domain.Environment, 0, len(lines))
	for _, line := range lines {
		env, err := parseEnvironmentLine(line)
		if err != nil {
			return nil, err
		}
		items = append(items, env)
	}
	return items, nil
}

func (s *Store) UpdateEnvironment(ctx context.Context, env domain.Environment) (domain.Environment, error) {
	specJSON, err := json.Marshal(env.Spec)
	if err != nil {
		return domain.Environment{}, fmt.Errorf("marshal environment spec: %w", err)
	}
	approvedAt := "NULL"
	if env.ApprovedAt != nil {
		approvedAt = quoteTime(*env.ApprovedAt)
	}
	query := fmt.Sprintf(
		`UPDATE environments
		 SET name = %s,
		     status = %s,
		     operation = %s,
		     approval_status = %s,
		     spec_json = %s,
		     created_by_user_id = %s,
		     created_by_email = %s,
		     approved_by_user_id = %s,
		     approved_by_email = %s,
		     approved_at = %s,
		     last_plan_job_id = %s,
		     last_apply_job_id = %s,
		     last_job_id = %s,
		     last_error = %s,
		     retry_count = %d,
		     max_retries = %d,
		     workdir = %s,
		     plan_path = %s,
		     outputs_json = %s,
		     updated_at = %s
		 WHERE id = %s;
		 SELECT ROW_COUNT();`,
		quoteString(env.Name),
		quoteString(string(env.Status)),
		quoteString(string(env.Operation)),
		quoteString(string(env.ApprovalStatus)),
		quoteString(string(specJSON)),
		quoteString(env.CreatedByUserID),
		quoteString(env.CreatedByEmail),
		quoteString(env.ApprovedByUserID),
		quoteString(env.ApprovedByEmail),
		approvedAt,
		quoteString(env.LastPlanJobID),
		quoteString(env.LastApplyJobID),
		quoteString(env.LastJobID),
		quoteString(env.LastError),
		env.RetryCount,
		env.MaxRetries,
		quoteString(env.Workdir),
		quoteString(env.PlanPath),
		quoteString(env.OutputsJSON),
		quoteTime(env.UpdatedAt),
		quoteString(env.ID),
	)
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return domain.Environment{}, err
	}
	lines := outputLines(out)
	if len(lines) == 0 || strings.TrimSpace(lines[len(lines)-1]) == "0" {
		return domain.Environment{}, sql.ErrNoRows
	}
	return env, nil
}

func (s *Store) CreateAuditEvent(ctx context.Context, event domain.AuditEvent) (domain.AuditEvent, error) {
	query := fmt.Sprintf(
		`INSERT INTO audit_events (
			id, resource_type, resource_id, action, actor_user_id, actor_email, message, metadata_json, created_at
		) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s);`,
		quoteString(event.ID),
		quoteString(event.ResourceType),
		quoteString(event.ResourceID),
		quoteString(event.Action),
		quoteString(event.ActorUserID),
		quoteString(event.ActorEmail),
		quoteString(event.Message),
		quoteString(event.MetadataJSON),
		quoteTime(event.CreatedAt),
	)
	if _, err := s.exec(ctx, true, query); err != nil {
		return domain.AuditEvent{}, err
	}
	return event, nil
}

func (s *Store) ListAuditEvents(ctx context.Context, resourceType, resourceID string, limit int) ([]domain.AuditEvent, error) {
	if limit <= 0 {
		limit = 100
	}
	filters := []string{"1=1"}
	if resourceType != "" {
		filters = append(filters, "resource_type = "+quoteString(resourceType))
	}
	if resourceID != "" {
		filters = append(filters, "resource_id = "+quoteString(resourceID))
	}
	query := fmt.Sprintf(
		`SELECT %s FROM audit_events WHERE %s ORDER BY created_at DESC LIMIT %d;`,
		auditSelectColumns(),
		strings.Join(filters, " AND "),
		limit,
	)
	out, err := s.exec(ctx, true, query)
	if err != nil {
		return nil, err
	}
	lines := outputLines(out)
	items := make([]domain.AuditEvent, 0, len(lines))
	for _, line := range lines {
		event, err := parseAuditLine(line)
		if err != nil {
			return nil, err
		}
		items = append(items, event)
	}
	return items, nil
}

func (s *Store) exec(ctx context.Context, withDatabase bool, query string) (string, error) {
	args := []string{
		"--protocol=TCP",
		"-h", s.cfg.Host,
		"-P", s.cfg.Port,
		"-u", s.cfg.User,
		"--batch",
		"--raw",
		"--skip-column-names",
		"--default-character-set=utf8mb4",
	}
	if withDatabase {
		args = append(args, "-D", s.cfg.Database)
	}
	args = append(args, "-e", query)

	cmd := exec.CommandContext(ctx, s.cfg.MySQLBin, args...)
	cmd.Env = append(os.Environ(), "MYSQL_PWD="+s.cfg.Password)

	out, err := cmd.CombinedOutput()
	if err != nil {
		errOut := strings.TrimSpace(string(out))
		if strings.Contains(errOut, "Duplicate entry") {
			return "", storage.ErrConflict
		}
		if errOut == "" {
			errOut = err.Error()
		}
		return "", fmt.Errorf("mysql exec failed: %s", errOut)
	}
	return string(out), nil
}

func outputLines(out string) []string {
	raw := strings.Split(strings.ReplaceAll(out, "\r\n", "\n"), "\n")
	lines := make([]string, 0, len(raw))
	for _, line := range raw {
		if strings.TrimSpace(line) == "" {
			continue
		}
		lines = append(lines, strings.TrimRight(line, "\r"))
	}
	return lines
}

func jobSelectColumns() string {
	return strings.Join([]string{
		base64ColumnExpr("id"),
		base64ColumnExpr("type"),
		base64ColumnExpr("status"),
		fmt.Sprintf("DATE_FORMAT(created_at, '%s')", sqlTimeFormat),
		fmt.Sprintf("DATE_FORMAT(updated_at, '%s')", sqlTimeFormat),
		base64ColumnExpr("environment_id"),
		base64ColumnExpr("operation"),
		base64ColumnExpr("environment_json"),
		base64ColumnExpr("template_name"),
		base64ColumnExpr("workdir"),
		base64ColumnExpr("log_dir"),
		base64ColumnExpr("plan_path"),
		base64ColumnExpr("outputs_json"),
		base64ColumnExpr("source_job_id"),
		"retry_count",
		"max_retries",
		base64ColumnExpr("requested_by"),
		base64ColumnExpr("error"),
	}, ", ")
}

func environmentSelectColumns() string {
	return strings.Join([]string{
		base64ColumnExpr("id"),
		base64ColumnExpr("name"),
		base64ColumnExpr("status"),
		base64ColumnExpr("operation"),
		base64ColumnExpr("approval_status"),
		base64ColumnExpr("spec_json"),
		base64ColumnExpr("created_by_user_id"),
		base64ColumnExpr("created_by_email"),
		base64ColumnExpr("approved_by_user_id"),
		base64ColumnExpr("approved_by_email"),
		fmt.Sprintf("IFNULL(DATE_FORMAT(approved_at, '%s'), '')", sqlTimeFormat),
		base64ColumnExpr("last_plan_job_id"),
		base64ColumnExpr("last_apply_job_id"),
		base64ColumnExpr("last_job_id"),
		base64ColumnExpr("last_error"),
		"retry_count",
		"max_retries",
		base64ColumnExpr("workdir"),
		base64ColumnExpr("plan_path"),
		base64ColumnExpr("outputs_json"),
		fmt.Sprintf("DATE_FORMAT(created_at, '%s')", sqlTimeFormat),
		fmt.Sprintf("DATE_FORMAT(updated_at, '%s')", sqlTimeFormat),
	}, ", ")
}

func auditSelectColumns() string {
	return strings.Join([]string{
		base64ColumnExpr("id"),
		base64ColumnExpr("resource_type"),
		base64ColumnExpr("resource_id"),
		base64ColumnExpr("action"),
		base64ColumnExpr("actor_user_id"),
		base64ColumnExpr("actor_email"),
		base64ColumnExpr("message"),
		base64ColumnExpr("metadata_json"),
		fmt.Sprintf("DATE_FORMAT(created_at, '%s')", sqlTimeFormat),
	}, ", ")
}

func userSelectColumns() string {
	return userSelectColumnsWithAlias("users")
}

func userSelectColumnsWithAlias(alias string) string {
	return strings.Join([]string{
		// MySQL TO_BASE64() inserts line breaks every 76 chars; strip them to keep
		// results parseable as single-row, tab-delimited output.
		base64ColumnExpr(fmt.Sprintf("%s.id", alias)),
		base64ColumnExpr(fmt.Sprintf("%s.email", alias)),
		base64ColumnExpr(fmt.Sprintf("%s.password_hash", alias)),
		fmt.Sprintf("%s.is_admin", alias),
		fmt.Sprintf("DATE_FORMAT(%s.created_at, '%s')", alias, sqlTimeFormat),
		fmt.Sprintf("DATE_FORMAT(%s.updated_at, '%s')", alias, sqlTimeFormat),
	}, ", ")
}

func sessionSelectColumns(alias string) string {
	return strings.Join([]string{
		base64ColumnExpr(fmt.Sprintf("%s.id", alias)),
		base64ColumnExpr(fmt.Sprintf("%s.user_id", alias)),
		base64ColumnExpr(fmt.Sprintf("%s.token_hash", alias)),
		fmt.Sprintf("DATE_FORMAT(%s.created_at, '%s')", alias, sqlTimeFormat),
		fmt.Sprintf("DATE_FORMAT(%s.expires_at, '%s')", alias, sqlTimeFormat),
	}, ", ")
}

func base64ColumnExpr(expr string) string {
	return fmt.Sprintf("REPLACE(REPLACE(TO_BASE64(%s), CHAR(10), ''), CHAR(13), '')", expr)
}

func parseJobLine(line string) (domain.Job, error) {
	fields := strings.Split(line, "\t")
	if len(fields) != 18 {
		return domain.Job{}, fmt.Errorf("unexpected job field count: %d", len(fields))
	}

	var job domain.Job
	var err error
	if job.ID, err = decodeBase64Field(fields[0]); err != nil {
		return domain.Job{}, err
	}
	if v, err := decodeBase64Field(fields[1]); err == nil {
		job.Type = domain.JobType(v)
	} else {
		return domain.Job{}, err
	}
	if v, err := decodeBase64Field(fields[2]); err == nil {
		job.Status = domain.JobStatus(v)
	} else {
		return domain.Job{}, err
	}
	if job.CreatedAt, err = time.Parse(time.RFC3339Nano, fields[3]); err != nil {
		return domain.Job{}, fmt.Errorf("parse created_at: %w", err)
	}
	if job.UpdatedAt, err = time.Parse(time.RFC3339Nano, fields[4]); err != nil {
		return domain.Job{}, fmt.Errorf("parse updated_at: %w", err)
	}
	if job.EnvironmentID, err = decodeBase64Field(fields[5]); err != nil {
		return domain.Job{}, err
	}
	if v, err := decodeBase64Field(fields[6]); err == nil {
		job.Operation = domain.EnvironmentOperation(v)
	} else {
		return domain.Job{}, err
	}
	envJSON, err := decodeBase64Field(fields[7])
	if err != nil {
		return domain.Job{}, err
	}
	if err := json.Unmarshal([]byte(envJSON), &job.Environment); err != nil {
		return domain.Job{}, fmt.Errorf("unmarshal environment: %w", err)
	}
	if job.TemplateName, err = decodeBase64Field(fields[8]); err != nil {
		return domain.Job{}, err
	}
	if job.Workdir, err = decodeBase64Field(fields[9]); err != nil {
		return domain.Job{}, err
	}
	if job.LogDir, err = decodeBase64Field(fields[10]); err != nil {
		return domain.Job{}, err
	}
	if job.PlanPath, err = decodeBase64Field(fields[11]); err != nil {
		return domain.Job{}, err
	}
	if job.OutputsJSON, err = decodeBase64Field(fields[12]); err != nil {
		return domain.Job{}, err
	}
	if job.SourceJobID, err = decodeBase64Field(fields[13]); err != nil {
		return domain.Job{}, err
	}
	if job.RetryCount, err = parseIntField(fields[14]); err != nil {
		return domain.Job{}, err
	}
	if job.MaxRetries, err = parseIntField(fields[15]); err != nil {
		return domain.Job{}, err
	}
	if job.RequestedBy, err = decodeBase64Field(fields[16]); err != nil {
		return domain.Job{}, err
	}
	if job.Error, err = decodeBase64Field(fields[17]); err != nil {
		return domain.Job{}, err
	}
	return job, nil
}

func parseEnvironmentLine(line string) (domain.Environment, error) {
	fields := strings.Split(line, "\t")
	if len(fields) != 22 {
		return domain.Environment{}, fmt.Errorf("unexpected environment field count: %d", len(fields))
	}

	var env domain.Environment
	var err error
	if env.ID, err = decodeBase64Field(fields[0]); err != nil {
		return domain.Environment{}, err
	}
	if env.Name, err = decodeBase64Field(fields[1]); err != nil {
		return domain.Environment{}, err
	}
	if v, err := decodeBase64Field(fields[2]); err == nil {
		env.Status = domain.EnvironmentStatus(v)
	} else {
		return domain.Environment{}, err
	}
	if v, err := decodeBase64Field(fields[3]); err == nil {
		env.Operation = domain.EnvironmentOperation(v)
	} else {
		return domain.Environment{}, err
	}
	if v, err := decodeBase64Field(fields[4]); err == nil {
		env.ApprovalStatus = domain.ApprovalStatus(v)
	} else {
		return domain.Environment{}, err
	}
	specJSON, err := decodeBase64Field(fields[5])
	if err != nil {
		return domain.Environment{}, err
	}
	if err := json.Unmarshal([]byte(specJSON), &env.Spec); err != nil {
		return domain.Environment{}, fmt.Errorf("unmarshal spec: %w", err)
	}
	if env.CreatedByUserID, err = decodeBase64Field(fields[6]); err != nil {
		return domain.Environment{}, err
	}
	if env.CreatedByEmail, err = decodeBase64Field(fields[7]); err != nil {
		return domain.Environment{}, err
	}
	if env.ApprovedByUserID, err = decodeBase64Field(fields[8]); err != nil {
		return domain.Environment{}, err
	}
	if env.ApprovedByEmail, err = decodeBase64Field(fields[9]); err != nil {
		return domain.Environment{}, err
	}
	if env.ApprovedAt, err = parseOptionalTimeField(fields[10]); err != nil {
		return domain.Environment{}, err
	}
	if env.LastPlanJobID, err = decodeBase64Field(fields[11]); err != nil {
		return domain.Environment{}, err
	}
	if env.LastApplyJobID, err = decodeBase64Field(fields[12]); err != nil {
		return domain.Environment{}, err
	}
	if env.LastJobID, err = decodeBase64Field(fields[13]); err != nil {
		return domain.Environment{}, err
	}
	if env.LastError, err = decodeBase64Field(fields[14]); err != nil {
		return domain.Environment{}, err
	}
	if env.RetryCount, err = parseIntField(fields[15]); err != nil {
		return domain.Environment{}, err
	}
	if env.MaxRetries, err = parseIntField(fields[16]); err != nil {
		return domain.Environment{}, err
	}
	if env.Workdir, err = decodeBase64Field(fields[17]); err != nil {
		return domain.Environment{}, err
	}
	if env.PlanPath, err = decodeBase64Field(fields[18]); err != nil {
		return domain.Environment{}, err
	}
	if env.OutputsJSON, err = decodeBase64Field(fields[19]); err != nil {
		return domain.Environment{}, err
	}
	if env.CreatedAt, err = time.Parse(time.RFC3339Nano, fields[20]); err != nil {
		return domain.Environment{}, fmt.Errorf("parse environment created_at: %w", err)
	}
	if env.UpdatedAt, err = time.Parse(time.RFC3339Nano, fields[21]); err != nil {
		return domain.Environment{}, fmt.Errorf("parse environment updated_at: %w", err)
	}
	return env, nil
}

func parseAuditLine(line string) (domain.AuditEvent, error) {
	fields := strings.Split(line, "\t")
	if len(fields) != 9 {
		return domain.AuditEvent{}, fmt.Errorf("unexpected audit field count: %d", len(fields))
	}
	var event domain.AuditEvent
	var err error
	if event.ID, err = decodeBase64Field(fields[0]); err != nil {
		return domain.AuditEvent{}, err
	}
	if event.ResourceType, err = decodeBase64Field(fields[1]); err != nil {
		return domain.AuditEvent{}, err
	}
	if event.ResourceID, err = decodeBase64Field(fields[2]); err != nil {
		return domain.AuditEvent{}, err
	}
	if event.Action, err = decodeBase64Field(fields[3]); err != nil {
		return domain.AuditEvent{}, err
	}
	if event.ActorUserID, err = decodeBase64Field(fields[4]); err != nil {
		return domain.AuditEvent{}, err
	}
	if event.ActorEmail, err = decodeBase64Field(fields[5]); err != nil {
		return domain.AuditEvent{}, err
	}
	if event.Message, err = decodeBase64Field(fields[6]); err != nil {
		return domain.AuditEvent{}, err
	}
	if event.MetadataJSON, err = decodeBase64Field(fields[7]); err != nil {
		return domain.AuditEvent{}, err
	}
	if event.CreatedAt, err = time.Parse(time.RFC3339Nano, fields[8]); err != nil {
		return domain.AuditEvent{}, fmt.Errorf("parse audit created_at: %w", err)
	}
	return event, nil
}

func parseUserLine(line string) (domain.User, error) {
	fields := strings.Split(line, "\t")
	if len(fields) != 6 {
		return domain.User{}, fmt.Errorf("unexpected user field count: %d", len(fields))
	}

	var user domain.User
	var err error
	if user.ID, err = decodeBase64Field(fields[0]); err != nil {
		return domain.User{}, err
	}
	if user.Email, err = decodeBase64Field(fields[1]); err != nil {
		return domain.User{}, err
	}
	if user.PasswordHash, err = decodeBase64Field(fields[2]); err != nil {
		return domain.User{}, err
	}
	user.IsAdmin = fields[3] == "1"
	if user.CreatedAt, err = time.Parse(time.RFC3339Nano, fields[4]); err != nil {
		return domain.User{}, fmt.Errorf("parse user created_at: %w", err)
	}
	if user.UpdatedAt, err = time.Parse(time.RFC3339Nano, fields[5]); err != nil {
		return domain.User{}, fmt.Errorf("parse user updated_at: %w", err)
	}
	return user, nil
}

func parseSessionUserLine(line string) (domain.Session, domain.User, error) {
	fields := strings.Split(line, "\t")
	if len(fields) != 11 {
		return domain.Session{}, domain.User{}, fmt.Errorf("unexpected session/user field count: %d", len(fields))
	}

	var session domain.Session
	var user domain.User
	var err error
	if session.ID, err = decodeBase64Field(fields[0]); err != nil {
		return domain.Session{}, domain.User{}, err
	}
	if session.UserID, err = decodeBase64Field(fields[1]); err != nil {
		return domain.Session{}, domain.User{}, err
	}
	if session.TokenHash, err = decodeBase64Field(fields[2]); err != nil {
		return domain.Session{}, domain.User{}, err
	}
	if session.CreatedAt, err = time.Parse(time.RFC3339Nano, fields[3]); err != nil {
		return domain.Session{}, domain.User{}, fmt.Errorf("parse session created_at: %w", err)
	}
	if session.ExpiresAt, err = time.Parse(time.RFC3339Nano, fields[4]); err != nil {
		return domain.Session{}, domain.User{}, fmt.Errorf("parse session expires_at: %w", err)
	}
	user, err = parseUserLine(strings.Join(fields[5:], "\t"))
	if err != nil {
		return domain.Session{}, domain.User{}, err
	}
	return session, user, nil
}

func decodeBase64Field(s string) (string, error) {
	if s == "" || s == "NULL" {
		return "", nil
	}
	b, err := base64.StdEncoding.DecodeString(s)
	if err != nil {
		return "", fmt.Errorf("decode base64 field: %w", err)
	}
	return string(b), nil
}

func parseIntField(s string) (int, error) {
	if s == "" || s == "NULL" {
		return 0, nil
	}
	var v int
	if _, err := fmt.Sscanf(s, "%d", &v); err != nil {
		return 0, fmt.Errorf("parse int field: %w", err)
	}
	return v, nil
}

func parseOptionalTimeField(s string) (*time.Time, error) {
	if s == "" || s == "NULL" {
		return nil, nil
	}
	t, err := time.Parse(time.RFC3339Nano, s)
	if err != nil {
		return nil, fmt.Errorf("parse optional time: %w", err)
	}
	return &t, nil
}

func quoteString(s string) string {
	replacer := strings.NewReplacer(
		`\`, `\\`,
		"\x00", `\0`,
		"\n", `\n`,
		"\r", `\r`,
		"\x1a", `\Z`,
		"'", `\'`,
		`"`, `\"`,
	)
	return "'" + replacer.Replace(s) + "'"
}

func quoteTime(t time.Time) string {
	return quoteString(t.UTC().Format(mysqlTimeLayout))
}

func boolLiteral(v bool) string {
	if v {
		return "TRUE"
	}
	return "FALSE"
}

func validateIdentifier(v string) error {
	if v == "" {
		return errors.New("empty identifier")
	}
	for _, r := range v {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' {
			continue
		}
		return fmt.Errorf("unsupported character %q", r)
	}
	return nil
}

func quoteIdentifier(v string) string {
	return "`" + strings.ReplaceAll(v, "`", "``") + "`"
}

var (
	_ storage.Store     = (*Store)(nil)
	_ storage.AuthStore = (*Store)(nil)
)
