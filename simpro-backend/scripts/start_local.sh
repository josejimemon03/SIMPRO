#!/usr/bin/env bash
# Arranca SIMPRO sin Docker: broker MQTT + API + sensores
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .venv ]]; then
  echo "Creando entorno virtual..."
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi

# shellcheck disable=SC1091
source .venv/bin/activate

export MQTT_BROKER="${MQTT_BROKER:-127.0.0.1}"
export MQTT_PORT="${MQTT_PORT:-1883}"

PIDS=()
cleanup() {
  echo ""
  echo "Deteniendo procesos locales..."
  for pid in "${PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM

echo "1/2 Broker MQTT en $MQTT_BROKER:$MQTT_PORT"
python scripts/run_broker.py --host "$MQTT_BROKER" --port "$MQTT_PORT" &
PIDS+=($!)
sleep 1

echo "2/2 API FastAPI en http://127.0.0.1:8000"
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload &
PIDS+=($!)
sleep 2

echo ""
echo "SIMPRO local listo (sin Docker)."
echo "  API:       http://127.0.0.1:8000"
echo "  Health:    http://127.0.0.1:8000/api/health"
echo "  Sensores:  inactivos hasta el botón en el frontend"
echo "  Frontend:  cd ../simpro-frontend && npm run dev"
echo ""
echo "Ctrl+C para detener todo."

wait
