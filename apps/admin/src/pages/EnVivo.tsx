import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type EnVivoItem, type RecorridoVendedor } from '../api';
import { useFilters } from '../filters';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { GeoMap, type MapPin } from '../components/GeoMap';
import { Avatar, Card } from '../components/ui';
import { haceCuanto } from '../lib/dateRanges';
import { prodBadgeStyle } from '../badges';

const REFRESCO_MS = 60 * 1000;

const ESTADOS = {
  en_ruta: { texto: 'En ruta', color: '#1c7a4f', fondo: '#dcf1e5' },
  inactivo: { texto: 'Sin señal reciente', color: '#94500f', fondo: '#fdecdb' },
  sin_actividad: { texto: 'No ha empezado', color: '#5a665f', fondo: '#eef2ee' },
} as const;

// Cómo va el día de cada vendedor, ahora mismo: dónde está, cuántas visitas
// lleva contra las que le tocan hoy y quién no ha empezado.
export function EnVivo() {
  const { fProductos, fVendedores } = useFilters();
  const [items, setItems] = useState<EnVivoItem[]>([]);
  const [cargado, setCargado] = useState(false);
  const [actualizado, setActualizado] = useState<string | null>(null);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [recorrido, setRecorrido] = useState<RecorridoVendedor | null>(null);
  const [, setTick] = useState(0);

  const cargar = useCallback(() => {
    api.enVivo({ productoIds: fProductos, vendedorIds: fVendedores })
      .then((r) => { setItems(r.items); setActualizado(new Date().toISOString()); })
      .catch(() => {})
      .finally(() => setCargado(true));
  }, [fProductos, fVendedores]);

  // Se refresca solo mientras la pestaña está visible (cada refresco son
  // varias consultas por vendedor).
  useEffect(() => {
    cargar();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') cargar();
      setTick((t) => t + 1);
    }, REFRESCO_MS);
    return () => clearInterval(timer);
  }, [cargar]);

  useEffect(() => {
    if (!seleccion) { setRecorrido(null); return; }
    api.recorridos({ vendedorIds: [seleccion] }).then((r) => setRecorrido(r[0] ?? null)).catch(() => setRecorrido(null));
  }, [seleccion, actualizado]);

  const conteo = {
    en_ruta: items.filter((i) => i.estado === 'en_ruta').length,
    inactivo: items.filter((i) => i.estado === 'inactivo').length,
    sin_actividad: items.filter((i) => i.estado === 'sin_actividad').length,
  };
  const visitasHoy = items.reduce((s, i) => s + i.visitasHoy, 0);
  const planHoy = items.reduce((s, i) => s + i.planHoy, 0);
  const planHoyVisitados = items.reduce((s, i) => s + i.planHoyVisitados, 0);

  const pins = useMemo<MapPin[]>(() => items
    .filter((i) => i.posicion && (!seleccion || i.id === seleccion))
    .map((i) => ({
      id: i.id, lat: i.posicion!.lat, lng: i.posicion!.lng, color: i.estado === 'en_ruta' ? i.color : '#9aa39c',
      title: i.nombre, subtitle: `${ESTADOS[i.estado].texto} · última señal ${haceCuanto(i.ultimaSenal)} · ${i.visitasHoy} visitas hoy`,
    })), [items, seleccion]);

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.5M7.8 16.2a6 6 0 0 1 0-8.5M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2" /></svg>}
        title="En vivo" subtitle="Cómo va el día de cada vendedor, ahora mismo"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#e9f7ef', border: '1px solid #bfe6cf', borderRadius: 20, padding: '7px 14px' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22a36c' }} />
            <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0f5132' }}>Se actualiza cada minuto · {actualizado ? haceCuanto(actualizado) : '…'}</span>
          </div>
        }
      />
      <FilterBar sinFechas />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12, marginBottom: 14 }}>
        <Resumen etiqueta="En ruta ahora" valor={conteo.en_ruta} color="#1c7a4f" />
        <Resumen etiqueta="Sin señal reciente" valor={conteo.inactivo} color="#94500f" />
        <Resumen etiqueta="No han empezado" valor={conteo.sin_actividad} color="#5a665f" />
        <Resumen etiqueta="Visitas hoy" valor={visitasHoy} color="#263238" extra={planHoy ? `${planHoyVisitados} de ${planHoy} paradas planeadas` : undefined} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(360px, 1fr)', gap: 14, alignItems: 'start' }}>
        <Card padding={0} style={{ overflow: 'hidden', position: 'sticky', top: 0 }}>
          <div style={{ position: 'relative', zIndex: 0, height: 'calc(100vh - 330px)', minHeight: 420 }}>
            <GeoMap pins={pins} recorridos={recorrido ? [recorrido] : []} height="100%" encuadre={`${seleccion ?? 'todos'}:${pins.length > 0}:${(recorrido?.puntos.length ?? 0) > 0}`} />
            {cargado && !pins.length && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.75)', color: '#5a665f', fontSize: 13, fontWeight: 600, textAlign: 'center', padding: '0 40px' }}>
                Nadie ha mandado su ubicación hoy todavía. Aparecen en cuanto abren la app.
              </div>
            )}
          </div>
          {seleccion && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderTop: '1px solid #eef2ee', fontSize: 12.5, color: '#3a4a41' }}>
              <span style={{ flex: 1 }}>Recorrido de hoy de <b>{items.find((i) => i.id === seleccion)?.nombre}</b> · {recorrido?.puntos.length ?? 0} puntos GPS</span>
              <button onClick={() => setSeleccion(null)} style={{ background: 'none', border: 'none', color: '#157347', fontWeight: 600, cursor: 'pointer' }}>Ver a todos</button>
            </div>
          )}
        </Card>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {!cargado && <div style={{ padding: 20, color: '#8a978f', fontSize: 13 }}>Cargando…</div>}
          {cargado && !items.length && <Card><span style={{ color: '#8a978f', fontSize: 13 }}>No hay vendedores activos en este filtro.</span></Card>}
          {items.map((i) => {
            const e = ESTADOS[i.estado];
            const sel = seleccion === i.id;
            const meta = i.planHoy;
            const pct = meta ? Math.min(100, Math.round((i.visitasHoy / meta) * 100)) : 0;
            return (
              <button
                key={i.id}
                onClick={() => setSeleccion(sel ? null : i.id)}
                style={{ textAlign: 'left', background: '#fff', border: `1.5px solid ${sel ? '#157347' : '#e3eae5'}`, borderRadius: 12, padding: '12px 14px', cursor: 'pointer', font: 'inherit' }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Avatar color={i.color} iniciales={i.iniciales} size={36} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#263238' }}>{i.nombre}</div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
                      <span style={prodBadgeStyle(i.producto)}>{i.producto}</span>
                      {i.zona && <span style={{ fontSize: 11.5, color: '#8a978f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.zona}</span>}
                    </div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: '4px 10px', borderRadius: 20, color: e.color, background: e.fondo, whiteSpace: 'nowrap' }}>{e.texto}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
                  <span style={{ fontSize: 20, fontWeight: 600, color: '#263238', fontVariantNumeric: 'tabular-nums' }}>{i.visitasHoy}</span>
                  <span style={{ fontSize: 12.5, color: '#6f7d75' }}>{meta ? `de ${meta} visitas planeadas` : 'visitas hoy · sin ruta para hoy'}</span>
                </div>
                {meta > 0 && (
                  <div style={{ height: 6, background: '#edf1ee', borderRadius: 3, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: '#157347', borderRadius: 3 }} />
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 8, fontSize: 12, color: '#6f7d75' }}>
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {i.ultimaVisita ? <>Última: <b style={{ color: '#3a4a41' }}>{i.ultimaVisita.nombre}</b> · {haceCuanto(i.ultimaVisita.hora)}</> : 'Sin visitas hoy'}
                  </span>
                  <span style={{ flex: 'none' }}>Señal {haceCuanto(i.ultimaSenal)}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Resumen({ etiqueta, valor, color, extra }: { etiqueta: string; valor: number; color: string; extra?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e3eae5', borderRadius: 12, padding: '12px 16px' }}>
      <div style={{ fontSize: 12.5, color: '#5a665f' }}>{etiqueta}</div>
      <div style={{ fontSize: 26, fontWeight: 600, color, marginTop: 2 }}>{valor}</div>
      {extra && <div style={{ fontSize: 12, color: '#6f7d75' }}>{extra}</div>}
    </div>
  );
}
