package domain

import "time"

type AuditEvent struct {
	ID          string    `json:"id"`
	ResourceType string   `json:"resource_type"`
	ResourceID  string    `json:"resource_id"`
	Action      string    `json:"action"`
	ActorUserID string    `json:"actor_user_id,omitempty"`
	ActorEmail  string    `json:"actor_email,omitempty"`
	Message     string    `json:"message,omitempty"`
	MetadataJSON string   `json:"metadata_json,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}
