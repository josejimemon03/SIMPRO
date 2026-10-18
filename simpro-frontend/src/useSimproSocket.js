import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.hostname}:8000/ws`;

/**
- Conecta al WebSocket del backend SIMPRO.
- Reenvía eventos tipados al callback onEvent.
 */
export function useSimproSocket(onEvent) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const clientIdRef = useRef(`client-${Math.random().toString(36).slice(2, 9)}`);
  
  const estacionesParadasRef = useRef(new Set());

  // NUEVO: Solicitar permisos para notificaciones nativas del sistema operativo al cargar
  useEffect(() => {
    if ("Notification" in window && Notification.permission !== "granted") {
      Notification.requestPermission();
    }
  }, []);

  useEffect(() => {
    let closed = false;
    let retryTimer;
    let ws;

    const connect = () => {
      if (closed) return;
      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        ws.send(JSON.stringify({ type: 'hello', client_id: clientIdRef.current }));
      };

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);

          // Notificación al supervisor cuando el sistema detecta parada (telemetría)
          if (msg.type === 'telemetry' && msg.down !== undefined && msg.station_id) {
            const stationName = msg.name || msg.raw?.name || msg.station_id;
            if (msg.down === true) {
              if (!estacionesParadasRef.current.has(msg.station_id)) {
                estacionesParadasRef.current.add(msg.station_id);
                if ("Notification" in window && Notification.permission === "granted") {
                  new Notification(`¡Parada en Línea!`, {
                    body: `La estación ${stationName} requiere atención inmediata.`,
                  });
                } else {
                  alert(`¡ALERTA PARA EL ENCARGADO!\nLa estación "${stationName}" se ha detenido.`);
                }
              }
            } else {
              estacionesParadasRef.current.delete(msg.station_id);
            }
          }
          // También limpiar tracking cuando llega resolve de sensor
          if (msg.type === 'resolve_sensor' && msg.station_id) {
            estacionesParadasRef.current.delete(msg.station_id);
          }

          onEventRef.current?.(msg);
        } catch {
          /* ignore non-json */
        }
      };

      ws.onclose = () => {
        setConnected(false);
        wsRef.current = null;
        if (!closed) retryTimer = setTimeout(connect, 2000);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      closed = true;
      clearTimeout(retryTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const send = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ ...payload, client_id: clientIdRef.current }));
      return true;
    }
    return false;
  }, []);

  // NUEVO: Función para que los botones "Marcar como resuelta" destraben el backend
  const resolverParada = useCallback((stationId) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'comando_resolucion', 
        station_id: stationId,
        client_id: clientIdRef.current
      }));
      // Liberamos la alerta en el frontend preventivamente
      estacionesParadasRef.current.delete(stationId);
    }
  }, []);

  // Retornamos la nueva función para usarla en los componentes
  return { connected, send, resolverParada, clientId: clientIdRef.current };
}