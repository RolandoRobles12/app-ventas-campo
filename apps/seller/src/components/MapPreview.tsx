interface MapPreviewProps {
  direccion: string;
  telefono?: string | null;
  lat?: number | null;
  lng?: number | null;
}

function comoLlegarUrl(p: MapPreviewProps): string {
  const destino = p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : encodeURIComponent(p.direccion);
  return `https://www.google.com/maps/dir/?api=1&destination=${destino}`;
}

export function MapPreview(p: MapPreviewProps) {
  const hasCoords = p.lat != null && p.lng != null;
  const d = 0.006;
  const bbox = hasCoords ? `${p.lng! - d}%2C${p.lat! - d}%2C${p.lng! + d}%2C${p.lat! + d}` : null;
  const osmSrc = bbox
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${p.lat}%2C${p.lng}`
    : null;

  return (
    <>
      <div style={{ margin: '12px 16px 0', background: 'var(--aviva-green-700)', borderRadius: 20, padding: '15px 17px', display: 'flex', flexDirection: 'column', gap: 9, boxShadow: '0 8px 20px rgba(15,81,50,.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#eafff3' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8fcfae" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{p.direccion}</span>
        </div>
        {p.telefono && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, color: '#eafff3' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#8fcfae" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.9 2Z"/></svg>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{p.telefono}</span>
          </div>
        )}
      </div>

      <div style={{ margin: '12px 16px 0', borderRadius: 18, overflow: 'hidden', boxShadow: '0 8px 24px rgba(20,60,40,.09)' }}>
        <div style={{ position: 'relative', height: 150, overflow: 'hidden', background: '#dde9e0' }}>
          {osmSrc ? (
            <iframe title="Mapa del negocio" src={osmSrc} style={{ width: '100%', height: '100%', border: 0 }} loading="lazy" />
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-300)', fontSize: 12.5, fontWeight: 600, padding: '0 16px', textAlign: 'center' }}>
              Sin coordenadas GPS para este negocio · usa "Cómo llegar" con la dirección
            </div>
          )}
        </div>
        <a
          href={comoLlegarUrl(p)} target="_blank" rel="noreferrer"
          style={{
            width: '100%', border: 'none', background: '#fff', padding: 14, fontSize: 14, fontWeight: 700,
            color: 'var(--aviva-green-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            borderTop: '1px solid #eef0ec', textDecoration: 'none',
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--aviva-green-700)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
          Cómo llegar
        </a>
      </div>
    </>
  );
}
