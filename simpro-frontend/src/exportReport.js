/** Exportación de reporte consolidado para el gerente (CSV). */

function csvEscape(value) {
  const s = value == null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob(['\uFEFF' + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

/**
 * Genera y descarga un CSV con estaciones, paradas abiertas/resueltas y causas.
 * @param {object} state estado del dashboard
 * @param {number} oee OEE consolidado actual
 */
export function exportGerenteCsv(state, oee) {
  const now = new Date().toLocaleString('es-CO');
  const sections = [];

  sections.push(['SIMPRO — Reporte Gerente']);
  sections.push(['Generado', now]);
  sections.push(['Rango', state.range === 'semanas' ? 'Últimas semanas' : 'Últimos turnos']);
  sections.push(['OEE consolidado (%)', oee]);
  sections.push([]);

  sections.push(['=== Estaciones ===']);
  sections.push(['ID', 'Nombre', 'Ciclo (s)', 'Meta (s)', 'OEE (%)', 'Unidades', 'Estado']);
  for (const s of state.stations) {
    sections.push([
      s.id,
      s.name,
      s.ciclo,
      s.meta,
      s.oee,
      s.units,
      s.down ? 'Parada' : 'Operando',
    ]);
  }
  sections.push([]);

  sections.push(['=== Paradas abiertas ===']);
  sections.push(['ID', 'Estación', 'Causa', 'Hora']);
  if (state.alerts.length === 0) {
    sections.push(['(ninguna)', '', '', '']);
  } else {
    for (const a of state.alerts) {
      sections.push([a.id, a.estacion, a.causa, a.hora]);
    }
  }
  sections.push([]);

  sections.push(['=== Paradas resueltas ===']);
  sections.push(['ID', 'Estación', 'Causa', 'Hora']);
  if (state.resolved.length === 0) {
    sections.push(['(ninguna)', '', '', '']);
  } else {
    for (const a of state.resolved) {
      sections.push([a.id, a.estacion, a.causa, a.hora]);
    }
  }
  sections.push([]);

  sections.push(['=== Causas de parada (acumulado) ===']);
  sections.push(['Causa', 'Cantidad']);
  const causes = Object.entries(state.causes || {}).sort((a, b) => b[1] - a[1]);
  for (const [causa, n] of causes) {
    sections.push([causa, n]);
  }

  downloadText(`SIMPRO_reporte_gerente_${stamp()}.csv`, rowsToCsv(sections));
}
