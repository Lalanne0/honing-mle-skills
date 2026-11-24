#!/bin/sh
# Run backend and frontend together. If either exits, stop the other and
# exit with that server's status. Ctrl-C stops both.
set -u
cd "$(dirname "$0")/.."
# Ports can be overridden so parallel worktrees don't collide. Vite reads the
# same variables for its own port and for its /api proxy target.
export BACKEND_PORT="${BACKEND_PORT:-8000}"
export FRONTEND_PORT="${FRONTEND_PORT:-5173}"

(cd backend && exec uv run uvicorn app.main:app --host 127.0.0.1 --port "$BACKEND_PORT" --reload --reload-dir app) &
backend=$!
(cd frontend && exec npm run dev) &
frontend=$!

stop() {
  kill "$backend" "$frontend" 2>/dev/null
  wait "$backend" "$frontend" 2>/dev/null
}
trap 'stop; exit 130' INT TERM

while kill -0 "$backend" 2>/dev/null && kill -0 "$frontend" 2>/dev/null; do
  sleep 1
done
if kill -0 "$backend" 2>/dev/null; then exited=$frontend; else exited=$backend; fi
wait "$exited"
status=$?
stop
exit "$status"
