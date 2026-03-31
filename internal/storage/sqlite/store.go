package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	_ "modernc.org/sqlite"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

// Store implements storage.Store using a local sqlite database.
//
// Rationale (MVP): keeps API/runner split feasible without introducing a full DB service.
// We use modernc.org/sqlite (pure Go) to avoid CGO requirements in containers.
type Store struct {
	db *sql.DB
}

func Open(path string) (*Store, error) {
	// modernc sqlite accepts file path DSN.
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, fmt.Errorf("sqlite open: %w", err)
	}
	// SQLite is file-based; a single connection is fine for MVP.
	db.SetMaxOpenConns(1)
	db.SetMaxIdleConns(1)

	s := &Store{db: db}
	if err := s.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) Close() error { return s.db.Close() }

func (s *Store) migrate(ctx context.Context) error {
	const ddl = `
CREATE TABLE IF NOT EXISTS jobs (
	id TEXT PRIMARY KEY,
	type TEXT NOT NULL,
	status TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	environment_json TEXT NOT NULL,
	template_name TEXT NOT NULL DEFAULT '',
	workdir TEXT NOT NULL DEFAULT '',
	error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
`
	if _, err := s.db.ExecContext(ctx, ddl); err != nil {
		return fmt.Errorf("sqlite migrate: %w", err)
	}

	// Backward-compatible migrations for existing DBs.
	// SQLite supports ADD COLUMN; we use DEFAULT '' to keep scans simple.
	_ = s.addColumnIfMissing(ctx, "jobs", "template_name", "TEXT NOT NULL DEFAULT ''")
	_ = s.addColumnIfMissing(ctx, "jobs", "workdir", "TEXT NOT NULL DEFAULT ''")

	return nil
}

func (s *Store) addColumnIfMissing(ctx context.Context, table, col, ddl string) error {
	rows, err := s.db.QueryContext(ctx, fmt.Sprintf("PRAGMA table_info(%s)", table))
	if err != nil {
		return err
	}
	defer rows.Close()

	for rows.Next() {
		var cid int
		var name, ctype string
		var notnull int
		var dflt sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &ctype, &notnull, &dflt, &pk); err != nil {
			return err
		}
		if name == col {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, fmt.Sprintf("ALTER TABLE %s ADD COLUMN %s %s", table, col, ddl))
	return err
}

func (s *Store) CreateJob(ctx context.Context, j domain.Job) (domain.Job, error) {
	envJSON, err := json.Marshal(j.Environment)
	if err != nil {
		return domain.Job{}, fmt.Errorf("marshal environment: %w", err)
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO jobs (id, type, status, created_at, updated_at, environment_json, template_name, workdir, error)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		j.ID,
		string(j.Type),
		string(j.Status),
		j.CreatedAt.UTC().Format(time.RFC3339Nano),
		j.UpdatedAt.UTC().Format(time.RFC3339Nano),
		string(envJSON),
		j.TemplateName,
		j.Workdir,
		j.Error,
	)
	if err != nil {
		return domain.Job{}, fmt.Errorf("insert job: %w", err)
	}
	return j, nil
}

func (s *Store) GetJob(ctx context.Context, id string) (domain.Job, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, type, status, created_at, updated_at, environment_json, template_name, workdir, error
		 FROM jobs WHERE id = ?`, id)

	var j domain.Job
	var jobType, status, createdAt, updatedAt, envJSON string
	if err := row.Scan(&j.ID, &jobType, &status, &createdAt, &updatedAt, &envJSON, &j.TemplateName, &j.Workdir, &j.Error); err != nil {
		return domain.Job{}, err
	}
	j.Type = domain.JobType(jobType)
	j.Status = domain.JobStatus(status)
	if t, err := time.Parse(time.RFC3339Nano, createdAt); err == nil {
		j.CreatedAt = t
	}
	if t, err := time.Parse(time.RFC3339Nano, updatedAt); err == nil {
		j.UpdatedAt = t
	}
	if err := json.Unmarshal([]byte(envJSON), &j.Environment); err != nil {
		return domain.Job{}, fmt.Errorf("unmarshal environment: %w", err)
	}
	return j, nil
}

func (s *Store) ListJobs(ctx context.Context, limit int) ([]domain.Job, error) {
	if limit <= 0 {
		limit = 50
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT id, type, status, created_at, updated_at, environment_json, template_name, workdir, error
		 FROM jobs ORDER BY created_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("list jobs: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Job, 0, limit)
	for rows.Next() {
		var j domain.Job
		var jobType, status, createdAt, updatedAt, envJSON string
		if err := rows.Scan(&j.ID, &jobType, &status, &createdAt, &updatedAt, &envJSON, &j.TemplateName, &j.Workdir, &j.Error); err != nil {
			return nil, err
		}
		j.Type = domain.JobType(jobType)
		j.Status = domain.JobStatus(status)
		if t, err := time.Parse(time.RFC3339Nano, createdAt); err == nil {
			j.CreatedAt = t
		}
		if t, err := time.Parse(time.RFC3339Nano, updatedAt); err == nil {
			j.UpdatedAt = t
		}
		if err := json.Unmarshal([]byte(envJSON), &j.Environment); err != nil {
			return nil, fmt.Errorf("unmarshal environment: %w", err)
		}
		out = append(out, j)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return out, nil
}

func (s *Store) UpdateJob(ctx context.Context, j domain.Job) (domain.Job, error) {
	envJSON, err := json.Marshal(j.Environment)
	if err != nil {
		return domain.Job{}, fmt.Errorf("marshal environment: %w", err)
	}

	res, err := s.db.ExecContext(ctx,
		`UPDATE jobs
		 SET type = ?, status = ?, updated_at = ?, environment_json = ?, template_name = ?, workdir = ?, error = ?
		 WHERE id = ?`,
		string(j.Type),
		string(j.Status),
		j.UpdatedAt.UTC().Format(time.RFC3339Nano),
		string(envJSON),
		j.TemplateName,
		j.Workdir,
		j.Error,
		j.ID,
	)
	if err != nil {
		return domain.Job{}, fmt.Errorf("update job: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return domain.Job{}, sql.ErrNoRows
	}
	return j, nil
}

func (s *Store) ClaimNextQueuedJob(ctx context.Context) (domain.Job, bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return domain.Job{}, false, fmt.Errorf("begin tx: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	row := tx.QueryRowContext(ctx,
		`SELECT id, type, status, created_at, updated_at, environment_json, template_name, workdir, error
		 FROM jobs WHERE status = ? ORDER BY created_at ASC LIMIT 1`,
		string(domain.JobStatusQueued),
	)

	var j domain.Job
	var jobType, status, createdAt, updatedAt, envJSON string
	if err := row.Scan(&j.ID, &jobType, &status, &createdAt, &updatedAt, &envJSON, &j.TemplateName, &j.Workdir, &j.Error); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			if err := tx.Commit(); err != nil {
				return domain.Job{}, false, fmt.Errorf("commit empty tx: %w", err)
			}
			return domain.Job{}, false, nil
		}
		return domain.Job{}, false, err
	}

	j.Type = domain.JobType(jobType)
	j.Status = domain.JobStatus(status)
	if t, err := time.Parse(time.RFC3339Nano, createdAt); err == nil {
		j.CreatedAt = t
	}
	if t, err := time.Parse(time.RFC3339Nano, updatedAt); err == nil {
		j.UpdatedAt = t
	}
	if err := json.Unmarshal([]byte(envJSON), &j.Environment); err != nil {
		return domain.Job{}, false, fmt.Errorf("unmarshal environment: %w", err)
	}

	now := time.Now().UTC()
	res, err := tx.ExecContext(ctx,
		`UPDATE jobs SET status = ?, updated_at = ? WHERE id = ? AND status = ?`,
		string(domain.JobStatusRunning),
		now.Format(time.RFC3339Nano),
		j.ID,
		string(domain.JobStatusQueued),
	)
	if err != nil {
		return domain.Job{}, false, fmt.Errorf("claim job: %w", err)
	}
	if n, _ := res.RowsAffected(); n == 0 {
		// Lost the race to another runner.
		if err := tx.Commit(); err != nil {
			return domain.Job{}, false, fmt.Errorf("commit lost-race tx: %w", err)
		}
		return domain.Job{}, false, nil
	}

	j.Status = domain.JobStatusRunning
	j.UpdatedAt = now
	if err := tx.Commit(); err != nil {
		return domain.Job{}, false, fmt.Errorf("commit claim tx: %w", err)
	}
	return j, true, nil
}
