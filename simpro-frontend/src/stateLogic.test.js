import { describe, it, expect } from 'vitest';
import {
  status,
  reduceState,
  getInitialState,
  averageOee,
  clamp,
  CAUSAS,
} from './stateLogic';

describe('status (semáforo)', () => {
  it('rojo si la estación está en parada', () => {
    expect(status({ down: true, ciclo: 40, meta: 50 })).toBe('red');
  });

  it('verde si ciclo dentro de meta', () => {
    expect(status({ down: false, ciclo: 50, meta: 50 })).toBe('green');
  });

  it('ámbar si ciclo supera meta * 1.12', () => {
    expect(status({ down: false, ciclo: 60, meta: 50 })).toBe('amber');
  });
});

describe('clamp', () => {
  it('limita valores al rango', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});

describe('reduceState — paradas y alertas', () => {
  it('PICK_CAUSE marca estación down y crea alerta', () => {
    const prev = getInitialState();
    prev.opStation = 'soldadura';
    const next = reduceState(prev, { type: 'PICK_CAUSE', payload: CAUSAS[0], hora: '12:00' });
    const st = next.stations.find((s) => s.id === 'soldadura');
    expect(st.down).toBe(true);
    expect(next.alerts).toHaveLength(1);
    expect(next.alerts[0].causa).toBe(CAUSAS[0]);
    expect(next.alerts[0].sid).toBe('soldadura');
    expect(next.causes[CAUSAS[0]]).toBe(10); // 9 base + 1
  });

  it('RESOLVE_ALERT limpia parada y mueve a resolved', () => {
    let state = getInitialState();
    state.opStation = 'corte';
    state = reduceState(state, { type: 'PICK_CAUSE', payload: 'Otra causa', hora: '09:00' });
    const alertId = state.alerts[0].id;
    state = reduceState(state, { type: 'RESOLVE_ALERT', payload: alertId });
    expect(state.alerts).toHaveLength(0);
    expect(state.resolved).toHaveLength(1);
    expect(state.stations.find((s) => s.id === 'corte').down).toBe(false);
  });

  it('APPLY_PARADA sincroniza evento remoto sin duplicar', () => {
    let state = getInitialState();
    const payload = {
      id: 99,
      sid: 'pintura',
      estacion: 'Pintura',
      causa: 'Falta de material',
      hora: '11:00',
    };
    state = reduceState(state, { type: 'APPLY_PARADA', payload });
    state = reduceState(state, { type: 'APPLY_PARADA', payload });
    expect(state.alerts).toHaveLength(1);
    expect(state.stations.find((s) => s.id === 'pintura').down).toBe(true);
  });

  it('APPLY_TELEMETRY actualiza métricas de estación', () => {
    let state = getInitialState();
    state = reduceState(state, {
      type: 'APPLY_TELEMETRY',
      payload: { station_id: 'empaque', ciclo: 28, oee: 92, units: 140 },
    });
    const st = state.stations.find((s) => s.id === 'empaque');
    expect(st.ciclo).toBe(28);
    expect(st.oee).toBe(92);
    expect(st.units).toBe(140);
    expect(state.trend.length).toBeGreaterThanOrEqual(12);
  });

  it('APPLY_TELEMETRY acepta units como string y contador', () => {
    let state = getInitialState();
    state = reduceState(state, {
      type: 'APPLY_TELEMETRY',
      payload: { station_id: 'corte', units: '145' },
    });
    expect(state.stations.find((s) => s.id === 'corte').units).toBe(145);

    state = reduceState(state, {
      type: 'APPLY_TELEMETRY',
      payload: { station_id: 'corte', contador: 146 },
    });
    expect(state.stations.find((s) => s.id === 'corte').units).toBe(146);
  });

  it('APPLY_TELEMETRY no para estación sin alerta de operario', () => {
    let state = getInitialState();
    state = reduceState(state, {
      type: 'APPLY_TELEMETRY',
      payload: { station_id: 'soldadura', down: true, ciclo: 0, oee: 50 },
    });
    expect(state.stations.find((s) => s.id === 'soldadura').down).toBe(false);
  });

  it('APPLY_TELEMETRY no reactiva estación con alerta abierta', () => {
    let state = getInitialState();
    state.opStation = 'soldadura';
    state = reduceState(state, { type: 'PICK_CAUSE', payload: 'Falla de máquina', hora: '10:00' });
    expect(state.stations.find((s) => s.id === 'soldadura').down).toBe(true);

    state = reduceState(state, {
      type: 'APPLY_TELEMETRY',
      payload: { station_id: 'soldadura', down: false, ciclo: 55, oee: 80, units: 130 },
    });
    const st = state.stations.find((s) => s.id === 'soldadura');
    expect(st.down).toBe(true);
    expect(st.ciclo).toBe(0);
  });

  it('APPLY_TELEMETRY congela OEE y unidades mientras la estación está parada', () => {
    let state = getInitialState();
    state.opStation = 'soldadura';
    state = reduceState(state, { type: 'PICK_CAUSE', payload: 'Falla de máquina', hora: '10:00' });
    const frozen = state.stations.find((s) => s.id === 'soldadura');
    const oeeAtStop = frozen.oee;
    const unitsAtStop = frozen.units;
    const trendLen = state.trend.length;

    state = reduceState(state, {
      type: 'APPLY_TELEMETRY',
      payload: { station_id: 'soldadura', down: false, ciclo: 99, oee: 95, units: 999 },
    });
    const st = state.stations.find((s) => s.id === 'soldadura');
    expect(st.down).toBe(true);
    expect(st.ciclo).toBe(0);
    expect(st.oee).toBe(oeeAtStop);
    expect(st.units).toBe(unitsAtStop);
    expect(state.trend.length).toBe(trendLen);
  });

  it('APPLY_PARADA remota mantiene estación parada hasta resolve', () => {
    let state = getInitialState();
    state = reduceState(state, {
      type: 'APPLY_PARADA',
      payload: {
        id: 50,
        sid: 'troquelado',
        estacion: 'Troquelado',
        causa: 'Falta de material',
        hora: '08:30',
      },
    });
    expect(state.alerts).toHaveLength(1);
    expect(state.stations.find((s) => s.id === 'troquelado').down).toBe(true);
    state = reduceState(state, { type: 'RESOLVE_ALERT', payload: 50 });
    expect(state.alerts).toHaveLength(0);
    expect(state.stations.find((s) => s.id === 'troquelado').down).toBe(false);
  });
});

describe('averageOee', () => {
  it('promedia OEE de estaciones', () => {
    expect(averageOee([{ oee: 80 }, { oee: 90 }])).toBe(85);
  });

  it('retorna 0 si no hay estaciones', () => {
    expect(averageOee([])).toBe(0);
  });
});
