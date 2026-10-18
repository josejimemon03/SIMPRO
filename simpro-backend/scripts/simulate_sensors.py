#!/usr/bin/env python3
"""
Simula sensores ESP32 publicando telemetría al broker MQTT.

Uso (con broker en localhost vía docker compose):
  cd simpro-backend
  docker compose up -d broker
  source .venv/bin/activate
  python scripts/simulate_sensors.py

O junto a todo el stack:
  docker compose --profile sim up --build
"""

from __future__ import annotations

import argparse
import json
import os
import signal
import sys
import threading
import time

# Permitir `python scripts/simulate_sensors.py` desde la raíz del backend
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import paho.mqtt.client as mqtt

from app.mqtt import COMMAND_TOPIC_PREFIX
from app.sensor_sim import clear_down, initial_sensors, tick_all


def parse_args():
    p = argparse.ArgumentParser(description="Simulador de sensores SIMPRO (MQTT)")
    p.add_argument("--broker", default=os.getenv("MQTT_BROKER", "localhost"))
    p.add_argument("--port", type=int, default=int(os.getenv("MQTT_PORT", "1883")))
    p.add_argument("--interval", type=float, default=float(os.getenv("SIM_INTERVAL", "2.5")),
                   help="Segundos entre publicaciones")
    p.add_argument("--fault-chance", type=float, default=float(os.getenv("SIM_FAULT_CHANCE", "0.02")),
                   help="Probabilidad por tick de parada aleatoria (0–1)")
    p.add_argument("--recover-chance", type=float, default=0.25,
                   help="(Reservado) La recuperación es solo por comando del supervisor")
    p.add_argument("--once", action="store_true", help="Publica un ciclo y sale (útil en tests)")
    p.add_argument("--quiet", action="store_true", help="Menos logs")
    return p.parse_args()


def main():
    args = parse_args()
    sensors = initial_sensors()
    sensors_lock = threading.Lock()
    running = True

    def _stop(*_):
        nonlocal running
        running = False

    signal.signal(signal.SIGINT, _stop)
    signal.signal(signal.SIGTERM, _stop)

    client = mqtt.Client(client_id="simpro-sensor-sim")

    def on_command(_client, _userdata, msg):
        """El supervisor resuelve → reactivar estación en el simulador."""
        nonlocal sensors
        try:
            data = json.loads(msg.payload.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            return
        if data.get("action") != "resolve":
            return
        station_id = data.get("station_id")
        if not station_id and msg.topic.startswith(COMMAND_TOPIC_PREFIX + "/"):
            station_id = msg.topic.rsplit("/", 1)[-1]
        if not station_id:
            return
        with sensors_lock:
            sensors = [
                clear_down(s) if s.station_id == station_id else s
                for s in sensors
            ]
        if not args.quiet:
            print(f"  [RESOLVE] estación {station_id} reactivada por comando")

    def on_connect(_client, _userdata, _flags, rc):
        if rc == 0:
            client.subscribe(f"{COMMAND_TOPIC_PREFIX}/#")
            if not args.quiet:
                print(f"Suscrito a {COMMAND_TOPIC_PREFIX}/# (resoluciones)")

    client.on_connect = on_connect
    client.on_message = on_command

    try:
        client.connect(args.broker, args.port, 60)
    except Exception as e:
        print(f"No se pudo conectar a MQTT {args.broker}:{args.port} — {e}", file=sys.stderr)
        print("¿Está el broker arriba?  docker compose up -d broker", file=sys.stderr)
        sys.exit(1)

    client.loop_start()
    if not args.quiet:
        print(f"Simulador conectado a {args.broker}:{args.port}")
        print(f"Publicando cada {args.interval}s · fault={args.fault_chance}")
        print("Ctrl+C para detener\n")

    try:
        while running:
            with sensors_lock:
                sensors = tick_all(
                    sensors,
                    fault_chance=args.fault_chance,
                    recover_chance=args.recover_chance,
                )
                snapshot = list(sensors)
            for s in snapshot:
                payload = json.dumps(s.to_mqtt_payload())
                client.publish(s.topic(), payload, qos=0)
                if not args.quiet:
                    flag = "DOWN" if s.down else "ok"
                    print(
                        f"  [{flag}] {s.topic()}  ciclo={s.ciclo}s  oee={s.oee}%  units={s.units}"
                    )
            if not args.quiet:
                print("---")
            if args.once:
                break
            # sleep en trozos para reaccionar rápido a Ctrl+C
            end = time.time() + args.interval
            while running and time.time() < end:
                time.sleep(0.1)
    finally:
        client.loop_stop()
        client.disconnect()
        if not args.quiet:
            print("Simulador detenido.")


if __name__ == "__main__":
    main()
