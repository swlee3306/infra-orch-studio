package handlers

import (
	"net/http"
	"strings"

	"github.com/swlee3306/infra-orch-studio/internal/storage"
)

// JobsRouter dispatches requests under /jobs/{id}.
//
// Routes:
// - GET  /jobs/{id}
// - POST /jobs/{id}/apply
func JobsRouter(store storage.Store) http.Handler {
	item := JobsItem(store)
	apply := JobsApply(store)

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		path := strings.TrimPrefix(r.URL.Path, "/jobs/")
		if strings.HasSuffix(path, "/apply") {
			apply.ServeHTTP(w, r)
			return
		}
		item.ServeHTTP(w, r)
	})
}
