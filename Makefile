.PHONY: serve web test-serving test-web
serve:
	uv run --package oceanembed-serving uvicorn oceanembed_serving.main:app --reload --port 8000
web:
	cd apps/web && npm run dev
test-serving:
	uv run --package oceanembed-serving pytest packages/serving/tests
test-web:
	cd apps/web && npm run typecheck && npm test
