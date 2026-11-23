TOOLS_DIR ?= $(HOME)/tools
SRC       ?= backend/app frontend/src

.PHONY: install dev test lint crap dry mutate

install:
	cd backend && uv sync
	cd frontend && npm install

dev:
	@trap 'kill 0' EXIT; \
	(cd backend && uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app) & \
	(cd frontend && npm run dev) & \
	wait

test:
	cd backend && uv run pytest -q
	cd frontend && npm test

lint:
	cd backend && uv run ruff check . && uv run ruff format --check . && uv run mypy app tests
	cd frontend && npx oxlint && npm run typecheck

crap:
	$(TOOLS_DIR)/crapper/crapper $(SRC)

dry:
	$(TOOLS_DIR)/dryer/dryer --threshold 0.8 $(SRC)

mutate:
	$(TOOLS_DIR)/mutator/mutator $(SRC)
