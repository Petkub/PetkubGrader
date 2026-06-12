.PHONY: help up down logs ps build rebuild migrate migrate-init shell-api shell-db psql seed-topics backup

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-18s\033[0m %s\n", $$1, $$2}'

up: ## Start everything
	docker compose up -d

down: ## Stop everything (keep volumes)
	docker compose down

build: ## Build images
	docker compose build

rebuild: ## Force rebuild without cache
	docker compose build --no-cache

logs: ## Tail all logs
	docker compose logs -f --tail=100

ps: ## Show service status
	docker compose ps

migrate-init: ## Autogenerate first table migration from models (run after first up)
	docker compose run --rm fastapi alembic revision --autogenerate -m "tables"
	@echo ">>> Review the generated file in apps/api/alembic/versions/ then run: make migrate"

migrate: ## Apply alembic migrations
	docker compose run --rm fastapi alembic upgrade head

shell-api: ## Bash inside fastapi container
	docker compose exec fastapi /bin/bash

shell-db: ## psql inside app postgres
	docker compose exec postgres psql -U $${POSTGRES_USER:-mygrader} -d $${POSTGRES_DB:-mygrader}

seed-topics: ## Seed common CP topic tags
	docker compose exec postgres psql -U $${POSTGRES_USER:-mygrader} -d $${POSTGRES_DB:-mygrader} -c "\
		INSERT INTO topics (id, slug, name) VALUES \
		(gen_random_uuid(), 'dp', 'Dynamic Programming'), \
		(gen_random_uuid(), 'graphs', 'Graphs'), \
		(gen_random_uuid(), 'greedy', 'Greedy'), \
		(gen_random_uuid(), 'math', 'Math'), \
		(gen_random_uuid(), 'strings', 'Strings'), \
		(gen_random_uuid(), 'data-structures', 'Data Structures'), \
		(gen_random_uuid(), 'geometry', 'Geometry'), \
		(gen_random_uuid(), 'number-theory', 'Number Theory'), \
		(gen_random_uuid(), 'binary-search', 'Binary Search'), \
		(gen_random_uuid(), 'segment-tree', 'Segment Tree'), \
		(gen_random_uuid(), 'flow', 'Flow & Matching'), \
		(gen_random_uuid(), 'implementation', 'Implementation') \
		ON CONFLICT (slug) DO NOTHING;"

backup: ## Dump app DB + tar testcases to ./backups/
	@mkdir -p backups
	docker compose exec -T postgres pg_dump -U $${POSTGRES_USER:-mygrader} $${POSTGRES_DB:-mygrader} | gzip > backups/db-$$(date +%Y%m%d-%H%M).sql.gz
	tar -czf backups/testcases-$$(date +%Y%m%d-%H%M).tar.gz data/testcases
	@echo "Backed up to ./backups/"
