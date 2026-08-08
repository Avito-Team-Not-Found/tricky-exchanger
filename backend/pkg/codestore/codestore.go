// Package codestore хранит одноразовые коды подтверждения (например, код
// восстановления пароля) в памяти процесса на ограниченное время.
//
// Это сознательно не БД и не Redis: коды живут считанные минуты, а хранить
// их персистентно не даёт заметной пользы — если сервис перезапустится,
// пользователь просто запросит код заново. Если понадобится шарить коды
// между несколькими инстансами бэкенда — Store можно заменить Redis-реализацией
// с тем же интерфейсом, не трогая service-слой.
package codestore

import (
	"sync"
	"time"
)

type entry struct {
	value     string
	expiresAt time.Time
}

// Store — потокобезопасное in-memory key-value хранилище с TTL на запись.
type Store struct {
	mu   sync.Mutex
	data map[string]entry
}

func New() *Store {
	return &Store{data: make(map[string]entry)}
}

// Save сохраняет value под ключом key на время ttl, затирая предыдущее
// значение по этому ключу (например, предыдущий код восстановления).
func (s *Store) Save(key, value string, ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.data[key] = entry{value: value, expiresAt: time.Now().Add(ttl)}
}

// Get возвращает значение по ключу. ok=false, если записи нет или у неё истёк TTL.
func (s *Store) Get(key string) (string, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	e, ok := s.data[key]
	if !ok {
		return "", false
	}
	if time.Now().After(e.expiresAt) {
		delete(s.data, key)
		return "", false
	}

	return e.value, true
}

// Delete удаляет запись по ключу (например, после успешного использования кода).
func (s *Store) Delete(key string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.data, key)
}
