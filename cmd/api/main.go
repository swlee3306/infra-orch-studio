package main

import (
	"context"
	"log"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/api"
	"github.com/swlee3306/infra-orch-studio/internal/runtimecheck"
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

	templatesRoot := runtimecheck.ResolvePath(env("TEMPLATES_ROOT", "./templates/opentofu/environments"))
	modulesRoot := runtimecheck.ResolvePath(env("MODULES_ROOT", "./templates/opentofu/modules"))
	if err := runtimecheck.ValidateTemplateAssets(templatesRoot, modulesRoot); err != nil {
		log.Fatalf("validate template assets: %v", err)
	}

	srv := api.NewServer(api.Config{
		JobStore:              jobStore,
		AuthStore:             authStore,
		ProviderStore:         store,
		TemplatesRoot:         templatesRoot,
		ModulesRoot:           modulesRoot,
		AllowPublicSignup:     envBool("ALLOW_PUBLIC_SIGNUP", false),
		OpenStackConfigPath:   runtimecheck.ResolvePath(env("OPENSTACK_CONFIG_PATH", "/etc/openstack/clouds.yaml")),
		OpenStackDefaultCloud: env("OPENSTACK_CLOUD", ""),
	})
	log.Printf("template roots: environments=%s modules=%s", templatesRoot, modulesRoot)
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

func envBool(key string, def bool) bool {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		switch strings.ToLower(v) {
		case "1", "true", "yes", "on":
			return true
		case "0", "false", "no", "off":
			return false
		}
	}
	return def
}
