.PHONY: db-up db-down db-logs run migrate-up migrate-down

# База данных
db-up:
	docker compose up -d db

db-down:
	docker compose down

db-logs:
	docker compose logs -f db

# Миграции
migrate-up:
	cd backend && go run ./cmd/migrate up

migrate-down:
	cd backend && go run ./cmd/migrate down

# Запуск бэкенда
run:
	cd backend && go run ./cmd/api