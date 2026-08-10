COMPOSE := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)
# Имя текущего compose-проекта (обычно имя папки) — нужно, чтобы `make down` точечно
# удалял volume'ы только этого проекта и не задел одноимённые volume'ы других проектов
# на этой же машине.
PROJECT_NAME := $(shell $(COMPOSE) config --format json 2>/dev/null | grep -o '"name": *"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$$/\1/')

.PHONY: up down down-all logs db-logs run test test-e2e e2e-up e2e-down loadtest

# Весь проект одной командой: БД + migrate + MinIO + TEI + backend + frontend
up:
	$(COMPOSE) up -d --build
	@echo ""
	@echo "Готово:"
	@echo "  UI:      http://localhost:$${FRONTEND_PORT:-3000}"
	@echo "  API:     http://localhost:$${SERVER_PORT:-8080}"
	@echo "  MinIO:   http://localhost:$${MINIO_PORT:-9000}"
	@echo ""

# Остановить и удалить все контейнеры и volume'ы, КРОМЕ кэша модели TEI (teidata) —
# она качается из интернета при каждом старте контейнера tei, поэтому её сохраняем
# между `make down`/`make up`, чтобы не перекачивать заново.
down:
	$(COMPOSE) down
	@for v in pgdata minio_data; do \
		ids=$$(docker volume ls -q --filter "label=com.docker.compose.project=$(PROJECT_NAME)" --filter "label=com.docker.compose.volume=$$v"); \
		if [ -n "$$ids" ]; then docker volume rm $$ids; fi; \
	done

# Полный сброс, включая кэш модели TEI (следующий `make up` заново её скачает)
down-all:
	$(COMPOSE) down -v

logs:
	$(COMPOSE) logs -f app frontend

db-logs:
	$(COMPOSE) logs -f db

# Локальный запуск бэкенда без Docker (нужна поднятая БД, см. `make up`)
run:
	cd backend && go run ./cmd/api

test:
	cd backend && go test ./...

# Лёгкий стек без TEI для E2E/K6
e2e-up:
	$(COMPOSE) -f docker-compose.e2e.yml up -d --build
	@for i in $$(seq 1 60); do \
		if curl -fsS http://localhost:8080/healthz >/dev/null 2>&1; then echo "API is up"; exit 0; fi; \
		sleep 2; \
	done; echo "API failed to become healthy"; $(COMPOSE) -f docker-compose.e2e.yml logs; exit 1

e2e-down:
	$(COMPOSE) -f docker-compose.e2e.yml down -v

test-e2e: e2e-up
	cd backend && BASE_URL=http://localhost:8080 go test -tags=e2e ./tests/e2e/ -count=1 -v

# Нагрузка k6 (нужен поднятый API, например `make e2e-up`)
loadtest:
	BASE_URL=$${BASE_URL:-http://localhost:8080} k6 run loadtest/k6/auth_item_flow.js
