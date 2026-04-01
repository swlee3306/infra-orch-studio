package main

import (
	"log"
	"os"
	"strconv"

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

	srv := api.NewServer(api.Config{
		JobStore:  jobStore,
		AuthStore: authStore,
	})
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
