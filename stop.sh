#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT_DIR/.cabo-server.pid"

if [[ ! -f "$PID_FILE" ]]; then
  echo "No Cabo PID file found. Nothing to stop."
  exit 0
fi

PID="$(cat "$PID_FILE")"
if [[ -z "$PID" ]] || ! kill -0 "$PID" 2>/dev/null; then
  echo "Cabo is not running. Removing stale PID file."
  rm -f "$PID_FILE"
  exit 0
fi

echo "Stopping Cabo (pid $PID) ..."
kill "$PID"

for _ in {1..30}; do
  if ! kill -0 "$PID" 2>/dev/null; then
    rm -f "$PID_FILE"
    echo "Stopped."
    exit 0
  fi
  sleep 0.1
done

echo "Process did not exit in time; forcing stop."
kill -9 "$PID" 2>/dev/null || true
rm -f "$PID_FILE"
echo "Stopped."
