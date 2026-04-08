package api

import (
	"context"
	"database/sql"
	"errors"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/security"
	"github.com/swlee3306/infra-orch-studio/internal/storage"
)

type fakeStore struct {
	mu sync.Mutex

	users        map[string]domain.User
	usersByMail  map[string]string
	sessions     map[string]domain.Session
	jobs         map[string]domain.Job
	environments map[string]domain.Environment
	audits       []domain.AuditEvent

	failAudit bool
}

func newFakeStore() *fakeStore {
	return &fakeStore{
		users:        map[string]domain.User{},
		usersByMail:  map[string]string{},
		sessions:     map[string]domain.Session{},
		jobs:         map[string]domain.Job{},
		environments: map[string]domain.Environment{},
		audits:       []domain.AuditEvent{},
	}
}

func newTestServer(store *fakeStore) *Server {
	return NewServer(Config{
		JobStore:          store,
		AuthStore:         store,
		CookieName:        "test_session",
		SessionTTL:        time.Hour,
		AllowedOrigins:    []string{"http://localhost:5173"},
		AllowPublicSignup: true,
	})
}

func (f *fakeStore) CreateJob(_ context.Context, j domain.Job) (domain.Job, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.jobs[j.ID] = j
	return j, nil
}

func (f *fakeStore) GetJob(_ context.Context, id string) (domain.Job, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	j, ok := f.jobs[id]
	if !ok {
		return domain.Job{}, sql.ErrNoRows
	}
	return j, nil
}

func (f *fakeStore) ListJobs(_ context.Context, limit int) ([]domain.Job, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if limit <= 0 {
		limit = 50
	}
	out := make([]domain.Job, 0, len(f.jobs))
	for _, j := range f.jobs {
		out = append(out, j)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].ID < out[j].ID
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (f *fakeStore) UpdateJob(_ context.Context, j domain.Job) (domain.Job, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.jobs[j.ID]; !ok {
		return domain.Job{}, sql.ErrNoRows
	}
	f.jobs[j.ID] = j
	return j, nil
}

func (f *fakeStore) ClaimNextQueuedJob(_ context.Context) (domain.Job, bool, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	var chosen *domain.Job
	for _, j := range f.jobs {
		if j.Status != domain.JobStatusQueued {
			continue
		}
		j := j
		if chosen == nil || j.CreatedAt.Before(chosen.CreatedAt) {
			chosen = &j
		}
	}
	if chosen == nil {
		return domain.Job{}, false, nil
	}
	job := *chosen
	job.Status = domain.JobStatusRunning
	job.UpdatedAt = time.Now().UTC()
	f.jobs[job.ID] = job
	return job, true, nil
}

func (f *fakeStore) CreateEnvironment(_ context.Context, env domain.Environment) (domain.Environment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.environments[env.ID] = env
	return env, nil
}

func (f *fakeStore) GetEnvironment(_ context.Context, id string) (domain.Environment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	env, ok := f.environments[id]
	if !ok {
		return domain.Environment{}, sql.ErrNoRows
	}
	return env, nil
}

func (f *fakeStore) ListEnvironments(_ context.Context, limit int) ([]domain.Environment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if limit <= 0 {
		limit = 50
	}
	out := make([]domain.Environment, 0, len(f.environments))
	for _, env := range f.environments {
		out = append(out, env)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].ID < out[j].ID
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (f *fakeStore) UpdateEnvironment(_ context.Context, env domain.Environment) (domain.Environment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if _, ok := f.environments[env.ID]; !ok {
		return domain.Environment{}, sql.ErrNoRows
	}
	f.environments[env.ID] = env
	return env, nil
}

func (f *fakeStore) CreateAuditEvent(_ context.Context, event domain.AuditEvent) (domain.AuditEvent, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failAudit {
		return domain.AuditEvent{}, errors.New("audit write failed")
	}
	f.audits = append(f.audits, event)
	return event, nil
}

func (f *fakeStore) CreateEnvironmentWithJobAndAudit(_ context.Context, env domain.Environment, job domain.Job, audit domain.AuditEvent) (domain.Environment, domain.Job, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failAudit {
		return domain.Environment{}, domain.Job{}, errors.New("audit write failed")
	}
	f.environments[env.ID] = env
	f.jobs[job.ID] = job
	f.audits = append(f.audits, audit)
	return env, job, nil
}

func (f *fakeStore) UpdateEnvironmentWithJobAndAudit(_ context.Context, env domain.Environment, job domain.Job, audit domain.AuditEvent) (domain.Environment, domain.Job, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failAudit {
		return domain.Environment{}, domain.Job{}, errors.New("audit write failed")
	}
	if _, ok := f.environments[env.ID]; !ok {
		return domain.Environment{}, domain.Job{}, sql.ErrNoRows
	}
	f.environments[env.ID] = env
	f.jobs[job.ID] = job
	f.audits = append(f.audits, audit)
	return env, job, nil
}

func (f *fakeStore) UpdateEnvironmentWithAudit(_ context.Context, env domain.Environment, audit domain.AuditEvent) (domain.Environment, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if f.failAudit {
		return domain.Environment{}, errors.New("audit write failed")
	}
	if _, ok := f.environments[env.ID]; !ok {
		return domain.Environment{}, sql.ErrNoRows
	}
	f.environments[env.ID] = env
	f.audits = append(f.audits, audit)
	return env, nil
}

func (f *fakeStore) ListAuditEvents(_ context.Context, resourceType, resourceID string, limit int) ([]domain.AuditEvent, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if limit <= 0 {
		limit = 50
	}
	out := make([]domain.AuditEvent, 0, len(f.audits))
	for _, event := range f.audits {
		if resourceType != "" && event.ResourceType != resourceType {
			continue
		}
		if resourceID != "" && event.ResourceID != resourceID {
			continue
		}
		out = append(out, event)
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (f *fakeStore) CreateUser(_ context.Context, user domain.User) (domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	email := strings.ToLower(user.Email)
	if _, ok := f.usersByMail[email]; ok {
		return domain.User{}, storage.ErrConflict
	}
	user.Email = email
	f.users[user.ID] = user
	f.usersByMail[email] = user.ID
	return user, nil
}

func (f *fakeStore) GetUserByEmail(_ context.Context, email string) (domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	id, ok := f.usersByMail[strings.ToLower(email)]
	if !ok {
		return domain.User{}, sql.ErrNoRows
	}
	user, ok := f.users[id]
	if !ok {
		return domain.User{}, sql.ErrNoRows
	}
	return user, nil
}

func (f *fakeStore) GetUserByID(_ context.Context, id string) (domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	user, ok := f.users[id]
	if !ok {
		return domain.User{}, sql.ErrNoRows
	}
	return user, nil
}

func (f *fakeStore) ListUsers(_ context.Context, limit int) ([]domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	if limit <= 0 {
		limit = 50
	}
	out := make([]domain.User, 0, len(f.users))
	for _, user := range f.users {
		out = append(out, user)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].CreatedAt.Equal(out[j].CreatedAt) {
			return out[i].Email < out[j].Email
		}
		return out[i].CreatedAt.After(out[j].CreatedAt)
	})
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

func (f *fakeStore) SetUserDisabled(_ context.Context, id string, disabled bool) (domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	user, ok := f.users[id]
	if !ok {
		return domain.User{}, sql.ErrNoRows
	}
	user.Disabled = disabled
	user.UpdatedAt = time.Now().UTC()
	f.users[id] = user
	return user, nil
}

func (f *fakeStore) SetUserPassword(_ context.Context, id string, passwordHash string) (domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	user, ok := f.users[id]
	if !ok {
		return domain.User{}, sql.ErrNoRows
	}
	user.PasswordHash = passwordHash
	user.UpdatedAt = time.Now().UTC()
	f.users[id] = user
	return user, nil
}

func (f *fakeStore) UpsertAdminUser(_ context.Context, user domain.User) (domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	user.Email = strings.ToLower(user.Email)
	user.IsAdmin = true
	if existingID, ok := f.usersByMail[user.Email]; ok {
		user.ID = existingID
	}
	if user.ID == "" {
		user.ID = uuid.NewString()
	}
	f.users[user.ID] = user
	f.usersByMail[user.Email] = user.ID
	return user, nil
}

func (f *fakeStore) CreateSession(_ context.Context, session domain.Session) (domain.Session, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.sessions[session.TokenHash] = session
	return session, nil
}

func (f *fakeStore) GetSessionWithUser(_ context.Context, tokenHash string) (domain.Session, domain.User, error) {
	f.mu.Lock()
	defer f.mu.Unlock()
	session, ok := f.sessions[tokenHash]
	if !ok {
		return domain.Session{}, domain.User{}, sql.ErrNoRows
	}
	user, ok := f.users[session.UserID]
	if !ok {
		return domain.Session{}, domain.User{}, sql.ErrNoRows
	}
	return session, user, nil
}

func (f *fakeStore) DeleteSessionByTokenHash(_ context.Context, tokenHash string) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	delete(f.sessions, tokenHash)
	return nil
}

func mustHashPassword(t interface{ Fatalf(string, ...any) }, password string) string {
	hash, err := security.HashPassword(password)
	if err != nil {
		t.Fatalf("hash password: %v", err)
	}
	return hash
}

func mustUser(t interface{ Fatalf(string, ...any) }, email string, admin bool, password string) domain.User {
	now := time.Now().UTC()
	return domain.User{
		ID:           uuid.NewString(),
		Email:        email,
		IsAdmin:      admin,
		PasswordHash: mustHashPassword(t, password),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
}

func seedSession(store *fakeStore, user domain.User, rawToken string) {
	store.mu.Lock()
	defer store.mu.Unlock()
	tokenHash := security.HashToken(rawToken)
	store.users[user.ID] = user
	store.usersByMail[strings.ToLower(user.Email)] = user.ID
	store.sessions[tokenHash] = domain.Session{
		ID:        uuid.NewString(),
		UserID:    user.ID,
		TokenHash: tokenHash,
		CreatedAt: time.Now().UTC(),
		ExpiresAt: time.Now().UTC().Add(time.Hour),
	}
}
