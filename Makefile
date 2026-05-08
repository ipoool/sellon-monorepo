.PHONY: dev up down logs clean api-shell web-shell db-shell

dev:
	@cp -n .env.example .env || true
	docker compose up -d
	docker compose logs -f api web

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

clean:
	docker compose down -v

api-shell:
	docker compose exec api sh

web-shell:
	docker compose exec web sh

db-shell:
	docker compose exec postgres psql -U tokoflow -d tokoflow
