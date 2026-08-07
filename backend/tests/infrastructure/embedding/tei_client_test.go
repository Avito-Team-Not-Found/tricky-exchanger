package embedding_test

import (
	"context"
	"encoding/json"
	"math"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/internal/infrastructure/embedding"
)

func TestTEIClient_Embed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/embed" {
			t.Errorf("path = %s, want /embed", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("method = %s, want POST", r.Method)
		}
		if ct := r.Header.Get("Content-Type"); ct != "application/json" {
			t.Errorf("content-type = %s, want application/json", ct)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[[0.1, 0.2, 0.3]]`))
	}))
	defer srv.Close()

	c := embedding.NewTEIClient(srv.URL, 2*time.Second, 1500)
	vec, err := c.Embed(context.Background(), "хочу кофемашину")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(vec) != 3 {
		t.Fatalf("len = %d, want 3", len(vec))
	}
	want := []float32{0.1, 0.2, 0.3}
	for i, wv := range want {
		if math.Abs(float64(vec[i])-float64(wv)) > 1e-6 {
			t.Fatalf("vec[%d] = %v, want ~%v", i, vec[i], wv)
		}
	}
}

func TestTEIClient_TruncatesInput(t *testing.T) {
	var gotInput string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotInput = body["inputs"]
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[[0.1, 0.2]]`))
	}))
	defer srv.Close()

	long := strings.Repeat("а", 5000)
	c := embedding.NewTEIClient(srv.URL, time.Second, 3) // maxChars = 3
	if _, err := c.Embed(context.Background(), long); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotInput != "ааа" {
		t.Fatalf("got input = %q, want %q", gotInput, "ааа")
	}
}

func TestTEIClient_NoTruncateWhenShort(t *testing.T) {
	var gotInput string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]string
		_ = json.NewDecoder(r.Body).Decode(&body)
		gotInput = body["inputs"]
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[[0.1, 0.2]]`))
	}))
	defer srv.Close()

	c := embedding.NewTEIClient(srv.URL, time.Second, 1500)
	if _, err := c.Embed(context.Background(), "короткий текст"); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if gotInput != "короткий текст" {
		t.Fatalf("got input = %q, want unchanged", gotInput)
	}
}

func TestTEIClient_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Error(w, "overloaded", http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := embedding.NewTEIClient(srv.URL, time.Second, 1500)
	if _, err := c.Embed(context.Background(), "тест"); err == nil {
		t.Fatal("expected error on 429, got nil")
	}
}

func TestTEIClient_EmptyResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer srv.Close()

	c := embedding.NewTEIClient(srv.URL, time.Second, 1500)
	if _, err := c.Embed(context.Background(), "тест"); err == nil {
		t.Fatal("expected error on empty embeddings, got nil")
	}
}