#!/usr/bin/env bash
# Keeps Next dev alive after the terminal closes (ignores SIGHUP via nohup).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
PID_FILE="$ROOT/.impact-dev.pid"
LOG_FILE="$ROOT/.impact-dev.log"

if [[ -f "$PID_FILE" ]]; then
  oldpid="$(cat "$PID_FILE" 2>/dev/null || true)"
  if [[ -n "${oldpid}" ]] && kill -0 "$oldpid" 2>/dev/null; then
    echo "Impact dev already running (PID $oldpid) — http://localhost:3000"
    echo "Log: $LOG_FILE"
    exit 0
  fi
fi

: > "$LOG_FILE"
nohup npm run dev >>"$LOG_FILE" 2>&1 &
echo $! >"$PID_FILE"
echo "Started Impact dev (PID $(cat "$PID_FILE")) — http://localhost:3000"
echo "Log: $LOG_FILE (tail -f to watch)"
echo "Stop: kill \$(cat $PID_FILE)"
