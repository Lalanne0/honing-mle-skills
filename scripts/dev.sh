#!/bin/sh
# Run backend and frontend together. If either exits, stop the other and
# exit with that server's status. Ctrl-C stops both.
set -u
cd "$(dirname "$0")/.."

(cd backend && exec uv run uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload --reload-dir app) &
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
