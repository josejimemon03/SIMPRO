"""Pruebas unitarias del mapeo de telemetría MQTT."""

import asyncio

import app.main as main_mod
from app.main import AUTO_PARADA_CAUSA, manager, mqtt_to_ws_bridge


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


def test_telemetry_down_emits_supervisor_parada():
    """Parada automática del sensor debe avisar al supervisor (evento parada)."""
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
        expect_min=2,
    )
    types = [m["type"] for m in captured]
    assert "telemetry" in types
    assert "parada" in types
    parada = next(m for m in captured if m["type"] == "parada")
    assert parada["sid"] == "soldadura"
    assert parada["estacion"] == "Soldadura"
    assert parada["causa"] == AUTO_PARADA_CAUSA
    assert parada["client_id"] == "system"


def test_telemetry_down_does_not_duplicate_parada():
    captured = []

    async def fake_broadcast(msg):
        captured.append(msg)

    original = manager.broadcast
    manager.broadcast = fake_broadcast  # type: ignore
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    main_mod.main_loop = loop
    main_mod._station_down.clear()

    payload = {
        "topic": "simpro/produccion/corte",
        "data": {"station_id": "corte", "name": "Corte", "down": True, "ciclo": 0},
    }

    try:

        async def run():
            mqtt_to_ws_bridge(payload)
            mqtt_to_ws_bridge(payload)
            for _ in range(50):
                await asyncio.sleep(0.01)
                if len(captured) >= 3:
                    break

        loop.run_until_complete(run())
    finally:
        manager.broadcast = original
        main_mod.main_loop = None
        main_mod._station_down.clear()
        loop.close()

    paradas = [m for m in captured if m["type"] == "parada"]
    assert len(paradas) == 1
