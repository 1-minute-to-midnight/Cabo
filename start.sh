#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_FILE="$ROOT_DIR/.cabo-server.pid"
LOG_FILE="$ROOT_DIR/.cabo-server.log"
PORT="${PORT:-3000}"
URL="http://localhost:$PORT"

cd "$ROOT_DIR"

open_browser() {
  local url="$1"
  if command -v xdg-open >/dev/null 2>&1; then
    nohup xdg-open "$url" >/dev/null 2>&1 &
  elif command -v open >/dev/null 2>&1; then
    open "$url" >/dev/null 2>&1 &
  elif command -v wslview >/dev/null 2>&1; then
    wslview "$url" >/dev/null 2>&1 &
  else
    echo "Open this URL in your browser: $url"
  fi
}

if [[ -f "$PID_FILE" ]]; then
  PID="$(cat "$PID_FILE")"
  if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
    echo "Cabo is already running at $URL (pid $PID)."
    if [[ "${CABO_OPEN_BROWSER:-1}" != "0" ]]; then
      open_browser "$URL"
    fi
    exit 0
  fi
  rm -f "$PID_FILE"
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Starting Cabo at $URL ..."
if command -v setsid >/dev/null 2>&1; then
  nohup setsid env PORT="$PORT" node server/index.js >"$LOG_FILE" 2>&1 &
else
  nohup env PORT="$PORT" node server/index.js >"$LOG_FILE" 2>&1 &
fi
PID="$!"
echo "$PID" > "$PID_FILE"

sleep 1.2
if ! kill -0 "$PID" 2>/dev/null; then
  echo "Cabo failed to start. Recent log:"
  tail -40 "$LOG_FILE" || true
  rm -f "$PID_FILE"
  exit 1
fi

echo "Cabo is running in the background (pid $PID)."
echo "Log: $LOG_FILE"

if [[ "${CABO_OPEN_BROWSER:-1}" != "0" ]]; then
  open_browser "$URL"
fi
