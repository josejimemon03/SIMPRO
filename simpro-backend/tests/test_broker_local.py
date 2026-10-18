"""Smoke test: el broker MQTT en Python arranca y acepta una publicación."""

import asyncio
import json
import time

import paho.mqtt.client as mqtt
from amqtt.broker import Broker


def test_local_broker_accepts_publish():
    async def _run():
        config = {
            "listeners": {
                "default": {"type": "tcp", "bind": "127.0.0.1:18884"},
            },
            "sys_interval": 0,
            "auth": {"allow-anonymous": True, "plugins": ["auth_anonymous"]},
            "topic-check": {"enabled": False},
        }
        broker = Broker(config)
        await broker.start()
        try:
            received = []

            def on_message(_c, _u, msg):
                received.append(json.loads(msg.payload.decode()))

            client = mqtt.Client(client_id="test-local-broker")
            client.on_message = on_message
            client.connect("127.0.0.1", 18884, 60)
            client.subscribe("simpro/produccion/corte")
            client.loop_start()
            await asyncio.sleep(0.3)
            client.publish(
                "simpro/produccion/corte",
                json.dumps({"station_id": "corte", "ciclo": 41, "oee": 87, "units": 10}),
            )
            deadline = time.time() + 3
            while not received and time.time() < deadline:
                await asyncio.sleep(0.05)
            client.loop_stop()
            client.disconnect()

            assert received
            assert received[0]["station_id"] == "corte"
            assert received[0]["ciclo"] == 41
        finally:
            await broker.shutdown()

    asyncio.run(_run())
