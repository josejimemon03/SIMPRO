from __future__ import annotations
import random
from dataclasses import dataclass, asdict
from typing import Optional

STATIONS = (
    {"id": "corte", "name": "Corte", "meta": 45, "ciclo": 42, "oee": 88, "units": 132},
    {"id": "troquelado", "name": "Troquelado", "meta": 55, "ciclo": 53, "oee": 81, "units": 126},
    {"id": "soldadura", "name": "Soldadura", "meta": 55, "ciclo": 63, "oee": 74, "units": 128},
    {"id": "pintura", "name": "Pintura", "meta": 40, "ciclo": 38, "oee": 90, "units": 121},
    {"id": "empaque", "name": "Empaque", "meta": 32, "ciclo": 30, "oee": 85, "units": 118},
)

TOPIC_PREFIX = "simpro/produccion"
U_META = 150
U_MIN = 80  # Nuevo tope mínimo para las unidades

def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))

@dataclass
class SensorReading:
    station_id: str
    name: str
    meta: int
    ciclo: int
    oee: int
    units: int
    down: bool
    oee_direction: int = 1  
    units_direction: int = 1  # NUEVO: Controla si las unidades suben (1) o bajan (-1)

    def to_mqtt_payload(self) -> dict:
        return {
            "station_id": self.station_id,
            "linea_id": self.station_id,
            "name": self.name,
            "meta": self.meta,
            "ciclo": self.ciclo,
            "oee": self.oee,
            "units": self.units,
            "contador": self.units,
            "down": self.down,
        }

    def topic(self) -> str:
        return f"{TOPIC_PREFIX}/{self.station_id}"

def initial_sensors() -> list[SensorReading]:
    return [
        SensorReading(
            station_id=s["id"],
            name=s["name"],
            meta=s["meta"],
            ciclo=s["ciclo"],
            oee=s["oee"],
            units=s["units"],
            down=False,
        )
        for s in STATIONS
    ]
def tick_sensor(
    sensor: SensorReading,
    *,
    fault_chance: float = 0.02,
    recover_chance: float = 0.25, # Se mantiene el argumento para no romper la función tick_all
    rng: Optional[random.Random] = None,
) -> SensorReading:
    r = rng or random
    s = SensorReading(**asdict(sensor))

    # Sin autocuración: permanece down hasta clear_down() (comando del supervisor)
    if s.down:
        s.ciclo = 0
        return s

    if r.random() < fault_chance:
        s.down = True
        s.oee = max(40, s.oee - 18)
        return s

    delta = r.randint(-2, 2)
    s.ciclo = int(clamp(s.ciclo + delta, round(s.meta * 0.85), round(s.meta * 1.3)))

    # --- Lógica de oscilación controlada del OEE ---
    if s.oee >= 100:
        s.oee_direction = -1
    elif s.oee <= 80:
        s.oee_direction = 1

    if r.random() < 0.5:
        paso = r.randint(1, 2)
        s.oee = int(clamp(s.oee + (s.oee_direction * paso), 40, 100))

    # --- Lógica cíclica tipo "Ping-Pong" para las unidades ---
    if not s.down:
        # Evaluamos los límites para cambiar de dirección
        if s.units >= U_META:
            s.units_direction = -1
        elif s.units <= U_MIN:
            s.units_direction = 1
            
        # Aplicamos el incremento o decremento
        s.units += s.units_direction

    return s

def clear_down(sensor: SensorReading) -> SensorReading:
    """Reactiva una estación tras resolución del supervisor."""
    s = SensorReading(**asdict(sensor))
    s.down = False
    s.ciclo = s.meta
    s.oee = max(s.oee, 60)
    return s


def tick_all(
    sensors: list[SensorReading],
    *,
    fault_chance: float = 0.02,
    recover_chance: float = 0.25,
    rng: Optional[random.Random] = None,
) -> list[SensorReading]:
    return [
        tick_sensor(s, fault_chance=fault_chance, recover_chance=recover_chance, rng=rng)
        for s in sensors
    ]