#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ ! -f "$ROOT_DIR/backend/.env" ] && [ -f "$ROOT_DIR/backend/.env.example" ]; then
  cp "$ROOT_DIR/backend/.env.example" "$ROOT_DIR/backend/.env"
  echo "Created backend/.env from backend/.env.example"
fi

if [ ! -d "$ROOT_DIR/backend/node_modules" ]; then
  echo "Installing backend dependencies..."
  npm --prefix "$ROOT_DIR/backend" install
fi

if [ ! -d "$ROOT_DIR/frontend/node_modules" ]; then
  echo "Installing frontend dependencies..."
  npm --prefix "$ROOT_DIR/frontend" install
fi

cleanup() {
  echo ""
  echo "Stopping AeroCab backend and frontend..."
  kill 0 2>/dev/null || true
}

trap cleanup SIGINT SIGTERM EXIT

echo "Starting Backend API on http://localhost:4000 ..."
npm --prefix "$ROOT_DIR/backend" run dev &

echo "Starting Frontend UI on http://localhost:5173 ..."
npm --prefix "$ROOT_DIR/frontend" run dev &

wait
