"""Arranque bajo demanda del simulador MQTT de sensores."""

from __future__ import annotations

import os
import subprocess
import sys
import threading
from typing import Optional

_proc: Optional[subprocess.Popen] = None
_lock = threading.Lock()


def is_running() -> bool:
    with _lock:
        return _proc is not None and _proc.poll() is None


def start() -> dict:
    """Inicia el simulador si no está corriendo."""
    global _proc
    with _lock:
        if _proc is not None and _proc.poll() is None:
            return {"running": True, "started": False}

        root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        script = os.path.join(root, "scripts", "simulate_sensors.py")
        broker = os.getenv("MQTT_BROKER", "127.0.0.1")
        port = str(os.getenv("MQTT_PORT", "1883"))
        _proc = subprocess.Popen(
            [sys.executable, script, "--broker", broker, "--port", port, "--quiet"],
            cwd=root,
        )
        return {"running": True, "started": True, "pid": _proc.pid}


def stop() -> dict:
    """Detiene el simulador si está corriendo."""
    global _proc
    with _lock:
        if _proc is None:
            return {"running": False, "stopped": False}
        if _proc.poll() is None:
            _proc.terminate()
            try:
                _proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                _proc.kill()
                _proc.wait(timeout=3)
        _proc = None
        return {"running": False, "stopped": True}


def status() -> dict:
    return {"running": is_running()}
