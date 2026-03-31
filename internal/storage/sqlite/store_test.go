package sqlite

import (
	"context"
	"testing"
	"time"

	"github.com/swlee3306/infra-orch-studio/internal/domain"
)

func TestStore_CRUD(t *testing.T) {
	s, err := Open(":memory:")
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer s.Close()

	j := domain.Job{
		ID:        "job-1",
		Type:      domain.JobTypeEnvironmentCreate,
		Status:    domain.JobStatusQueued,
		CreatedAt: time.Now().UTC().Truncate(time.Second),
		UpdatedAt: time.Now().UTC().Truncate(time.Second),
		Environment: domain.EnvironmentSpec{
			EnvironmentName: "dev",
			TenantName:      "t1",
			Network: domain.Network{
				Name: "net1",
				CIDR: "10.0.0.0/24",
			},
			Subnet: domain.Subnet{
				Name:       "sub1",
				CIDR:       "10.0.0.0/24",
				EnableDHCP: true,
			},
			Instances: []domain.Instance{{Name: "vm", Image: "img", Flavor: "small", Count: 1}},
		},
	}

	if _, err := s.CreateJob(context.Background(), j); err != nil {
		t.Fatalf("create: %v", err)
	}

	got, err := s.GetJob(context.Background(), "job-1")
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if got.ID != j.ID || got.Environment.EnvironmentName != "dev" {
		t.Fatalf("unexpected job: %#v", got)
	}

	got.Status = domain.JobStatusRunning
	got.UpdatedAt = time.Now().UTC().Truncate(time.Second)
	if _, err := s.UpdateJob(context.Background(), got); err != nil {
		t.Fatalf("update: %v", err)
	}

	list, err := s.ListJobs(context.Background(), 10)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("expected 1 job, got %d", len(list))
	}
	if list[0].Status != domain.JobStatusRunning {
		t.Fatalf("expected running, got %s", list[0].Status)
	}
}
