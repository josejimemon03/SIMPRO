import asyncio
import json
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.mqtt import (
    start_mqtt,
    stop_mqtt,
    set_message_callback,
    publish_resolve,
    publish_stop,
)
from app import sensor_runner
from app.sensor_sim import STATIONS


class SensorSimBody(BaseModel):
    running: bool


class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        dead = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                dead.append(connection)
        for connection in dead:
            self.disconnect(connection)


manager = ConnectionManager()
_alert_seq = 1
# Estación → estaba en parada (para emitir alerta solo en la transición a down)
_station_down: dict[str, bool] = {}
_STATION_NAMES = {s["id"]: s["name"] for s in STATIONS}
# Loop de asyncio de FastAPI (Paho MQTT llama desde otro hilo)
main_loop: Optional[asyncio.AbstractEventLoop] = None

def _coalesce_units(payload: dict):
    raw = payload.get("units", None)
    if raw is None:
        raw = payload.get("contador", None)
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _station_name(station_id: Optional[str], payload: dict) -> str:
    name = payload.get("name")
    if name:
        return str(name)
    if station_id and station_id in _STATION_NAMES:
        return _STATION_NAMES[station_id]
    return station_id or "Estación"


def mqtt_to_ws_bridge(data: dict):
    """Puente MQTT → WebSocket. data = {topic, data} desde mqtt.py.

    Importante: on_message de Paho corre en un hilo distinto al event loop.
    Hay que usar run_coroutine_threadsafe; get_running_loop() falla ahí y
    silenciaba toda la telemetría (unidades, ciclo, OEE).

    El sistema NO crea paradas automáticas: solo reenvía telemetría.
    Las paradas las reporta el operario (report_parada).
    """
    global _station_down
    payload = data.get("data") or {}
    topic = data.get("topic", "")

    station_id = payload.get("station_id") or payload.get("linea_id")
    if not station_id and topic:
        # simpro/produccion/soldadura → soldadura
        parts = topic.strip("/").split("/")
        if len(parts) >= 3:
            station_id = parts[-1]

    name = _station_name(station_id, payload)
    is_down = payload.get("down")

    message = {
        "type": "telemetry",
        "topic": topic,
        "station_id": station_id,
        "name": name,
        "ciclo": payload.get("ciclo"),
        "oee": payload.get("oee"),
        "units": _coalesce_units(payload),
        "down": is_down,
        "raw": payload,
    }

    if station_id and isinstance(is_down, bool):
        _station_down[station_id] = is_down

    loop = main_loop
    if loop is None or not loop.is_running():
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            print("mqtt_to_ws_bridge: sin event loop; telemetría descartada")
            return

    asyncio.run_coroutine_threadsafe(manager.broadcast(message), loop)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global main_loop
    main_loop = asyncio.get_running_loop()
    set_message_callback(mqtt_to_ws_bridge)
    try:
        start_mqtt()
    except Exception as e:
        print(f"MQTT no disponible al iniciar (modo demo): {e}")
    yield
    try:
        sensor_runner.stop()
    except Exception:
        pass
    try:
        stop_mqtt()
    except Exception:
        pass
    main_loop = None


app = FastAPI(title="SIMPRO API MVP", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"status": "SIMPRO Backend Operativo"}


@app.get("/api/sensor-sim")
def sensor_sim_status():
    return sensor_runner.status()


@app.post("/api/sensor-sim")
def sensor_sim_control(body: SensorSimBody):
    try:
        if body.running:
            result = sensor_runner.start()
        else:
            result = sensor_runner.stop()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e)) from e


@app.get("/api/health")
def health():
    db_status = {"connected": False, "error": None}
    try:
        from sqlalchemy import text
        from app.database import engine

        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        db_status["connected"] = True
    except Exception as e:
        db_status["error"] = str(e).split("\n")[0][:180]

    return {
        "ok": True,
        "service": "simpro-api",
        "ws_clients": len(manager.active_connections),
        "database": db_status,
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    global _alert_seq
    await manager.connect(websocket)
    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type")
            client_id = msg.get("client_id")

            if msg_type == "hello":
                await websocket.send_json({"type": "welcome", "client_id": client_id})

            elif msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "report_parada":
                alert_id = msg.get("id") or _alert_seq
                _alert_seq = max(_alert_seq, int(alert_id) + 1)
                sid = msg.get("sid")
                if sid:
                    _station_down[sid] = True
                    # Persistir parada en el simulador/sensor para que no se reactive sola
                    publish_stop(sid)
                await manager.broadcast(
                    {
                        "type": "parada",
                        "id": int(alert_id),
                        "sid": sid,
                        "estacion": msg.get("estacion"),
                        "causa": msg.get("causa"),
                        "hora": msg.get("hora"),
                        "client_id": client_id,
                    }
                )

            elif msg_type == "resolve_alert":
                sid = msg.get("sid") or msg.get("station_id")
                if sid:
                    # Permite re-emitir alerta si el sensor sigue en down
                    _station_down[sid] = False
                    publish_resolve(sid)
                await manager.broadcast(
                    {
                        "type": "resolve",
                        "alert_id": msg.get("alert_id"),
                        "sid": sid,
                        "client_id": client_id,
                    }
                )

            elif msg_type == "comando_resolucion":
                sid = msg.get("station_id") or msg.get("sid")
                if sid:
                    _station_down[sid] = False
                    publish_resolve(sid)
                await manager.broadcast(
                    {
                        "type": "resolve_sensor",
                        "station_id": sid,
                        "client_id": client_id,
                    }
                )

            else:
                # Reenviar mensajes desconocidos tipados (extensible)
                if msg_type:
                    await manager.broadcast(msg)

    except WebSocketDisconnect:
        manager.disconnect(websocket)
