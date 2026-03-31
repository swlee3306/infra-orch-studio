package sqlite

import (
	"context"
	"database/sql"
	"encoding/json"
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
	error TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_jobs_created_at ON jobs(created_at);
`
	if _, err := s.db.ExecContext(ctx, ddl); err != nil {
		return fmt.Errorf("sqlite migrate: %w", err)
	}
	return nil
}

func (s *Store) CreateJob(ctx context.Context, j domain.Job) (domain.Job, error) {
	envJSON, err := json.Marshal(j.Environment)
	if err != nil {
		return domain.Job{}, fmt.Errorf("marshal environment: %w", err)
	}

	_, err = s.db.ExecContext(ctx,
		`INSERT INTO jobs (id, type, status, created_at, updated_at, environment_json, error)
		 VALUES (?, ?, ?, ?, ?, ?, ?)`,
		j.ID,
		string(j.Type),
		string(j.Status),
		j.CreatedAt.UTC().Format(time.RFC3339Nano),
		j.UpdatedAt.UTC().Format(time.RFC3339Nano),
		string(envJSON),
		j.Error,
	)
	if err != nil {
		return domain.Job{}, fmt.Errorf("insert job: %w", err)
	}
	return j, nil
}

func (s *Store) GetJob(ctx context.Context, id string) (domain.Job, error) {
	row := s.db.QueryRowContext(ctx,
		`SELECT id, type, status, created_at, updated_at, environment_json, error
		 FROM jobs WHERE id = ?`, id)

	var j domain.Job
	var jobType, status, createdAt, updatedAt, envJSON string
	if err := row.Scan(&j.ID, &jobType, &status, &createdAt, &updatedAt, &envJSON, &j.Error); err != nil {
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
		`SELECT id, type, status, created_at, updated_at, environment_json, error
		 FROM jobs ORDER BY created_at DESC LIMIT ?`, limit)
	if err != nil {
		return nil, fmt.Errorf("list jobs: %w", err)
	}
	defer rows.Close()

	out := make([]domain.Job, 0, limit)
	for rows.Next() {
		var j domain.Job
		var jobType, status, createdAt, updatedAt, envJSON string
		if err := rows.Scan(&j.ID, &jobType, &status, &createdAt, &updatedAt, &envJSON, &j.Error); err != nil {
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
		 SET type = ?, status = ?, updated_at = ?, environment_json = ?, error = ?
		 WHERE id = ?`,
		string(j.Type),
		string(j.Status),
		j.UpdatedAt.UTC().Format(time.RFC3339Nano),
		string(envJSON),
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
