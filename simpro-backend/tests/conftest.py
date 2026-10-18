import pytest
from fastapi.testclient import TestClient

# Evitar que el lifespan intente conectar a MQTT real en tests
import app.mqtt as mqtt_mod


@pytest.fixture(autouse=True)
def _stub_mqtt(monkeypatch):
    monkeypatch.setattr(mqtt_mod, "start_mqtt", lambda: None)
    monkeypatch.setattr(mqtt_mod, "stop_mqtt", lambda: None)


@pytest.fixture
def client():
    from app.main import app, manager

    manager.active_connections.clear()
    with TestClient(app) as c:
        yield c
