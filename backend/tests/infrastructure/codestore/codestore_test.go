package codestore_test

import (
	"testing"
	"time"

	"github.com/Avito-Team-Not-Found/tricky-exchanger/pkg/codestore"
)

func TestStore_SaveAndGet(t *testing.T) {
	s := codestore.New()
	s.Save("key", "value", time.Minute)

	v, ok := s.Get("key")
	if !ok || v != "value" {
		t.Fatalf("expected (value, true), got (%q, %v)", v, ok)
	}
}

func TestStore_GetMissing(t *testing.T) {
	s := codestore.New()

	if _, ok := s.Get("missing"); ok {
		t.Fatal("expected ok=false for missing key")
	}
}

func TestStore_ExpiresAfterTTL(t *testing.T) {
	s := codestore.New()
	s.Save("key", "value", 10*time.Millisecond)

	time.Sleep(30 * time.Millisecond)

	if _, ok := s.Get("key"); ok {
		t.Fatal("expected key to expire after TTL")
	}
}

func TestStore_SaveOverwritesPreviousValue(t *testing.T) {
	s := codestore.New()
	s.Save("key", "first", time.Minute)
	s.Save("key", "second", time.Minute)

	v, ok := s.Get("key")
	if !ok || v != "second" {
		t.Fatalf("expected (second, true), got (%q, %v)", v, ok)
	}
}

func TestStore_Delete(t *testing.T) {
	s := codestore.New()
	s.Save("key", "value", time.Minute)
	s.Delete("key")

	if _, ok := s.Get("key"); ok {
		t.Fatal("expected key to be gone after Delete")
	}
}
