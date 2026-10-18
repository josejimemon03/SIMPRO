export const CAUSAS = ["Falla de máquina", "Falta de material", "Cambio de referencia", "Otra causa"];
export const U_META = 150;

export function fmtTime(d) {
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function fmtHM(d) {
  return d.toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}

export function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

export function rint(a, b) {
  return Math.floor(Math.random() * (b - a + 1)) + a;
}

export function status(st) {
  if (st.down) return 'red';
  return st.ciclo > st.meta * 1.12 ? 'amber' : 'green';
}

export const LABEL = { green: 'En rango', amber: 'Atención', red: 'Parada' };

export function getInitialState() {
  const now = Date.now();
  const trend = [];
  const base = [46, 47, 45, 48, 47, 49, 48, 50, 49, 48, 47, 48];
  for (let i = 0; i < base.length; i++) {
    trend.push({ t: fmtTime(new Date(now - (base.length - 1 - i) * 3000)), v: base[i] });
  }
  return {
    role: 'entry',
    opStation: 'soldadura',
    modalOpen: false,
    range: 'turnos',
    stations: [
      { id: 'corte', name: 'Corte', meta: 45, ciclo: 42, oee: 88, units: 132, down: false, oeeBefore: 0 },
      { id: 'troquelado', name: 'Troquelado', meta: 55, ciclo: 53, oee: 81, units: 126, down: false, oeeBefore: 0 },
      { id: 'soldadura', name: 'Soldadura', meta: 55, ciclo: 63, oee: 74, units: 128, down: false, oeeBefore: 0 },
      { id: 'pintura', name: 'Pintura', meta: 40, ciclo: 38, oee: 90, units: 121, down: false, oeeBefore: 0 },
      { id: 'empaque', name: 'Empaque', meta: 32, ciclo: 30, oee: 85, units: 118, down: false, oeeBefore: 0 },
    ],
    alerts: [],
    resolved: [],
    causes: { "Falla de máquina": 9, "Falta de material": 6, "Cambio de referencia": 4, "Otra causa": 2 },
    trend,
    nextId: 1,
  };
}

/** Aplica una acción al estado del dashboard (pura, sin efectos secundarios de UI). */
export function reduceState(prev, action) {
  const draft = {
    ...prev,
    stations: prev.stations.map((s) => ({ ...s })),
    alerts: [...prev.alerts],
    resolved: [...prev.resolved],
    causes: { ...prev.causes },
    trend: [...prev.trend],
  };

  switch (action.type) {
    case 'SET_ROLE':
      draft.role = action.payload;
      draft.modalOpen = false;
      break;
    case 'RESET':
      return { ...getInitialState(), role: prev.role };
    case 'SET_OP_STATION':
      draft.opStation = action.payload;
      break;
    case 'OPEN_MODAL':
      draft.modalOpen = true;
      break;
    case 'CLOSE_MODAL':
      draft.modalOpen = false;
      break;
    case 'SET_RANGE':
      draft.range = action.payload;
      break;
    case 'PICK_CAUSE': {
      const st = draft.stations.find((s) => s.id === draft.opStation);
      if (st) {
        st.down = true;
        st.oeeBefore = st.oee;
        st.oee = Math.max(40, st.oee - 18);
        const alert = {
          id: draft.nextId++,
          estacion: st.name,
          sid: st.id,
          causa: action.payload,
          hora: action.hora || fmtHM(new Date()),
        };
        draft.alerts = [alert, ...draft.alerts];
        draft.causes = { ...draft.causes, [action.payload]: (draft.causes[action.payload] || 0) + 1 };
        draft._lastAlert = alert;
      }
      draft.modalOpen = false;
      break;
    }
    case 'APPLY_PARADA': {
      // Evento remoto desde WebSocket (otro cliente o eco del servidor)
      const { sid, causa, id, hora, estacion } = action.payload;
      const st = draft.stations.find((s) => s.id === sid);
      if (st && !st.down) {
        st.down = true;
        st.oeeBefore = st.oee;
        st.oee = Math.max(40, st.oee - 18);
        draft.causes = { ...draft.causes, [causa]: (draft.causes[causa] || 0) + 1 };
      }
      if (!draft.alerts.some((a) => a.id === id)) {
        draft.alerts = [{ id, estacion, sid, causa, hora }, ...draft.alerts];
        draft.nextId = Math.max(draft.nextId, id + 1);
      }
      break;
    }
    case 'RESOLVE_ALERT': {
      const idx = draft.alerts.findIndex((a) => a.id === action.payload);
      if (idx >= 0) {
        const a = draft.alerts[idx];
        draft.alerts = [...draft.alerts.slice(0, idx), ...draft.alerts.slice(idx + 1)];
        const st = draft.stations.find((s) => s.id === a.sid);
        if (st) {
          st.down = false;
          st.oee = Math.max(st.oeeBefore - 2, 60);
          st.ciclo = st.meta;
        }
        draft.resolved = [a, ...draft.resolved];
      }
      break;
    }
    case 'APPLY_TELEMETRY': {
      const p = action.payload || {};
      const station_id = p.station_id || p.linea_id || p.raw?.station_id;
      const toNum = (v, fallback) => {
        if (v === null || v === undefined || v === '') return fallback;
        const n = Number(v);
        return Number.isFinite(n) ? n : fallback;
      };
      const unitsRaw = p.units ?? p.contador ?? p.raw?.units ?? p.raw?.contador;
      draft.stations = draft.stations.map((s) => {
        if (s.id !== station_id) return s;
        return {
          ...s,
          ciclo: toNum(p.ciclo, s.ciclo),
          oee: toNum(p.oee, s.oee),
          units: toNum(unitsRaw, s.units),
          down: typeof p.down === 'boolean' ? p.down : s.down,
        };
      });
      const act = draft.stations.filter((s) => !s.down);
      const avg = act.length ? Math.round(act.reduce((a, s) => a + s.ciclo, 0) / act.length) : 0;
      draft.trend = [...draft.trend, { t: fmtTime(new Date()), v: avg }];
      if (draft.trend.length > 12) draft.trend.shift();
      break;
    }
    case 'SIMULATE_TICK': {
      if (draft.modalOpen) return draft;
      const newStations = draft.stations.map((s) => {
        if (s.down) return s;
        const newCiclo = clamp(Math.round(s.ciclo + rint(-2, 2)), Math.round(s.meta * 0.85), Math.round(s.meta * 1.3));
        let newOee = s.oee;
        if (Math.random() < 0.5) newOee = clamp(s.oee + rint(-1, 1), 62, 95);
        let newUnits = s.units;
        if (Math.random() < 0.6) newUnits = Math.min(U_META, s.units + 1);
        return { ...s, ciclo: newCiclo, oee: newOee, units: newUnits };
      });
      draft.stations = newStations;
      const act = newStations.filter((s) => !s.down);
      const avg = act.length ? Math.round(act.reduce((a, s) => a + s.ciclo, 0) / act.length) : 0;
      draft.trend = [...draft.trend, { t: fmtTime(new Date()), v: avg }];
      if (draft.trend.length > 12) draft.trend.shift();
      break;
    }
    default:
      break;
  }
  return draft;
}

export function averageOee(stations) {
  if (!stations.length) return 0;
  return Math.round(stations.reduce((a, s) => a + s.oee, 0) / stations.length);
}
