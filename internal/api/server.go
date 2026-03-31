package api

import (
	"log"
	"net/http"

	"github.com/swlee3306/infra-orch-studio/internal/api/handlers"
	"github.com/swlee3306/infra-orch-studio/internal/storage"
)

type Server struct {
	mux *http.ServeMux
}

func NewServer(store storage.Store) *Server {
	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", handlers.Healthz)
	mux.Handle("/jobs", handlers.JobsCollection(store))
	mux.Handle("/jobs/", handlers.JobsItem(store))

	return &Server{mux: mux}
}

func (s *Server) ListenAndServe(addr string) error {
	log.Printf("api listening on %s", addr)
	return http.ListenAndServe(addr, s.mux)
}
