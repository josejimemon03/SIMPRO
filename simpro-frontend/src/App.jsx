import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  CAUSAS, U_META, fmtTime, status, LABEL, getInitialState, reduceState, averageOee, clamp,
} from './stateLogic';
import { useSimproSocket } from './useSimproSocket';
import { exportGerenteCsv } from './exportReport';

const API_BASE = import.meta.env.VITE_API_URL || `${window.location.protocol}//${window.location.hostname}:8000`;

const IconHelmet = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 18a1 1 0 0 0 1 1h18a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1H3a1 1 0 0 0-1 1v2z"/><path d="M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5"/><path d="M4 15v-3a6 6 0 0 1 6-6"/><path d="M14 6a6 6 0 0 1 6 6v3"/>
  </svg>
);

const IconRadar = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6h.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/><path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18h.01"/><path d="M17.99 11.66A6 6 0 0 1 15.77 16.67"/><circle cx="12" cy="12" r="2"/><path d="m13.41 10.59 5.66-5.66"/>
  </svg>
);

const IconChart = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m19 9-5 5-4-4-3 3"/>
  </svg>
);

const Semaphore = ({ st, size }) => {
  const stt = status(st);
  return (
    <div className="sem" role="img" aria-label={`Semáforo de ${st.name}: ${LABEL[stt]}`} style={{ '--s': `${size}px` }}>
      <div className={`dot ${stt === 'red' ? 'on-red' : ''}`}></div>
      <div className={`dot ${stt === 'amber' ? 'on-amber' : ''}`}></div>
      <div className={`dot ${stt === 'green' ? 'on-green' : ''}`}></div>
    </div>
  );
};

const LineChart = ({ points }) => {
  const W = 560, H = 190, l = 36, r = 12, t = 12, b = 26;
  const vals = points.map(p => p.v);
  let mn = Math.floor(Math.min(...vals) - 3);
  let mx = Math.ceil(Math.max(...vals) + 3);
  if (mx - mn < 8) { mx = mn + 8; }
  const x = i => l + i * ((W - l - r) / (points.length - 1));
  const y = v => t + (H - t - b) * (1 - (v - mn) / (mx - mn));

  const grids = [];
  for (let i = 0; i <= 4; i++) {
    const gv = mn + (mx - mn) * i / 4;
    const gy = y(gv);
    grids.push(
      <g key={`grid-${i}`}>
        <line x1={l} x2={W - r} y1={gy} y2={gy} stroke="#C5D4E2" />
        <text x={l - 6} y={gy + 3} textAnchor="end">{Math.round(gv)}</text>
      </g>
    );
  }

  const pathD = points.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.v).toFixed(1)).join(' ');
  const areaD = `${pathD} L${x(points.length - 1)} ${H - b} L${x(0)} ${H - b} Z`;
  const last = points[points.length - 1];

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tendencia del tiempo de ciclo promedio">
      {grids}
      <path d={areaD} fill="rgba(127,177,219,.10)" />
      <path d={pathD} fill="none" stroke="#4B7DA5" strokeWidth="2" strokeLinejoin="round" />
      <circle cx={x(points.length - 1)} cy={y(last.v)} r="4" fill="#4B7DA5">
        <title>{last.v} seg</title>
      </circle>
      {[0, Math.floor(points.length / 2), points.length - 1].map((idx) => (
        <text key={`label-${idx}`} x={x(idx)} y={H - 8} textAnchor={idx === 0 ? 'start' : idx === points.length - 1 ? 'end' : 'middle'}>
          {points[idx]?.t}
        </text>
      ))}
    </svg>
  );
};

const BarChart = ({ data, target }) => {
  const W = 560, H = 230, l = 34, r = 10, t = 18, b = 26;
  const n = data.length, bw = (W - l - r) / n, pad = bw * 0.22;
  const y = v => t + (H - t - b) * (1 - v / 100);

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="OEE consolidado">
      {[0, 25, 50, 75, 100].map(v => (
        <g key={`y-${v}`}>
          <line x1={l} x2={W - r} y1={y(v)} y2={y(v)} stroke="#C5D4E2" />
          <text x={l - 6} y={y(v) + 3} textAnchor="end">{v}</text>
        </g>
      ))}
      {data.map((d, i) => {
        const bx = l + i * bw + pad, w = bw - pad * 2, by = y(d.v), h = (H - b) - by;
        const live = i === n - 1;
        return (
          <g key={`bar-${i}`}>
            <rect x={bx} y={by} width={w} height={h} fill={live ? '#B7C5D0' : '#4B7DA5'} rx="2">
              <title>{d.l}: {d.v}%</title>
            </rect>
            <text x={bx + w / 2} y={by - 5} textAnchor="middle" style={{ fill: '#1B2A38' }}>{d.v}</text>
            <text x={bx + w / 2} y={H - 8} textAnchor="middle">{d.l}</text>
          </g>
        );
      })}
      <line x1={l} x2={W - r} y1={y(target)} y2={y(target)} stroke="#E0A526" strokeDasharray="5 4" />
      <text x={W - r} y={y(target) - 4} textAnchor="end" style={{ fill: '#E0A526' }}>Meta {target}%</text>
    </svg>
  );
};

const HBars = ({ items, max, colorFn, suffix = '' }) => (
  <>
    {items.map((it, i) => {
      const pct = clamp(it.v / max * 100, 0, 100);
      return (
        <div className="row" key={`hbar-${i}`}>
          <div>{it.l}</div>
          <div className="track">
            <div className="fill" style={{ width: `${pct}%`, background: colorFn(it.v) }}></div>
          </div>
          <div className="val">{it.v}{suffix}</div>
        </div>
      );
    })}
  </>
);

const TopBar = ({ role, setRole, onReset, connected, simRunning, simBusy, onToggleSim }) => {
  const p = (r, lbl) => (
    <button className={`pill ${role === r ? 'active' : ''}`} onClick={() => setRole(r)}>{lbl}</button>
  );
  return (
    <div className="topbar">
      <div className="brand">
        <div className="brand-mark">S</div>
        <div className="brand-name">SIMPRO</div>
        <span className={`conn ${connected ? 'on' : 'off'}`} title={connected ? 'WebSocket conectado' : 'Reconectando…'}>
          {connected ? '● Backend' : '○ Sin backend'}
        </span>
      </div>
      <div className="pills" role="tablist">
        {p('operario', 'Operario')}
        {p('supervisor', 'Supervisor')}
        {p('gerente', 'Gerente')}
      </div>
      <div className="top-actions">
        <button
          className={`btn ${simRunning ? 'sim-on' : 'solid'}`}
          onClick={onToggleSim}
          disabled={simBusy}
          title={simRunning ? 'Detiene la telemetría simulada' : 'Arranca la telemetría de sensores'}
        >
          {simBusy ? 'Esperando…' : simRunning ? 'Detener sensores' : 'Activar simulación de sensores'}
        </button>
        <button className="btn ghost" onClick={onReset} title="Vuelve los datos al estado inicial">Reiniciar demo</button>
        <button className="btn" onClick={() => setRole('entry')}>← Inicio</button>
      </div>
    </div>
  );
};

const ViewEntry = ({ setRole, simRunning, simBusy, onToggleSim }) => {
  const card = (r, icon, title, desc) => (
    <button className="role-card" onClick={() => setRole(r)}>
      {icon}
      <h3>{title}</h3>
      <p>{desc}</p>
    </button>
  );

  return (
    <div className="entry">
      <div className="entry-tag">Metaloide S.A.S. — Línea de producción</div>
      <h1 className="entry-title">SIMPRO</h1>
      <p className="entry-sub">Sistema Inteligente de Monitoreo de Procesos. Elige un rol para ver el sistema desde su punto de vista.</p>
      <div className="entry-sim">
        <button
          className={`btn ${simRunning ? 'sim-on' : 'solid'}`}
          onClick={onToggleSim}
          disabled={simBusy}
        >
          {simBusy ? 'Esperando…' : simRunning ? 'Detener simulación de sensores' : 'Activar simulación de sensores'}
        </button>
        <p className="note">{simRunning ? 'Sensores en vivo: ciclo, OEE y unidades se actualizan.' : 'Los sensores están en pausa. Actívalos cuando quieras ver telemetría.'}</p>
      </div>
      <div className="role-cards">
        {card('operario', <IconHelmet />, 'Operario', 'Semáforo de su estación, meta del turno y reporte de paradas.')}
        {card('supervisor', <IconRadar />, 'Supervisor', 'Estado de toda la línea, OEE en vivo y alertas activas.')}
        {card('gerente', <IconChart />, 'Gerente', 'Desempeño consolidado, comparativos y causas de paradas.')}
      </div>
    </div>
  );
};

const ViewOperario = ({ state, dispatch, clock }) => {
  const st = state.stations.find(s => s.id === state.opStation);
  const stt = status(st);
  const pct = Math.round(st.units / U_META * 100);

  return (
    <div className="view">
      <div className="view-head">
        <div className="view-role">Vista: Operario</div>
        <div className="live">En vivo · <span>{clock}</span></div>
      </div>
      <div className="toolbar">
        <label htmlFor="opSel">Mi estación:</label>
        <select id="opSel" value={state.opStation} onChange={(e) => dispatch({ type: 'SET_OP_STATION', payload: e.target.value })}>
          {state.stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      
      {stt === 'red' && <div className="banner red">Parada reportada. El supervisor ya fue notificado y está atendiendo la estación.</div>}
      {stt === 'amber' && <div className="banner amber">El tiempo de ciclo está por encima de la meta ({st.meta} seg). Revisa tu estación.</div>}
      {stt === 'green' && <div className="banner green">Estación dentro de la meta. Sigue con el ritmo actual.</div>}

      <div className="grid g3">
        <div className="panel">
          <div className="eyebrow">Estado actual</div><div className="ptitle">{st.name}</div>
          <Semaphore st={st} size={120} />
          <div className={`stag c-${stt}`}>{LABEL[stt]}</div>
        </div>
        <div className="panel">
          <div className="eyebrow">Producción del turno</div><div className="ptitle">Unidades vs. meta</div>
          <div className="big">{st.units}<small> / {U_META}</small></div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%` }}></div></div>
          <div className="note">{pct}% de la meta del turno</div>
        </div>
        <div className="panel">
          <div className="eyebrow">Tiempo de ciclo</div><div className="ptitle">Estación actual</div>
          <div className="big">{st.down ? '—' : st.ciclo}<small> seg</small></div>
          <div className="note">Meta de referencia: {st.meta} seg</div>
        </div>
      </div>
      <div className="panel mt">
        <div className="eyebrow">Interacción mínima</div><div className="ptitle">Reportar una parada</div>
        <p className="note" style={{ margin: '0 0 14px' }}>Si tu estación se detiene, indica la causa con un solo toque. El supervisor recibe la alerta de inmediato.</p>
        <button className="btn solid" disabled={st.down} onClick={() => dispatch({ type: 'OPEN_MODAL' })}>
          {st.down ? 'Parada en atención' : 'Simular parada de estación'}
        </button>
      </div>
    </div>
  );
};

const ViewSupervisor = ({ state, dispatch, clock, oee }) => {
  return (
    <div className="view">
      <div className="view-head">
        <div className="view-role">Vista: Supervisor de línea</div>
        <div className="live">En vivo · <span>{clock}</span></div>
      </div>
      <div className="panel">
        <div className="eyebrow">Línea de producción</div><div className="ptitle">Estado por estación</div>
        <div className="grid g5">
          {state.stations.map(s => {
            const stt = status(s);
            return (
              <div key={s.id} className={`tile ${stt === 'red' ? 'red' : ''}`}>
                <Semaphore st={s} size={58} />
                <div className="nm">{s.name}</div>
                <div className="sub">OEE {s.oee}%</div>
                <div className={`stag c-${stt}`}>{LABEL[stt]}</div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="grid g2 mt">
        <div className="panel">
          <div className="eyebrow">Indicador principal</div><div className="ptitle">OEE de la línea</div>
          <div className="big">{oee}<small>%</small></div><div className="note">Promedio de las {state.stations.length} estaciones · meta 85%</div>
          <div style={{ marginTop: '14px' }}><LineChart points={state.trend} /></div>
          <div className="note">Tiempo de ciclo promedio de la línea (seg)</div>
        </div>
        <div className="panel">
          <div className="eyebrow">{state.alerts.length} activa{state.alerts.length === 1 ? '' : 's'}</div>
          <div className="ptitle">Alertas de la línea</div>
          {state.alerts.length === 0 ? (
            <div className="empty">No hay alertas activas. Aparecerán aquí cuando un operario reporte una parada o el sistema detecte una falla en una estación.</div>
          ) : (
            state.alerts.map(a => (
              <div className="alert" key={a.id}>
                <div>
                  <div>{a.estacion} — {a.causa}</div>
                  <div className="meta">Reportado {a.hora}</div>
                </div>
                <button className="btn" onClick={() => dispatch({ type: 'RESOLVE_ALERT', payload: a.id })}>Marcar como resuelta</button>
              </div>
            ))
          )}
          {state.resolved.length > 0 && (
            <div style={{ marginTop: '14px', borderTop: '1px solid var(--line)', paddingTop: '10px' }}>
              <div className="eyebrow">Resueltas recientemente</div>
              {state.resolved.slice(0, 3).map(a => (
                <div className="resolved" key={`res-${a.id}`}><b>✓</b> {a.estacion} — {a.causa} ({a.hora})</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const ViewGerente = ({ state, dispatch, clock, oee }) => {
  const paradas = 46 + state.resolved.length * 8;
  const atendidas = 18 + state.resolved.length;
  const data = state.range === 'turnos'
    ? [{ l: 'T-6', v: 71 }, { l: 'T-5', v: 74 }, { l: 'T-4', v: 69 }, { l: 'T-3', v: 78 }, { l: 'T-2', v: 80 }, { l: 'T-1', v: 76 }, { l: 'Hoy', v: oee }]
    : [{ l: 'S-7', v: 72 }, { l: 'S-6', v: 73 }, { l: 'S-5', v: 75 }, { l: 'S-4', v: 74 }, { l: 'S-3', v: 77 }, { l: 'S-2', v: 79 }, { l: 'S-1', v: 81 }, { l: 'Actual', v: oee }];
  
  const pareto = Object.keys(state.causes).map(k => ({ l: k, v: state.causes[k] })).sort((a, b) => b.v - a.v);
  const totalCauses = pareto.reduce((a, c) => a + c.v, 0);

  return (
    <div className="view">
      <div className="view-head">
        <div className="view-role">Vista: Gerente de planta</div>
        <div className="top-actions">
          <button
            type="button"
            className="btn solid"
            onClick={() => exportGerenteCsv(state, oee)}
            title="Descargar CSV con estaciones, paradas y causas"
          >
            Exportar CSV
          </button>
          <div className="live">Consolidado · actualizado <span>{clock}</span></div>
        </div>
      </div>
      <div className="grid g4">
        <div className="panel kpi"><div className="lbl">Productividad (OEE actual)</div><div className="v">{oee}%</div><div className="d">Meta: 85%</div></div>
        <div className="panel kpi"><div className="lbl">Tiempo total de paradas</div><div className="v">{paradas} min</div><div className="d">Acumulado del período</div></div>
        <div className="panel kpi"><div className="lbl">Tasa de no conformidad</div><div className="v">3.1%</div><div className="d">Producto rechazado</div></div>
        <div className="panel kpi"><div className="lbl">Alertas atendidas</div><div className="v">{atendidas}</div><div className="d">Paradas resueltas</div></div>
      </div>
      <div className="panel mt">
        <div className="eyebrow">Histórico</div><div className="ptitle">OEE consolidado</div>
        <div className="seg" role="group" aria-label="Rango">
          <button className={state.range === 'turnos' ? 'on' : ''} onClick={() => dispatch({ type: 'SET_RANGE', payload: 'turnos' })}>Últimos turnos</button>
          <button className={state.range === 'semanas' ? 'on' : ''} onClick={() => dispatch({ type: 'SET_RANGE', payload: 'semanas' })}>Últimas semanas</button>
        </div>
        <BarChart data={data} target={85} />
      </div>
      <div className="grid g2 mt">
        <div className="panel">
          <div className="eyebrow">Comparativo</div><div className="ptitle">OEE por estación</div>
          <HBars items={state.stations.map(s => ({ l: s.name, v: s.oee }))} max={100} colorFn={v => v >= 85 ? '#2FB86E' : v >= 75 ? '#4A7FA6' : '#E0A526'} suffix="%" />
        </div>
        <div className="panel">
          <div className="eyebrow">Causas de parada ({totalCauses} registros)</div><div className="ptitle">Qué detiene la línea</div>
          <HBars items={pareto} max={Math.max(...pareto.map(p => p.v))} colorFn={() => '#E0A526'} />
          <div className="note">Las causas reportadas por los operarios se acumulan aquí automáticamente.</div>
        </div>
      </div>
    </div>
  );
};

const Modal = ({ state, dispatch }) => {
  if (!state.modalOpen) return null;
  const st = state.stations.find(s => s.id === state.opStation);

  return (
    <div className="backdrop" onClick={(e) => { if (e.target === e.currentTarget) dispatch({ type: 'CLOSE_MODAL' }); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="mt">
        <button className="x" onClick={() => dispatch({ type: 'CLOSE_MODAL' })} aria-label="Cerrar">×</button>
        <h4 id="mt">¿Cuál fue la causa?</h4>
        <div className="sub">Estación: {st?.name}</div>
        {CAUSAS.map(c => (
          <button key={c} className="causa" onClick={() => dispatch({ type: 'PICK_CAUSE', payload: c })}>{c}</button>
        ))}
      </div>
    </div>
  );
};

const globalCSS = `
  :root{
    --bg:#DFECF6; --surface:#FFFFFF; --surface2:#E8EDF0; --line:#C8D2D9;
    --steel:#4B7DA5; --steel-bright:#344F70;
    --ok:#1E9A58; --warn:#C48A12; --bad:#D03A40;
    --text:#1B2A38; --muted:#5B7388;
    --display:'Oswald','Roboto Condensed','Arial Narrow','Helvetica Neue Condensed',sans-serif;
    --body:'Inter','Segoe UI',-apple-system,system-ui,Roboto,sans-serif;
    --mono:'IBM Plex Mono','SF Mono',Consolas,Menlo,'Courier New',monospace;
  }
  *{box-sizing:border-box;margin:0;padding:0;}
  html,body{background:var(--bg);color:var(--text);font-family:var(--body);min-height:100%;}
  button{font-family:inherit;color:inherit;}
  :focus-visible{outline:2px solid var(--steel-bright);outline-offset:2px;}

  /* ---------- Top bar ---------- */
  .topbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:12px 22px;background:var(--surface);border-bottom:1px solid var(--line);}
  .brand{display:flex;align-items:center;gap:10px;}
  .brand-mark{width:30px;height:30px;border:2px solid var(--steel-bright);display:flex;align-items:center;justify-content:center;color:var(--steel-bright);font-family:var(--display);font-weight:700;}
  .brand-name{font-family:var(--display);font-weight:600;font-size:18px;letter-spacing:1px;}
  .conn{font-family:var(--mono);font-size:11px;margin-left:10px;letter-spacing:.3px;}
  .conn.on{color:var(--ok);} .conn.off{color:var(--warn);}
  .pills{display:flex;gap:4px;background:var(--surface2);padding:4px;border-radius:6px;}
  .pill{padding:7px 14px;border-radius:4px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer;border:none;background:transparent;}
  .pill:hover{color:var(--text);}
  .pill.active{background:var(--steel);color:#fff;}
  .top-actions{display:flex;gap:8px;align-items:center;}
  .btn{font-weight:600;font-size:13px;padding:8px 14px;border-radius:4px;cursor:pointer;border:1px solid var(--steel);background:transparent;color:var(--steel-bright);}
  .btn:hover{background:rgba(75,125,165,.14);}
  .btn.solid{background:var(--steel);color:#fff;}
  .btn.solid:hover{background:var(--steel-bright);color:#fff;}
  .btn.ghost{border-color:var(--line);color:var(--muted);}
  .btn.sim-on{background:var(--ok);border-color:var(--ok);color:#fff;}
  .btn.sim-on:hover{background:#177a46;color:#fff;}
  .btn[disabled]{opacity:.5;cursor:not-allowed;}

  /* ---------- Entry ---------- */
  .entry{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px 20px;text-align:center;}
  .entry-tag{font-family:var(--mono);font-size:12px;letter-spacing:2px;color:var(--steel-bright);text-transform:uppercase;margin-bottom:14px;}
  .entry-title{font-family:var(--display);font-size:clamp(44px,8vw,72px);font-weight:700;letter-spacing:2px;line-height:1;margin-bottom:12px;}
  .entry-sub{color:var(--muted);max-width:500px;font-size:15px;line-height:1.55;margin-bottom:22px;}
  .entry-sim{display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:32px;}
  .entry-sim .note{margin:0;max-width:420px;}
  .role-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;}
  .role-card{width:230px;background:var(--surface);border:1px solid var(--line);padding:24px 20px;cursor:pointer;text-align:left;transition:border-color .15s,transform .15s;}
  .role-card:hover{border-color:var(--steel);transform:translateY(-2px);}
  .role-card svg{color:var(--steel-bright);margin-bottom:14px;}
  .role-card h3{font-family:var(--display);font-size:17px;font-weight:600;letter-spacing:.4px;margin-bottom:6px;}
  .role-card p{font-size:12.5px;color:var(--muted);line-height:1.5;}
  .entry-hint{margin-top:34px;font-size:12.5px;color:var(--muted);max-width:460px;line-height:1.55;border-top:1px solid var(--line);padding-top:16px;}
  .entry-hint b{color:var(--steel-bright);font-weight:600;}

  /* ---------- Views ---------- */
  .view{max-width:1120px;margin:0 auto;padding:24px 26px 60px;}
  .view-head{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:20px;}
  .view-role{font-family:var(--display);font-size:24px;font-weight:600;letter-spacing:.3px;}
  .live{font-family:var(--mono);font-size:11px;color:var(--muted);display:flex;align-items:center;gap:8px;}
  .live::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--ok);box-shadow:0 0 8px var(--ok);}
  .grid{display:grid;gap:16px;}
  .g2{grid-template-columns:1fr 1fr;}
  .g3{grid-template-columns:repeat(3,1fr);}
  .g4{grid-template-columns:repeat(4,1fr);}
  .g5{grid-template-columns:repeat(5,1fr);gap:12px;}
  .mt{margin-top:16px;}
  @media (max-width:860px){.g2,.g3,.g4{grid-template-columns:1fr 1fr;}.g5{grid-template-columns:repeat(3,1fr);}}
  @media (max-width:560px){.g2,.g3,.g4{grid-template-columns:1fr;}.g5{grid-template-columns:repeat(2,1fr);}.view{padding:18px 14px 50px;}}

  .panel{position:relative;background:var(--surface);border:1px solid var(--line);padding:18px 20px;}
  .panel::before,.panel::after{content:"";position:absolute;width:10px;height:10px;opacity:.75;}
  .panel::before{top:7px;left:7px;border-top:2px solid var(--steel);border-left:2px solid var(--steel);}
  .panel::after{bottom:7px;right:7px;border-bottom:2px solid var(--steel);border-right:2px solid var(--steel);}
  .eyebrow{font-family:var(--mono);font-size:10.5px;letter-spacing:1.4px;color:var(--steel-bright);text-transform:uppercase;margin-bottom:4px;}
  .ptitle{font-family:var(--display);font-size:17px;font-weight:600;letter-spacing:.3px;margin-bottom:14px;}
  .big{font-family:var(--mono);font-size:44px;font-weight:600;line-height:1.05;}
  .big small{font-size:17px;color:var(--muted);font-weight:500;}
  .note{font-size:12px;color:var(--muted);margin-top:6px;line-height:1.5;}
  .bar-track{background:var(--surface2);height:10px;border-radius:5px;overflow:hidden;margin-top:10px;}
  .bar-fill{height:100%;background:var(--steel);transition:width .6s ease;}

  /* semaphore */
  .sem{display:flex;flex-direction:column;justify-content:space-between;align-items:center;background:#050B12;border-radius:999px;margin:0 auto;padding:calc(var(--s)*.09) 0;width:calc(var(--s)*.46);height:var(--s);}
  .dot{width:calc(var(--s)*.3);height:calc(var(--s)*.3);border-radius:50%;background:rgba(255,255,255,.06);transition:background .3s,box-shadow .3s;}
  .dot.on-red{background:var(--bad);box-shadow:0 0 calc(var(--s)*.22) var(--bad);}
  .dot.on-amber{background:var(--warn);box-shadow:0 0 calc(var(--s)*.22) var(--warn);}
  .dot.on-green{background:var(--ok);box-shadow:0 0 calc(var(--s)*.22) var(--ok);}
  .stag{font-family:var(--mono);font-size:10.5px;text-transform:uppercase;letter-spacing:.6px;margin-top:8px;text-align:center;}
  .c-green{color:var(--ok);} .c-amber{color:var(--warn);} .c-red{color:var(--bad);}

  .tile{background:var(--surface2);border:1px solid var(--line);padding:14px 8px 12px;text-align:center;}
  .tile.red{border-color:var(--bad);}
  .tile .nm{font-size:13px;font-weight:600;margin-top:10px;}
  .tile .sub{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:3px;}

  .banner{padding:10px 14px;font-size:13px;margin-bottom:14px;border-left:3px solid var(--steel);background:var(--surface2);line-height:1.5;}
  .banner.amber{border-color:var(--warn);} .banner.red{border-color:var(--bad);} .banner.green{border-color:var(--ok);}

  select{background:var(--surface2);color:var(--text);border:1px solid var(--line);padding:7px 10px;border-radius:4px;font-size:13px;font-family:inherit;}
  .toolbar{display:flex;align-items:center;gap:8px;margin-bottom:16px;font-size:12.5px;color:var(--muted);}

  .alert{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 0;border-bottom:1px solid var(--line);font-size:13.5px;}
  .alert:last-child{border-bottom:none;}
  .alert .meta{font-family:var(--mono);font-size:11px;color:var(--muted);margin-top:3px;}
  .empty{color:var(--muted);font-size:13px;padding:8px 0;line-height:1.5;}
  .resolved{font-size:12.5px;color:var(--muted);padding:6px 0;font-family:var(--mono);}
  .resolved b{color:var(--ok);font-weight:600;}

  /* HTML bar rows */
  .row{display:grid;grid-template-columns:110px 1fr 46px;align-items:center;gap:10px;margin-bottom:9px;font-size:13px;}
  .row .track{background:var(--surface2);height:14px;border-radius:2px;overflow:hidden;}
  .row .fill{height:100%;transition:width .6s ease;}
  .row .val{font-family:var(--mono);font-size:12px;color:var(--muted);text-align:right;}

  .kpi .lbl{font-size:12px;color:var(--muted);margin-bottom:6px;}
  .kpi .v{font-family:var(--mono);font-size:30px;font-weight:600;}
  .kpi .d{font-size:11.5px;color:var(--muted);margin-top:4px;}

  .seg{display:inline-flex;background:var(--surface2);border-radius:5px;padding:3px;gap:3px;margin-bottom:10px;}
  .seg button{background:transparent;border:none;padding:5px 12px;font-size:12px;font-weight:600;color:var(--muted);border-radius:3px;cursor:pointer;}
  .seg button.on{background:var(--steel);color:#fff;}

  svg.chart{width:100%;height:auto;display:block;}
  svg.chart text{font-family:var(--mono);fill:#8FA3B5;font-size:10px;}

  /* modal */
  .backdrop{position:fixed;inset:0;background:rgba(27,42,56,.45);display:flex;align-items:center;justify-content:center;padding:20px;z-index:50;}
  .modal{background:var(--surface);border:1px solid var(--steel);width:100%;max-width:390px;padding:22px;position:relative;}
  .modal h4{font-family:var(--display);font-size:18px;font-weight:600;margin-bottom:4px;}
  .modal .sub{font-size:12.5px;color:var(--muted);margin-bottom:16px;}
  .x{position:absolute;top:10px;right:12px;background:none;border:none;color:var(--muted);font-size:22px;cursor:pointer;line-height:1;}
  .causa{display:block;width:100%;text-align:left;padding:12px;background:var(--surface2);border:1px solid var(--line);margin-bottom:8px;cursor:pointer;font-size:14px;}
  .causa:hover{border-color:var(--steel);}

  @media (prefers-reduced-motion:reduce){*{transition:none !important;}}
`;

export default function App() {
  const [state, setState] = useState(getInitialState());
  const [clock, setClock] = useState(fmtTime(new Date()));
  const [simRunning, setSimRunning] = useState(false);
  const [simBusy, setSimBusy] = useState(false);
  const clientIdRef = useRef(null);
  const lastTelemetryAt = useRef(0);

  const dispatch = useCallback((action) => {
    if (action.type === 'SET_ROLE') window.scrollTo(0, 0);
    setState((prev) => reduceState(prev, action));
  }, []);

  const onSocketEvent = useCallback((msg) => {
    if (!msg || !msg.type) return;
    // Ignorar eco propio de parada/resolve (ya aplicado en local)
    if (msg.client_id && clientIdRef.current && msg.client_id === clientIdRef.current) {
      if (msg.type === 'parada' || msg.type === 'resolve') return;
    }
    if (msg.type === 'parada') {
      dispatch({ type: 'APPLY_PARADA', payload: msg });
    } else if (msg.type === 'resolve') {
      dispatch({ type: 'RESOLVE_ALERT', payload: msg.alert_id });
    } else if (msg.type === 'telemetry') {
      lastTelemetryAt.current = Date.now();
      dispatch({ type: 'APPLY_TELEMETRY', payload: msg });
    }
  }, [dispatch]);

  const { connected, send, resolverParada, clientId } = useSimproSocket(onSocketEvent);
  clientIdRef.current = clientId;

  const dispatchAndSync = useCallback((action) => {
    if (action.type === 'PICK_CAUSE') {
      setState((prev) => {
        const next = reduceState(prev, action);
        const alert = next._lastAlert;
        if (alert) {
          send({
            type: 'report_parada',
            sid: alert.sid,
            estacion: alert.estacion,
            causa: alert.causa,
            hora: alert.hora,
            id: alert.id,
          });
        }
        const { _lastAlert, ...clean } = next;
        return clean;
      });
      return;
    }
    if (action.type === 'RESOLVE_ALERT') {
      setState((prev) => {
        const alert = prev.alerts.find((a) => a.id === action.payload);
        const sid = alert?.sid;
        send({ type: 'resolve_alert', alert_id: action.payload, sid });
        if (sid) resolverParada(sid);
        return reduceState(prev, action);
      });
      return;
    }
    dispatch(action);
  }, [dispatch, send, resolverParada]);

  useEffect(() => {
    const timer = setInterval(() => setClock(fmtTime(new Date())), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/sensor-sim`)
      .then((r) => r.json())
      .then((body) => {
        if (!cancelled && typeof body.running === 'boolean') setSimRunning(body.running);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const toggleSim = useCallback(async () => {
    const next = !simRunning;
    setSimBusy(true);
    try {
      const r = await fetch(`${API_BASE}/api/sensor-sim`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ running: next }),
      });
      if (r.ok) {
        const body = await r.json();
        setSimRunning(Boolean(body.running));
      } else {
        setSimRunning(next);
      }
    } catch {
      // Sin backend: simulación local de respaldo
      setSimRunning(next);
    } finally {
      setSimBusy(false);
    }
  }, [simRunning]);

  useEffect(() => {
    if (!simRunning) return undefined;
    // Simulación local si no hay MQTT, o si el WS está up pero no llega telemetría
    const simTimer = setInterval(() => {
      const stale = Date.now() - lastTelemetryAt.current > 4000;
      if (!connected || stale) dispatch({ type: 'SIMULATE_TICK' });
    }, 3000);
    return () => clearInterval(simTimer);
  }, [dispatch, connected, simRunning]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && state.modalOpen) dispatch({ type: 'CLOSE_MODAL' });
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.modalOpen, dispatch]);

  const oee = useMemo(() => averageOee(state.stations), [state.stations]);

  return (
    <>
      <style>{globalCSS}</style>
      <div id="app">
        {state.role === 'entry' ? (
          <ViewEntry
            setRole={(r) => dispatch({ type: 'SET_ROLE', payload: r })}
            simRunning={simRunning}
            simBusy={simBusy}
            onToggleSim={toggleSim}
          />
        ) : (
          <>
            <TopBar
              role={state.role}
              setRole={(r) => dispatch({ type: 'SET_ROLE', payload: r })}
              onReset={() => dispatch({ type: 'RESET' })}
              connected={connected}
              simRunning={simRunning}
              simBusy={simBusy}
              onToggleSim={toggleSim}
            />
            {state.role === 'operario' && <ViewOperario state={state} dispatch={dispatchAndSync} clock={clock} />}
            {state.role === 'supervisor' && <ViewSupervisor state={state} dispatch={dispatchAndSync} clock={clock} oee={oee} />}
            {state.role === 'gerente' && <ViewGerente state={state} dispatch={dispatch} clock={clock} oee={oee} />}
          </>
        )}
        <Modal state={state} dispatch={dispatchAndSync} />
      </div>
    </>
  );
}