import { useEffect, useState } from 'react';
import { api, type HistorialNegocio as Historial } from '../api';
import { ETIQUETA_LLAMADA, llamadaBadgeStyle, resultadoBadgeStyle, textoHora, textoTelefono } from '../badges';
import { etiquetaDia } from '../lib/dateRanges';
import { Aviso, Modal, boton } from './ui';

// Todas las visitas y llamadas que ha recibido un negocio, de cualquier
// vendedor (activo o no), de la más reciente a la más vieja.
export function HistorialNegocio({ negocioId, nombre, onClose, onFoto }: {
  negocioId: string; nombre: string; onClose: () => void; onFoto?: (fotos: string[]) => void;
}) {
  const [data, setData] = useState<Historial | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.historialNegocio(negocioId).then(setData).catch((e) => setError(e.message || 'No se pudo cargar el historial.'));
  }, [negocioId]);

  const visitas = data?.visitas ?? [];
  const llamadas = data?.llamadas ?? [];
  const vendedores = new Set([...visitas, ...llamadas].map((v) => v.vendedorId)).size;
  const eventos = [
    ...visitas.map((v) => ({ tipo: 'visita' as const, fecha: v.createdAt, v })),
    ...llamadas.map((l) => ({ tipo: 'llamada' as const, fecha: l.createdAt, l })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha));
  const subtitulo = data
    ? [data.direccion, data.giro].filter(Boolean).join(' · ')
    : 'Cargando…';

  return (
    <Modal titulo={data?.nombre ?? nombre} subtitulo={subtitulo} onClose={onClose} ancho={640} pie={<button onClick={onClose} style={boton.secundario}>Cerrar</button>}>
      {error && <Aviso tono="error">{error}</Aviso>}
      {data && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16, fontSize: 12.5 }}>
            <span style={chip}>{visitas.length === 1 ? '1 visita' : `${visitas.length} visitas`}</span>
            {llamadas.length > 0 && <span style={chip}>{llamadas.length === 1 ? '1 llamada' : `${llamadas.length} llamadas`}</span>}
            <span style={chip}>{vendedores === 1 ? '1 vendedor' : `${vendedores} vendedores`}</span>
            {data.telefono && <span style={chip}>Tel. {textoTelefono(data.telefono)}</span>}
            <span style={{ ...chip, background: data.enRuta ? '#eef8f1' : '#f4f6f4', color: data.enRuta ? '#0f5132' : '#6f7d75' }}>
              {data.enRuta
                ? `En la ruta de ${data.enRuta.vendedorNombre}${data.enRuta.fechaPlan ? ` · ${etiquetaDia(data.enRuta.fechaPlan)}` : ''}${data.enRuta.citaHora ? ` · cita a las ${textoHora(data.enRuta.citaHora)}` : ''}`
                : 'No está en ninguna ruta pendiente'}
            </span>
          </div>
          {eventos.length === 0 && <div style={{ color: '#9aa39c', fontSize: 13, padding: '8px 0' }}>Este negocio todavía no tiene visitas.</div>}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {eventos.map((e, i) => {
              const punto = (
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', top: 4, left: 2, width: 10, height: 10, borderRadius: e.tipo === 'llamada' ? 3 : '50%', background: i === 0 ? '#157347' : '#c9d4cc' }} />
                  {i < eventos.length - 1 && <span style={{ position: 'absolute', top: 18, bottom: -10, left: 6, width: 2, background: '#e6ece7' }} />}
                </div>
              );
              const fecha = new Date(e.fecha).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
              if (e.tipo === 'llamada') {
                const l = e.l;
                return (
                  <div key={`l-${l.id}`} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr) auto', gap: 12, paddingBottom: 14 }}>
                    {punto}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 600, color: '#263238', fontSize: 13 }}>{fecha}</span>
                        <span style={{ fontSize: 11, color: '#5a665f', background: '#f4f6f4', borderRadius: 999, padding: '2px 8px' }}>Llamada</span>
                        <span style={llamadaBadgeStyle(l.resultado)}>{ETIQUETA_LLAMADA[l.resultado] ?? l.resultado}</span>
                        {l.resultado === 'cita' && l.citaFecha && (
                          <span style={{ fontSize: 12, color: '#0f5132', fontWeight: 600 }}>para {etiquetaDia(l.citaFecha)}{l.citaHora ? ` · ${textoHora(l.citaHora)}` : ''}</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12.5, color: '#5a665f', marginTop: 3 }}>{l.vendedorNombre} · {l.producto}</div>
                      {l.notas && <div style={{ fontSize: 12.5, color: '#3a4a41', marginTop: 4, fontStyle: 'italic' }}>&ldquo;{l.notas}&rdquo;</div>}
                    </div>
                    <div />
                  </div>
                );
              }
              const v = e.v;
              return (
              <div key={v.id} style={{ display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr) auto', gap: 12, paddingBottom: 14 }}>
                {punto}
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontWeight: 600, color: '#263238', fontSize: 13 }}>{fecha}</span>
                    <span style={resultadoBadgeStyle(v.resultado)}>{v.resultado}</span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#5a665f', marginTop: 3 }}>
                    {v.vendedorNombre} · {v.producto}
                    {!v.vendedorActivo && <span style={{ marginLeft: 6, fontSize: 11, color: '#6f7d75', background: '#eef1ee', borderRadius: 999, padding: '1px 8px' }}>ya no activo</span>}
                  </div>
                  {v.notas && <div style={{ fontSize: 12.5, color: '#3a4a41', marginTop: 4, fontStyle: 'italic' }}>&ldquo;{v.notas}&rdquo;</div>}
                </div>
                {v.fotos.length > 0 ? (
                  <div
                    onClick={() => onFoto?.(v.fotos)}
                    title="Ver fotos"
                    style={{ width: 46, height: 46, borderRadius: 8, backgroundImage: `url(${v.fotos[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', cursor: onFoto ? 'zoom-in' : 'default', border: '1px solid #eef2ee' }}
                  />
                ) : <div />}
              </div>
              );
            })}
          </div>
        </>
      )}
    </Modal>
  );
}

const chip: React.CSSProperties = { background: '#f4f6f4', color: '#3a4a41', borderRadius: 999, padding: '4px 10px', fontWeight: 500 };
