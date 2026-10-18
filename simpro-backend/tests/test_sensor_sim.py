"""Pruebas del simulador de sensores (sin broker real)."""

import random

from app.sensor_sim import (
    SensorReading,
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


def test_tick_can_force_fault_with_seeded_rng():
    s = SensorReading(
        station_id="corte", name="Corte", meta=45, ciclo=42, oee=88, units=100, down=False
    )
    # fault_chance=1.0 → siempre falla si random() < 1
    rng = random.Random(0)
    down = tick_sensor(s, fault_chance=1.0, rng=rng)
    assert down.down is True
    assert down.oee <= s.oee


def test_tick_stays_down_until_cleared():
    s = SensorReading(
        station_id="pintura", name="Pintura", meta=40, ciclo=38, oee=50, units=100, down=True
    )
    still_down = tick_sensor(s, recover_chance=1.0, rng=random.Random(1))
    assert still_down.down is True
    assert still_down.ciclo == 0


def test_clear_down_reactivates_station():
    from app.sensor_sim import clear_down

    s = SensorReading(
        station_id="pintura", name="Pintura", meta=40, ciclo=0, oee=50, units=100, down=True
    )
    recovered = clear_down(s)
    assert recovered.down is False
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
