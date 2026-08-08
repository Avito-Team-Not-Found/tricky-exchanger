COMPOSE := $(shell if docker compose version >/dev/null 2>&1; then echo "docker compose"; else echo "docker-compose"; fi)
# Имя текущего compose-проекта (обычно имя папки) — нужно, чтобы `make down` точечно
# удалял volume'ы только этого проекта и не задел одноимённые volume'ы других проектов
# на этой же машине.
PROJECT_NAME := $(shell $(COMPOSE) config --format json 2>/dev/null | grep -o '"name": *"[^"]*"' | head -1 | sed -E 's/.*"([^"]+)"$$/\1/')

.PHONY: up down down-all logs db-logs run test

# Поднять весь проект (БД + миграции + бэкенд) одной командой
up:
	$(COMPOSE) up -d --build

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
	$(COMPOSE) logs -f app

db-logs:
	$(COMPOSE) logs -f db

# Локальный запуск бэкенда без Docker (нужна поднятая БД, см. `make up`)
run:
	cd backend && go run ./cmd/api

test:
	cd backend && go test ./...
