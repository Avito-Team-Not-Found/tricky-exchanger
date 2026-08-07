COMPOSE := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)

.PHONY: up down logs db-logs run test

# Поднять весь проект (БД + миграции + бэкенд) одной командой
up:
	$(COMPOSE) up -d --build

# Остановить и удалить все контейнеры и volume'ы
down:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f app

db-logs:
	$(COMPOSE) logs -f db

# Локальный запуск бэкенда без Docker (нужна поднятая БД, см. `make up`)
run:
	cd backend && go run ./cmd/api

test:
	cd backend && go test ./...
