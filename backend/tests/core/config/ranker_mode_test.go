package config_test

import (
	"testing"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/core/config"
)

func TestParseRankerMode(t *testing.T) {
	tests := []struct {
		in      string
		want    string
		wantErr bool
	}{
		{in: "", want: config.RankerModeML},
		{in: "ml", want: config.RankerModeML},
		{in: "formula", want: config.RankerModeFormula},
		{in: "onnx", wantErr: true},
		{in: "ML", wantErr: true},
	}
	for _, tt := range tests {
		got, err := config.ParseRankerMode(tt.in)
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
	if _, err := config.Load(); err == nil {
		t.Fatal("Load() expected error for unknown RANKER_MODE")
	}
}

func TestLoadDefaultRankerModeML(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("JWT_SECRET", "secret")
	t.Setenv("RANKER_MODE", "")
	cfg, err := config.Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.RankerMode != config.RankerModeML {
		t.Fatalf("RankerMode = %q, want ml", cfg.RankerMode)
	}
}

func TestLoadRejectsInvalidNumericEnv(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("JWT_SECRET", "secret")
	t.Setenv("RANKER_MODE", "")
	t.Setenv("MATCHING_TOPK", "not-a-number")
	if _, err := config.Load(); err == nil {
		t.Fatal("Load() expected error for invalid MATCHING_TOPK")
	}
}

func TestLoadRejectsInvalidDurationEnv(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://x")
	t.Setenv("JWT_SECRET", "secret")
	t.Setenv("RANKER_MODE", "")
	t.Setenv("MATCHING_TOPK", "")
	t.Setenv("EMBEDDING_TIMEOUT", "fast")
	if _, err := config.Load(); err == nil {
		t.Fatal("Load() expected error for invalid EMBEDDING_TIMEOUT")
	}
}
