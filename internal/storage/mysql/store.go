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
	environment_json LONGTEXT NOT NULL,
	template_name TEXT NOT NULL,
	workdir TEXT NOT NULL,
	plan_path TEXT NOT NULL,
	source_job_id VARCHAR(64) NOT NULL,
	claim_token VARCHAR(128) NOT NULL DEFAULT '',
	error TEXT NOT NULL,
	INDEX idx_jobs_created_at (created_at),
	INDEX idx_jobs_status_created_at (status, created_at),
	INDEX idx_jobs_claim_token (claim_token)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

DELETE FROM sessions WHERE expires_at <= UTC_TIMESTAMP(6);
`
	if _, err := s.exec(ctx, true, ddl); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	return nil
}

func (s *Store) CreateJob(ctx context.Context, j domain.Job) (domain.Job, error) {
	envJSON, err := json.Marshal(j.Environment)
	if err != nil {
		return domain.Job{}, fmt.Errorf("marshal environment: %w", err)
	}

	query := fmt.Sprintf(
		`INSERT INTO jobs (
			id, type, status, created_at, updated_at, environment_json, template_name, workdir, plan_path, source_job_id, claim_token, error
		) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, '', %s);`,
		quoteString(j.ID),
		quoteString(string(j.Type)),
		quoteString(string(j.Status)),
		quoteTime(j.CreatedAt),
		quoteTime(j.UpdatedAt),
		quoteString(string(envJSON)),
		quoteString(j.TemplateName),
		quoteString(j.Workdir),
		quoteString(j.PlanPath),
		quoteString(j.SourceJobID),
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
		     environment_json = %s,
		     template_name = %s,
		     workdir = %s,
		     plan_path = %s,
		     source_job_id = %s,
		     claim_token = '',
		     error = %s
		 WHERE id = %s;
		 SELECT ROW_COUNT();`,
		quoteString(string(j.Type)),
		quoteString(string(j.Status)),
		quoteTime(j.UpdatedAt),
		quoteString(string(envJSON)),
		quoteString(j.TemplateName),
		quoteString(j.Workdir),
		quoteString(j.PlanPath),
		quoteString(j.SourceJobID),
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
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		lines = append(lines, line)
	}
	return lines
}

func jobSelectColumns() string {
	return strings.Join([]string{
		"TO_BASE64(id)",
		"TO_BASE64(type)",
		"TO_BASE64(status)",
		fmt.Sprintf("DATE_FORMAT(created_at, '%s')", sqlTimeFormat),
		fmt.Sprintf("DATE_FORMAT(updated_at, '%s')", sqlTimeFormat),
		"TO_BASE64(environment_json)",
		"TO_BASE64(template_name)",
		"TO_BASE64(workdir)",
		"TO_BASE64(plan_path)",
		"TO_BASE64(source_job_id)",
		"TO_BASE64(error)",
	}, ", ")
}

func userSelectColumns() string {
	return userSelectColumnsWithAlias("users")
}

func userSelectColumnsWithAlias(alias string) string {
	return strings.Join([]string{
		// MySQL TO_BASE64() inserts line breaks every 76 chars; strip them to keep
		// results parseable as single-row, tab-delimited output.
		fmt.Sprintf("REPLACE(REPLACE(TO_BASE64(%s.id), '\\n', ''), '\\r', '')", alias),
		fmt.Sprintf("REPLACE(REPLACE(TO_BASE64(%s.email), '\\n', ''), '\\r', '')", alias),
		fmt.Sprintf("REPLACE(REPLACE(TO_BASE64(%s.password_hash), '\\n', ''), '\\r', '')", alias),
		fmt.Sprintf("%s.is_admin", alias),
		fmt.Sprintf("DATE_FORMAT(%s.created_at, '%s')", alias, sqlTimeFormat),
		fmt.Sprintf("DATE_FORMAT(%s.updated_at, '%s')", alias, sqlTimeFormat),
	}, ", ")
}

func sessionSelectColumns(alias string) string {
	return strings.Join([]string{
		fmt.Sprintf("REPLACE(REPLACE(TO_BASE64(%s.id), '\\n', ''), '\\r', '')", alias),
		fmt.Sprintf("REPLACE(REPLACE(TO_BASE64(%s.user_id), '\\n', ''), '\\r', '')", alias),
		fmt.Sprintf("REPLACE(REPLACE(TO_BASE64(%s.token_hash), '\\n', ''), '\\r', '')", alias),
		fmt.Sprintf("DATE_FORMAT(%s.created_at, '%s')", alias, sqlTimeFormat),
		fmt.Sprintf("DATE_FORMAT(%s.expires_at, '%s')", alias, sqlTimeFormat),
	}, ", ")
}

func parseJobLine(line string) (domain.Job, error) {
	fields := strings.Split(line, "\t")
	if len(fields) != 11 {
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
	envJSON, err := decodeBase64Field(fields[5])
	if err != nil {
		return domain.Job{}, err
	}
	if err := json.Unmarshal([]byte(envJSON), &job.Environment); err != nil {
		return domain.Job{}, fmt.Errorf("unmarshal environment: %w", err)
	}
	if job.TemplateName, err = decodeBase64Field(fields[6]); err != nil {
		return domain.Job{}, err
	}
	if job.Workdir, err = decodeBase64Field(fields[7]); err != nil {
		return domain.Job{}, err
	}
	if job.PlanPath, err = decodeBase64Field(fields[8]); err != nil {
		return domain.Job{}, err
	}
	if job.SourceJobID, err = decodeBase64Field(fields[9]); err != nil {
		return domain.Job{}, err
	}
	if job.Error, err = decodeBase64Field(fields[10]); err != nil {
		return domain.Job{}, err
	}
	return job, nil
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
