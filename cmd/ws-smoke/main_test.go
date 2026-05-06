package main

import "testing"

func TestNormalizeAPIBase(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{name: "plain api", in: "http://localhost:8080/api", want: "http://localhost:8080/api"},
		{name: "trailing slash", in: "https://example.com/api/", want: "https://example.com/api"},
		{name: "query stripped", in: "http://localhost:8080/api?x=1", want: "http://localhost:8080/api"},
		{name: "bad scheme", in: "ws://localhost:8080/api", wantErr: true},
		{name: "missing api suffix", in: "http://localhost:8080", wantErr: true},
		{name: "missing host", in: "http:///api", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeAPIBase(tt.in)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("normalizeAPIBase(%q) error = nil, want error", tt.in)
				}
				return
			}
			if err != nil {
				t.Fatalf("normalizeAPIBase(%q) error = %v", tt.in, err)
			}
			if got != tt.want {
				t.Fatalf("normalizeAPIBase(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestNormalizeRequiredEvent(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{name: "default empty", in: "", want: "any"},
		{name: "trimmed log", in: " log ", want: "log"},
		{name: "status", in: "status", want: "status"},
		{name: "invalid", in: "logs", wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeRequiredEvent(tt.in)
			if tt.wantErr {
				if err == nil {
					t.Fatalf("normalizeRequiredEvent(%q) error = nil, want error", tt.in)
				}
				return
			}
			if err != nil {
				t.Fatalf("normalizeRequiredEvent(%q) error = %v", tt.in, err)
			}
			if got != tt.want {
				t.Fatalf("normalizeRequiredEvent(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestFirstSessionCookieHeader(t *testing.T) {
	got := firstSessionCookieHeader([]string{
		"infra_orch_session=abc123; Path=/; HttpOnly; Secure; SameSite=Lax",
	})
	if got != "infra_orch_session=abc123" {
		t.Fatalf("firstSessionCookieHeader() = %q", got)
	}
}
