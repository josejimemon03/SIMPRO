"""Casos de prueba del API REST y WebSocket de SIMPRO."""


def test_root_status(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "SIMPRO" in r.json()["status"]


def test_health_ok(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["service"] == "simpro-api"
    assert body["ws_clients"] == 0


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
