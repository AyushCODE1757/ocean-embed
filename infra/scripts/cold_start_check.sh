#!/usr/bin/env bash
# Clean-machine check: build, start, and confirm the API answers. Does not create data.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] || cp .env.example .env
docker compose -f infra/docker-compose.yml up --build -d
trap 'docker compose -f infra/docker-compose.yml down' EXIT
for i in $(seq 1 30); do
  if curl -fsS http://localhost:8000/v1/health >/dev/null; then echo "api: ok"; break; fi
  sleep 2
  [ "$i" = 30 ] && { echo "api did not become healthy"; exit 1; }
done
curl -fsS -o /dev/null http://localhost:3000 && echo "web: ok"
code=$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/v1/meta)
case "$code" in
  200) echo "data: built" ;;
  503) echo "data: not built yet (expected until A and B publish artifacts)" ;;
  *)   echo "unexpected /v1/meta status $code"; exit 1 ;;
esac
