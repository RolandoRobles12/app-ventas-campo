import { useEffect, useMemo, useState } from 'react';
import { api, type CitaProxima, type Llamada } from '../api';
import { useFilters } from '../filters';
import { etiquetaDia } from '../lib/dateRanges';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { MultiSelectDropdown } from '../components/MultiSelectDropdown';
import { HistorialNegocio } from '../components/HistorialNegocio';
import { Aviso, Card, StatTile, boton } from '../components/ui';
import { ETIQUETA_LLAMADA, llamadaBadgeStyle, prodBadgeStyle, textoHora, textoTelefono } from '../badges';

const AYUDA_CONTESTARON = 'De las llamadas del periodo, en cuántas sí hablaron con el negocio (cualquier resultado menos "No contestó" y "Número equivocado").';
const AYUDA_CITAS = 'Llamadas en las que el vendedor agendó una visita con día y hora. La cita aparece en su ruta ese día, arriba de lo demás.';

function celdaCsv(v: unknown): string {
  const t = String(v ?? '');
  const segura = /^[=+\-@]/.test(t) ? `'${t}` : t;
  return /[",\n]/.test(segura) ? `"${segura.replace(/"/g, '""')}"` : segura;
}

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 100) : null);

// Llamadas de los vendedores a los negocios de su ruta y las citas que
// agendaron: el vendedor es dueño de su agenda, aquí se ve cómo la usa.
export function Llamadas() {
  const { fProductos, fVendedores, fRango, fDesde, fHasta } = useFilters();
  const [selResultados, setSelResultados] = useState<string[]>([]);
  const [items, setItems] = useState<Llamada[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [citas, setCitas] = useState<CitaProxima[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [negocio, setNegocio] = useState<{ id: string; nombre: string } | null>(null);

  const filtroVendedores = { vendedorIds: fVendedores.length ? fVendedores : undefined, productoIds: fVendedores.length ? undefined : fProductos };

  useEffect(() => {
    if (fRango === 'personalizado' && (!fDesde || !fHasta)) return;
    setCargando(true);
    setError('');
    api.llamadas({ ...filtroVendedores, resultados: selResultados, desde: fDesde, hasta: fHasta })
      .then((r) => { setItems(r.items); setTruncado(r.truncado); })
      .catch((e) => { setItems([]); setError(e.message || 'No se pudieron cargar las llamadas.'); })
      .finally(() => setCargando(false));
  }, [fProductos, fVendedores, fRango, fDesde, fHasta, selResultados]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.citas(filtroVendedores).then(setCitas).catch(() => setCitas([]));
  }, [fProductos, fVendedores]); // eslint-disable-line react-hooks/exhaustive-deps

  const totales = useMemo(() => {
    const cuenta = (r: string) => items.filter((l) => l.resultado === r).length;
    const sinHablar = cuenta('no_contesto') + cuenta('numero_equivocado');
    return {
      llamadas: items.length,
      contestaron: items.length - sinHablar,
      citas: cuenta('cita'),
      vendedores: new Set(items.map((l) => l.vendedorId)).size,
      negocios: new Set(items.map((l) => l.negocioId)).size,
    };
  }, [items]);

  const porVendedor = useMemo(() => {
    const m = new Map<string, { id: string; nombre: string; producto: string; llamadas: number; citas: number; noContesto: number; noInteresa: number; despues: number }>();
    for (const l of items) {
      const f = m.get(l.vendedorId) ?? { id: l.vendedorId, nombre: l.vendedorNombre || '—', producto: l.producto, llamadas: 0, citas: 0, noContesto: 0, noInteresa: 0, despues: 0 };
      f.llamadas++;
      if (l.resultado === 'cita') f.citas++;
      if (l.resultado === 'no_contesto') f.noContesto++;
      if (l.resultado === 'no_interesa') f.noInteresa++;
      if (l.resultado === 'llamar_despues') f.despues++;
      m.set(l.vendedorId, f);
    }
    return [...m.values()].sort((a, b) => b.llamadas - a.llamadas);
  }, [items]);

  const exportar = () => {
    const encabezado = ['Fecha', 'Hora', 'Vendedor', 'Producto', 'Negocio', 'Dirección', 'Teléfono', 'Resultado', 'Cita (día)', 'Cita (hora)', 'Número correcto', 'Notas'];
    const lineas = items.map((l) => {
      const d = new Date(l.createdAt);
      return [
        d.toLocaleDateString('es-MX'), d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }), l.vendedorNombre, l.producto,
        l.nombreNegocio, l.direccion, l.telefono ?? '', ETIQUETA_LLAMADA[l.resultado] ?? l.resultado, l.citaFecha ?? '', l.citaHora ?? '', l.telefonoNuevo ?? '', l.notas ?? '',
      ].map(celdaCsv).join(',');
    });
    const blob = new Blob(['﻿' + [encabezado.join(','), ...lineas].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `llamadas_${fDesde ?? 'todo'}_${fHasta ?? ''}.csv`.replace(/_\.csv$/, '.csv');
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const th: React.CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#5a665f', borderBottom: '1px solid #eef2ee', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: 12.5, borderBottom: '1px solid #f2f5f2', verticalAlign: 'top' };

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.9 2Z" /></svg>}
        title="Llamadas y agenda"
        subtitle="A qué negocios llamó cada vendedor, qué pasó y las visitas que agendó"
        right={<button onClick={exportar} disabled={!items.length} style={{ ...boton.primario, opacity: items.length ? 1 : 0.6 }}>Exportar a Excel (CSV)</button>}
      />
      <FilterBar
        extra={
          <MultiSelectDropdown
            label="Resultado"
            options={Object.entries(ETIQUETA_LLAMADA).map(([value, label]) => ({ value, label }))}
            selected={selResultados}
            onChange={setSelResultados}
            placeholder="Todos los resultados"
          />
        }
        extraActivo={selResultados.length > 0}
        onLimpiarExtra={() => setSelResultados([])}
      />

      {error && <div style={{ marginBottom: 16 }}><Aviso tono="error">{error}</Aviso></div>}
      {truncado && <div style={{ marginBottom: 16 }}><Aviso tono="alerta">Hay muchas llamadas en este periodo: se muestran las 2,000 más recientes. Acorta el rango de fechas para verlas todas.</Aviso></div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14, marginBottom: 16 }}>
        <StatTile label="Llamadas" value={cargando ? '…' : totales.llamadas} sub={`a ${totales.negocios} ${totales.negocios === 1 ? 'negocio' : 'negocios'}`} />
        <StatTile label="Contestaron" value={pct(totales.contestaron, totales.llamadas) == null ? '—' : `${pct(totales.contestaron, totales.llamadas)}%`} sub={`${totales.contestaron} de ${totales.llamadas}`} ayuda={AYUDA_CONTESTARON} />
        <StatTile label="Visitas agendadas" value={totales.citas} sub={totales.contestaron ? `${pct(totales.citas, totales.contestaron)}% de los que contestaron` : undefined} tono={totales.citas ? 'bien' : 'neutro'} ayuda={AYUDA_CITAS} />
        <StatTile label="Vendedores que llamaron" value={totales.vendedores} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, marginBottom: 16, alignItems: 'start' }}>
        <Card titulo="Próximas citas" subtitulo="Visitas agendadas por teléfono de hoy en adelante, que aún no se hacen" padding="18px 0 6px" paddingEncabezado="0 20px">
          {citas.length === 0 ? (
            <div style={{ padding: '6px 20px 14px', color: '#9aa39c', fontSize: 12.5 }}>No hay citas pendientes con estos filtros.</div>
          ) : (
            <div style={{ maxHeight: 380, overflowY: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Cuándo</th><th style={th}>Negocio</th><th style={th}>Vendedor</th></tr></thead>
                <tbody>
                  {citas.map((c) => (
                    <tr key={c.prospectoId}>
                      <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600, color: '#0f5132' }}>
                        {etiquetaDia(c.citaFecha)}{c.citaHora ? ` · ${textoHora(c.citaHora)}` : ''}
                      </td>
                      <td style={td}>
                        <button className="link-negocio" onClick={() => setNegocio({ id: c.negocioId, nombre: c.nombre })}>{c.nombre}</button>
                        {c.telefono && <div style={{ fontSize: 11, color: '#8a978f', marginTop: 1 }}>Tel. {textoTelefono(c.telefono)}</div>}
                      </td>
                      <td style={{ ...td, color: '#3a4a41' }}>{c.vendedorNombre}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card titulo="Por vendedor" subtitulo="Cómo usa cada quien las llamadas en el periodo" padding="18px 0 6px" paddingEncabezado="0 20px">
          {porVendedor.length === 0 ? (
            <div style={{ padding: '6px 20px 14px', color: '#9aa39c', fontSize: 12.5 }}>Sin llamadas en este periodo.</div>
          ) : (
            <div style={{ maxHeight: 380, overflow: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Vendedor</th>
                    <th style={{ ...th, textAlign: 'right' }}>Llamadas</th>
                    <th style={{ ...th, textAlign: 'right' }}>Agendó</th>
                    <th style={{ ...th, textAlign: 'right' }}>Llamar después</th>
                    <th style={{ ...th, textAlign: 'right' }}>Sin respuesta</th>
                    <th style={{ ...th, textAlign: 'right' }}>No interesa</th>
                  </tr>
                </thead>
                <tbody>
                  {porVendedor.map((f) => (
                    <tr key={f.id}>
                      <td style={td}>
                        <div style={{ fontWeight: 600, color: '#263238' }}>{f.nombre}</div>
                        <span style={{ ...prodBadgeStyle(f.producto), marginTop: 3 }}>{f.producto}</span>
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{f.llamadas}</td>
                      <td style={{ ...td, textAlign: 'right', color: '#1c7a4f', fontWeight: 600 }}>{f.citas}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{f.despues}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{f.noContesto}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{f.noInteresa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Card titulo="Registro de llamadas" subtitulo="La más reciente primero; toca un negocio para ver todo su historial" padding="18px 0 0" paddingEncabezado="0 20px">
        {cargando ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#8a978f', fontSize: 13 }}>Cargando llamadas…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#9aa39c', fontSize: 12.5 }}>No hay llamadas con estos filtros.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr><th style={th}>Fecha</th><th style={th}>Negocio</th><th style={th}>Vendedor</th><th style={th}>Teléfono</th><th style={th}>Resultado</th></tr>
              </thead>
              <tbody>
                {items.map((l) => (
                  <tr key={l.id}>
                    <td style={{ ...td, color: '#8a978f', whiteSpace: 'nowrap' }}>
                      {new Date(l.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td style={td}>
                      <button className="link-negocio" onClick={() => setNegocio({ id: l.negocioId, nombre: l.nombreNegocio })} title="Ver historial del negocio">{l.nombreNegocio}</button>
                      <div style={{ fontSize: 11, color: '#8a978f', marginTop: 1 }}>{l.direccion}</div>
                      {l.notas && <div style={{ fontSize: 11, color: '#9aa39c', marginTop: 2, fontStyle: 'italic' }}>&ldquo;{l.notas}&rdquo;</div>}
                    </td>
                    <td style={{ ...td, color: '#3a4a41' }}>{l.vendedorNombre}</td>
                    <td style={{ ...td, whiteSpace: 'nowrap', color: '#3a4a41' }}>
                      {l.telefono ? textoTelefono(l.telefono) : '—'}
                      {l.telefonoNuevo && <div style={{ fontSize: 11, color: '#1c7a4f', marginTop: 1 }}>Correcto: {textoTelefono(l.telefonoNuevo)}</div>}
                    </td>
                    <td style={td}>
                      <span style={llamadaBadgeStyle(l.resultado)}>{ETIQUETA_LLAMADA[l.resultado] ?? l.resultado}</span>
                      {l.resultado === 'cita' && l.citaFecha && (
                        <div style={{ fontSize: 11.5, color: '#0f5132', marginTop: 4, fontWeight: 600 }}>
                          {etiquetaDia(l.citaFecha)}{l.citaHora ? ` · ${textoHora(l.citaHora)}` : ''}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {negocio && <HistorialNegocio negocioId={negocio.id} nombre={negocio.nombre} onClose={() => setNegocio(null)} />}
    </div>
  );
}
