#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/realease_assets/docker-compose.example.yml"
ENV_FILE="$ROOT_DIR/.env"

if [[ $# -ne 4 || "$1" != "--username" || "$3" != "--password" ]]; then
  echo "Usage: pnpm compose:create-user --username <name> --password <password>" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE. Copy realease_assets/.env.example to .env first." >&2
  exit 1
fi

if ! docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps --services --status running | grep -qx "app"; then
  echo "The compose app service is not running. Start the stack first with:" >&2
  echo "  cp realease_assets/.env.example .env" >&2
  echo "  docker compose -f realease_assets/docker-compose.example.yml --env-file .env up -d" >&2
  exit 1
fi

docker compose \
  -f "$COMPOSE_FILE" \
  --env-file "$ENV_FILE" \
  exec -T app \
  pnpm create:user --username "$2" --password "$4"
