package api

import "net/http"

func (s *Server) handlePublicConfig(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"allow_public_signup": s.allowPublicSignup,
	})
}
