package handlers

import (
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
	"github.com/swlee3306/infra-orch-studio/internal/storage"
)

// JobsApply handles POST /jobs/{id}/apply.
// It creates a new tofu.apply job that references the source plan job.
func JobsApply(store storage.Store) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}

		// path: /jobs/{id}/apply
		p := strings.TrimPrefix(r.URL.Path, "/jobs/")
		p = strings.TrimSuffix(p, "/apply")
		id := strings.TrimSuffix(p, "/")
		if id == "" || strings.Contains(id, "/") {
			writeError(w, http.StatusBadRequest, "invalid job id")
			return
		}

		src, err := store.GetJob(r.Context(), id)
		if err != nil {
			writeError(w, http.StatusNotFound, "source job not found")
			return
		}
		if src.PlanPath == "" || src.Workdir == "" {
			writeError(w, http.StatusBadRequest, "source job has no plan artifact")
			return
		}

		now := time.Now().UTC()
		j := domain.Job{
			ID:          uuid.NewString(),
			Type:        domain.JobTypeApply,
			Status:      domain.JobStatusQueued,
			CreatedAt:   now,
			UpdatedAt:   now,
			Environment: src.Environment,

			TemplateName: src.TemplateName,
			Workdir:      src.Workdir,
			PlanPath:     src.PlanPath,
			SourceJobID:  src.ID,
		}

		created, err := store.CreateJob(r.Context(), j)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "create apply job failed")
			return
		}
		writeJSON(w, http.StatusCreated, created)
	})
}
