"""Casos de prueba del API REST y WebSocket de SIMPRO."""


def test_root_status(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "SIMPRO" in r.json()["status"]


def test_sensor_sim_starts_stopped(client):
    r = client.get("/api/sensor-sim")
    assert r.status_code == 200
    assert r.json()["running"] is False


def test_sensor_sim_toggle(client, monkeypatch):
    class FakeProc:
        def __init__(self):
            self.pid = 4242

        def poll(self):
            return None

        def terminate(self):
            return None

        def kill(self):
            return None

        def wait(self, timeout=None):
            return 0

    import app.sensor_runner as runner

    monkeypatch.setattr(runner.subprocess, "Popen", lambda *a, **k: FakeProc())
    monkeypatch.setattr(runner, "_proc", None)

    start = client.post("/api/sensor-sim", json={"running": True})
    assert start.status_code == 200
    assert start.json()["running"] is True

    status = client.get("/api/sensor-sim")
    assert status.json()["running"] is True

    stop = client.post("/api/sensor-sim", json={"running": False})
    assert stop.status_code == 200
    assert stop.json()["running"] is False


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["service"] == "simpro-api"
    assert body["ws_clients"] == 0


def test_health_reports_database_connection(client, monkeypatch):
    from app.database import engine

    class FakeConnection:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return None

        def execute(self, _query):
            return None

    monkeypatch.setattr(engine, "connect", lambda: FakeConnection())
    response = client.get("/api/health")
    assert response.json()["database"] == {"connected": True, "error": None}

    def fail_connect():
        raise ConnectionError("database unavailable")

    monkeypatch.setattr(engine, "connect", fail_connect)
    response = client.get("/api/health")
    assert response.json()["database"] == {"connected": False, "error": "database unavailable"}


def test_ws_hello_welcome(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "hello", "client_id": "test-1"})
        msg = ws.receive_json()
        assert msg["type"] == "welcome"
        assert msg["client_id"] == "test-1"


def test_ws_ping_pong(client):
    with client.websocket_connect("/ws") as ws:
        ws.send_json({"type": "ping"})
        msg = ws.receive_json()
        assert msg["type"] == "pong"


def test_ws_report_parada_broadcast(client):
    """Dos clientes: operario reporta parada y supervisor la recibe."""
    with client.websocket_connect("/ws") as op, client.websocket_connect("/ws") as sup:
        op.send_json(
            {
                "type": "report_parada",
                "client_id": "operario",
                "id": 42,
                "sid": "soldadura",
                "estacion": "Soldadura",
                "causa": "Falta de material",
                "hora": "10:15",
            }
        )
        # Ambos reciben el broadcast
        for sock in (op, sup):
            msg = sock.receive_json()
            assert msg["type"] == "parada"
            assert msg["sid"] == "soldadura"
            assert msg["causa"] == "Falta de material"
            assert msg["id"] == 42


def test_ws_resolve_alert_broadcast(client):
    with client.websocket_connect("/ws") as a, client.websocket_connect("/ws") as b:
        a.send_json({"type": "resolve_alert", "alert_id": 7, "client_id": "sup"})
        for sock in (a, b):
            msg = sock.receive_json()
            assert msg["type"] == "resolve"
            assert msg["alert_id"] == 7


def test_health_counts_ws_clients(client):
    with client.websocket_connect("/ws"):
        r = client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["ws_clients"] >= 1
