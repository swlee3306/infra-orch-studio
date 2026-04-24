package mysql

import "testing"

func TestOutputLinesPreservesTrailingTabs(t *testing.T) {
	out := "a\tb\t\r\nc\td\t\t\n\n"
	got := outputLines(out)
	if len(got) != 2 {
		t.Fatalf("len(outputLines) = %d, want 2", len(got))
	}
	if got[0] != "a\tb\t" {
		t.Fatalf("first line = %q, want %q", got[0], "a\tb\t")
	}
	if got[1] != "c\td\t\t" {
		t.Fatalf("second line = %q, want %q", got[1], "c\td\t\t")
	}
}

func TestProviderPasswordEncryptionRoundTrip(t *testing.T) {
	store := &Store{cfg: Config{ProviderSecretKey: "test-secret-key"}}

	encoded, err := store.encodeProviderPassword("openstack-password")
	if err != nil {
		t.Fatalf("encode provider password: %v", err)
	}
	if encoded == "openstack-password" {
		t.Fatalf("encoded provider password was stored in plaintext")
	}
	if got, err := store.decodeProviderPassword(encoded); err != nil || got != "openstack-password" {
		t.Fatalf("decode provider password = %q, %v; want %q, nil", got, err, "openstack-password")
	}
}

func TestProviderPasswordPlaintextCompatibility(t *testing.T) {
	store := &Store{}

	encoded, err := store.encodeProviderPassword("legacy-password")
	if err != nil {
		t.Fatalf("encode provider password without key: %v", err)
	}
	if encoded != "legacy-password" {
		t.Fatalf("encoded provider password = %q, want plaintext compatibility", encoded)
	}
	if got, err := store.decodeProviderPassword(encoded); err != nil || got != "legacy-password" {
		t.Fatalf("decode plaintext provider password = %q, %v; want %q, nil", got, err, "legacy-password")
	}
}

func TestEncryptedProviderPasswordRequiresKey(t *testing.T) {
	withKey := &Store{cfg: Config{ProviderSecretKey: "test-secret-key"}}
	encoded, err := withKey.encodeProviderPassword("openstack-password")
	if err != nil {
		t.Fatalf("encode provider password: %v", err)
	}

	withoutKey := &Store{}
	if _, err := withoutKey.decodeProviderPassword(encoded); err == nil {
		t.Fatalf("decode encrypted provider password without key succeeded, want error")
	}
}
