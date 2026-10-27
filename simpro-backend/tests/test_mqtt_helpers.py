"""Pruebas unitarias del mapeo de telemetría MQTT."""

import asyncio

import app.main as main_mod
from app.main import manager, mqtt_to_ws_bridge


def _run_bridge(payload, *, expect_min=1):
    captured = []

    async def fake_broadcast(msg):
        captured.append(msg)

    original = manager.broadcast
    manager.broadcast = fake_broadcast  # type: ignore
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    main_mod.main_loop = loop
    main_mod._station_down.clear()

    try:

        async def run():
            mqtt_to_ws_bridge(payload)
            # Dar tiempo al Future de run_coroutine_threadsafe
            for _ in range(40):
                await asyncio.sleep(0.01)
                if len(captured) >= expect_min:
                    break

        loop.run_until_complete(run())
        return captured
    finally:
        manager.broadcast = original
        main_mod.main_loop = None
        main_mod._station_down.clear()
        loop.close()


def test_station_id_from_topic():
    captured = _run_bridge(
        {"topic": "simpro/produccion/pintura", "data": {"ciclo": 40, "oee": 90}}
    )
    assert len(captured) == 1
    assert captured[0]["type"] == "telemetry"
    assert captured[0]["station_id"] == "pintura"
    assert captured[0]["ciclo"] == 40


def test_station_id_from_payload_prefers_explicit():
    captured = _run_bridge(
        {
            "topic": "simpro/produccion/otra",
            "data": {"station_id": "empaque", "contador": 99},
        }
    )
    assert captured[0]["station_id"] == "empaque"
    assert captured[0]["units"] == 99


def test_telemetry_down_does_not_auto_parada():
    """El sistema no crea paradas solas: telemetría down solo actualiza métricas."""
    captured = _run_bridge(
        {
            "topic": "simpro/produccion/soldadura",
            "data": {
                "station_id": "soldadura",
                "name": "Soldadura",
                "ciclo": 0,
                "oee": 56,
                "units": 100,
                "down": True,
            },
        },
        expect_min=1,
    )
    types = [m["type"] for m in captured]
    assert "telemetry" in types
    assert "parada" not in types
    assert captured[0]["down"] is True
