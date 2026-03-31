package main

import (
	"log"
	"os"
	"path/filepath"

	"github.com/swlee3306/infra-orch-studio/internal/api"
	storesqlite "github.com/swlee3306/infra-orch-studio/internal/storage/sqlite"
)

func main() {
	addr := env("API_ADDR", ":8080")
	dbPath := env("STORE_SQLITE_PATH", "./var/infra-orch.db")

	if err := os.MkdirAll(filepath.Dir(dbPath), 0o755); err != nil {
		log.Fatalf("mkdir: %v", err)
	}

	store, err := storesqlite.Open(dbPath)
	if err != nil {
		log.Fatalf("open store: %v", err)
	}
	defer store.Close()

	srv := api.NewServer(store)
	if err := srv.ListenAndServe(addr); err != nil {
		log.Fatalf("listen: %v", err)
	}
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}
