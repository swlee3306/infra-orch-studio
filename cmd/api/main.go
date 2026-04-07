package main

import (
	"context"
	"log"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/api"
	"github.com/swlee3306/infra-orch-studio/internal/storage"
	storemysql "github.com/swlee3306/infra-orch-studio/internal/storage/mysql"
)

func main() {
	addr := env("API_ADDR", ":8080")

	var (
		jobStore  storage.Store
		authStore storage.AuthStore
		closer    func() error
	)

	host := os.Getenv("MYSQL_HOST")
	if host == "" {
		log.Fatalf("MYSQL_HOST is required")
	}
	port := env("MYSQL_PORT", "3306")
	if _, err := strconv.Atoi(port); err != nil {
		log.Fatalf("invalid MYSQL_PORT: %v", err)
	}
	store, err := storemysql.Open(storemysql.Config{
		Host:     host,
		Port:     port,
		Database: env("MYSQL_DB", "infra_orch"),
		User:     env("MYSQL_USER", "infra_orch"),
		Password: os.Getenv("MYSQL_PASSWORD"),
		MySQLBin: env("MYSQL_BIN", "mysql"),
	})
	if err != nil {
		log.Fatalf("open mysql store: %v", err)
	}
	jobStore = store
	authStore = store
	closer = store.Close
	log.Printf("using mysql store: %s:%s/%s", host, port, env("MYSQL_DB", "infra_orch"))
	defer func() {
		if closer != nil {
			_ = closer()
		}
	}()

	seededAdmin, seeded, err := ensureAdminSeed(context.Background(), authStore, os.Getenv("ADMIN_EMAIL"), os.Getenv("ADMIN_PASSWORD"), time.Now().UTC())
	if err != nil {
		log.Fatalf("ensure admin seed: %v", err)
	}
	if seeded {
		log.Printf("admin seed ensured for %s", seededAdmin.Email)
	}

	srv := api.NewServer(api.Config{
		JobStore:      jobStore,
		AuthStore:     authStore,
		TemplatesRoot: resolvePath(env("TEMPLATES_ROOT", "./templates/opentofu/environments")),
		ModulesRoot:   resolvePath(env("MODULES_ROOT", "./templates/opentofu/modules")),
	})
	log.Printf("template roots: environments=%s modules=%s", resolvePath(env("TEMPLATES_ROOT", "./templates/opentofu/environments")), resolvePath(env("MODULES_ROOT", "./templates/opentofu/modules")))
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

func resolvePath(path string) string {
	if path == "" {
		return ""
	}
	if filepath.IsAbs(path) {
		return path
	}

	candidates := make([]string, 0, 3)
	if wd, err := os.Getwd(); err == nil {
		candidates = append(candidates, filepath.Join(wd, path))
	}
	if exe, err := os.Executable(); err == nil {
		exeDir := filepath.Dir(exe)
		candidates = append(candidates,
			filepath.Join(exeDir, path),
			filepath.Join(exeDir, "..", path),
		)
	}
	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			abs, absErr := filepath.Abs(candidate)
			if absErr == nil {
				return abs
			}
			return candidate
		}
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return path
	}
	return abs
}
