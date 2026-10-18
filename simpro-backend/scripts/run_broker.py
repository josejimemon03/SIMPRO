#!/usr/bin/env python3
"""
Broker MQTT local en Python (sin Docker / sin Mosquitto).
Útil en macOS antiguos donde Docker Desktop no corre.

  source .venv/bin/activate
  python scripts/run_broker.py
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from amqtt.broker import Broker


def parse_args():
    p = argparse.ArgumentParser(description="Broker MQTT local SIMPRO (amqtt)")
    p.add_argument("--host", default=os.getenv("MQTT_BIND_HOST", "127.0.0.1"))
    p.add_argument("--port", type=int, default=int(os.getenv("MQTT_PORT", "1883")))
    return p.parse_args()


async def run(host: str, port: int):
    config = {
        "listeners": {
            "default": {
                "type": "tcp",
                "bind": f"{host}:{port}",
            },
        },
        "sys_interval": 0,
        "auth": {
            "allow-anonymous": True,
            "plugins": ["auth_anonymous"],
        },
        "topic-check": {"enabled": False},
    }
    broker = Broker(config)
    await broker.start()
    print(f"Broker MQTT listo en {host}:{port}  (Ctrl+C para detener)")
    # Mantener vivo hasta señal
    try:
        await asyncio.Future()
    finally:
        await broker.shutdown()


def main():
    args = parse_args()
    logging.basicConfig(level=logging.WARNING)
    try:
        asyncio.run(run(args.host, args.port))
    except KeyboardInterrupt:
        print("\nBroker detenido.")


if __name__ == "__main__":
    main()
