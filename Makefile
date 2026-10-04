.PHONY: help setup lint format test artifacts serve web up down gate

help:
	@echo "OceanEmbed targets:"
	@echo "  make setup      - install python workspace (uv sync) and web deps (npm ci)"
	@echo "  make lint       - ruff check + format check (python)"
	@echo "  make test       - pytest over all packages"
	@echo "  make artifacts  - build serving artifacts from data/app_data (predictions.zarr, metrics, manifest)"
	@echo "  make serve      - run the API locally on :8000"
	@echo "  make web        - run the web app locally on :3000"
	@echo "  make up         - docker compose up (API + web, reads artifacts/)"
	@echo "  make down       - docker compose down"
	@echo "  make gate       - lint + test (the pre-commit gate)"

setup:
	uv sync
	cd apps/web && npm ci

lint:
	uv run ruff check .
	uv run ruff format --check .

format:
	uv run ruff format .

test:
	uv run pytest -q

artifacts:
	uv run python scripts/build_artifacts.py

serve:
	uv run uvicorn oceanembed_serving.main:app --reload --port 8000

web:
	cd apps/web && npm run dev

up:
	docker compose -f infra/docker-compose.yml up --build -d

down:
	docker compose -f infra/docker-compose.yml down

gate: lint test
