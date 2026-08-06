.PHONY: db-up db-down db-logs run

# База данных
db-up:
	docker compose up -d db

db-down:
	docker compose down

db-logs:
	docker compose logs -f db

# Запуск бэкенда
run:
	cd backend && go run ./cmd/server