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
