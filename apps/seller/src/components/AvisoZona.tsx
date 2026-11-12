// Aviso fijo mientras el vendedor está en una zona donde no puede visitar.
export function AvisoZona({ estado, mensaje }: { estado: 'dentro' | 'borde'; mensaje: string | null }) {
  const dentro = estado === 'dentro';
  return (
    <section role="alert" className="aparecer" style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: dentro ? '#fdeceb' : '#fff5ea', border: `2px solid ${dentro ? '#e6a39b' : '#f3c99a'}`, borderRadius: 18, padding: '14px 16px' }}>
      <span style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', border: `3px solid ${dentro ? '#c62828' : '#c96a1e'}`, position: 'relative', marginTop: 1 }}>
        <span style={{ position: 'absolute', left: -1, right: -1, top: 10, height: 3, background: dentro ? '#c62828' : '#c96a1e', transform: 'rotate(-45deg)' }} />
      </span>
      <div style={{ fontSize: 15, fontWeight: 600, color: dentro ? '#7a2a22' : '#8a5a1e', lineHeight: 1.45 }}>
        <b style={{ display: 'block', fontSize: 16, fontWeight: 800 }}>{dentro ? 'Estás en una zona donde no puedes visitar negocios' : 'Estás en el borde de una zona donde no puedes visitar negocios'}</b>
        {mensaje ? `Motivo: ${mensaje}. ` : ''}{dentro ? 'Aquí no se pueden registrar visitas: sigue hacia otra calle.' : 'Asegúrate de estar fuera de ella antes de registrar visitas.'}
      </div>
    </section>
  );
}
