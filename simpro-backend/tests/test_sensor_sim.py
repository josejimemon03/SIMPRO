"""Pruebas del simulador de sensores (sin broker real)."""

import random

from app.sensor_sim import (
    SensorReading,
    apply_manual_stop,
    clear_down,
    initial_sensors,
    tick_sensor,
    tick_all,
    TOPIC_PREFIX,
)


def test_initial_sensors_five_stations():
    sensors = initial_sensors()
    assert len(sensors) == 5
    ids = {s.station_id for s in sensors}
    assert ids == {"corte", "troquelado", "soldadura", "pintura", "empaque"}


def test_mqtt_topic_and_payload():
    s = initial_sensors()[2]  # soldadura
    assert s.topic() == f"{TOPIC_PREFIX}/soldadura"
    payload = s.to_mqtt_payload()
    assert payload["station_id"] == "soldadura"
    assert payload["linea_id"] == "soldadura"
    assert payload["contador"] == payload["units"]
    assert payload["down"] is False
    assert payload["manual_stop"] is False


def test_tick_fault_only_recommends_not_stops():
    """fault_chance solo sube el ciclo (ámbar); nunca pone down."""
    s = SensorReading(
        station_id="corte", name="Corte", meta=45, ciclo=42, oee=88, units=100, down=False
    )
    rng = random.Random(0)
    warned = tick_sensor(s, fault_chance=1.0, rng=rng)
    assert warned.down is False
    assert warned.manual_stop is False
    assert warned.ciclo >= int(round(s.meta * 1.12))


def test_manual_stop_keeps_station_down():
    s = SensorReading(
        station_id="pintura", name="Pintura", meta=40, ciclo=38, oee=90, units=100, down=False
    )
    stopped = apply_manual_stop(s, True)
    assert stopped.manual_stop is True
    assert stopped.down is True
    assert stopped.ciclo == 0

    still = tick_sensor(stopped, fault_chance=0.0, rng=random.Random(1))
    assert still.down is True
    assert still.manual_stop is True
    assert still.ciclo == 0


def test_clear_down_clears_manual_stop():
    s = SensorReading(
        station_id="pintura",
        name="Pintura",
        meta=40,
        ciclo=0,
        oee=50,
        units=100,
        down=True,
        manual_stop=True,
    )
    recovered = clear_down(s)
    assert recovered.down is False
    assert recovered.manual_stop is False
    assert recovered.ciclo == recovered.meta
    assert recovered.oee >= 60


def test_tick_all_preserves_count():
    sensors = initial_sensors()
    next_gen = tick_all(sensors, fault_chance=0.0, rng=random.Random(42))
    assert len(next_gen) == 5
    assert all(not s.down for s in next_gen)


def test_units_do_not_exceed_meta():
    s = SensorReading(
        station_id="empaque", name="Empaque", meta=32, ciclo=30, oee=85, units=149, down=False
    )
    rng = random.Random(99)
    for _ in range(20):
        s = tick_sensor(s, fault_chance=0.0, rng=rng)
    assert s.units <= 150
