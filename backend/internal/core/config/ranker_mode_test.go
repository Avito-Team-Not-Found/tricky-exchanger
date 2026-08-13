package config

import "testing"

func TestParseRankerMode(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{in: "", want: RankerModeML},
		{in: "ml", want: RankerModeML},
		{in: "formula", want: RankerModeFormula},
		{in: "onnx", wantErr: true},
		{in: "ML", wantErr: true},
	}
	for _, tt := range tests {
		got, err := ParseRankerMode(tt.in)
		if tt.wantErr {
			if err == nil {
				t.Fatalf("ParseRankerMode(%q) error = nil", tt.in)
			}
			continue
		}
		if err != nil {
			t.Fatalf("ParseRankerMode(%q) error = %v", tt.in, err)
		}
		if got != tt.want {
			t.Fatalf("ParseRankerMode(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

func TestLoadRejectsUnknownRankerMode(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("JWT_SECRET", "secret")
	t.Setenv("RANKER_MODE", "onnx")
	if _, err := Load(); err == nil {
		t.Fatal("Load() expected error for unknown RANKER_MODE")
	}
}

func TestLoadDefaultRankerModeML(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("JWT_SECRET", "secret")
	t.Setenv("RANKER_MODE", "")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.RankerMode != RankerModeML {
		t.Fatalf("RankerMode = %q, want ml", cfg.RankerMode)
	}
}
