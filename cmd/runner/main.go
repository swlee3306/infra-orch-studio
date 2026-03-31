package main

import (
	"log"
	"os"
	"time"
)

func main() {
	interval := envDuration("RUNNER_POLL_INTERVAL", 5*time.Second)
	log.Printf("runner starting (poll interval=%s)", interval)

	t := time.NewTicker(interval)
	defer t.Stop()

	for range t.C {
		// Phase 3: pick up jobs from storage and execute.
		log.Printf("runner tick")
	}
}

func envDuration(key string, def time.Duration) time.Duration {
	if v := os.Getenv(key); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			return d
		}
	}
	return def
}
