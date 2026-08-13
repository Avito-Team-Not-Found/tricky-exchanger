// Package codestore — in-memory TTL-хранилище одноразовых кодов (не шарится между инстансами).
package codestore

import (
	"sync"
	"time"
)

type entry struct {
	value     string
	expiresAt time.Time
}

type Store struct {
	mu   sync.Mutex
	data map[string]entry
}

func New() *Store {
	return &Store{data: make(map[string]entry)}
}

func (s *Store) Save(key, value string, ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.data[key] = entry{value: value, expiresAt: time.Now().Add(ttl)}
}

func (s *Store) Get(key string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	e, ok := s.data[key]
	if !ok || time.Now().After(e.expiresAt) {
		if ok {
			delete(s.data, key)
		}
		return "", false
	}
	return e.value, true
}

func (s *Store) Delete(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.data, key)
}
