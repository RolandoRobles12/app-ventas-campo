export function RealisticMapBg() {
  return (
    <svg width="100%" height="100%" viewBox="0 0 900 540" preserveAspectRatio="xMidYMid slice" style={{ position: 'absolute', inset: 0 }}>
      <rect width="900" height="540" fill="#e7ece4" />
      <rect x="70" y="50" width="165" height="120" rx="12" fill="#d2e7c9" />
      <circle cx="720" cy="425" r="74" fill="#d2e7c9" />
      <path d="M-40 205 C 200 250 320 120 520 175 S 820 235 940 200" fill="none" stroke="#c2dcec" strokeWidth="24" />
      <g stroke="#d6ddd0" strokeWidth="7">
        <line x1="0" y1="95" x2="900" y2="95" /><line x1="0" y1="185" x2="900" y2="185" />
        <line x1="0" y1="365" x2="900" y2="365" /><line x1="0" y1="455" x2="900" y2="455" />
        <line x1="130" y1="0" x2="130" y2="540" /><line x1="260" y1="0" x2="260" y2="540" />
        <line x1="540" y1="0" x2="540" y2="540" /><line x1="680" y1="0" x2="680" y2="540" />
        <line x1="810" y1="0" x2="810" y2="540" />
      </g>
      <g stroke="#ffffff" strokeWidth="4">
        <line x1="0" y1="95" x2="900" y2="95" /><line x1="0" y1="185" x2="900" y2="185" />
        <line x1="0" y1="365" x2="900" y2="365" /><line x1="0" y1="455" x2="900" y2="455" />
        <line x1="130" y1="0" x2="130" y2="540" /><line x1="260" y1="0" x2="260" y2="540" />
        <line x1="540" y1="0" x2="540" y2="540" /><line x1="680" y1="0" x2="680" y2="540" />
        <line x1="810" y1="0" x2="810" y2="540" />
      </g>
      <g stroke="#ccd3c6" strokeWidth="20" strokeLinecap="round" fill="none">
        <path d="M0 275 C 260 255 420 300 900 280" /><line x1="400" y1="0" x2="400" y2="540" />
      </g>
      <g stroke="#fbfcfa" strokeWidth="13" strokeLinecap="round" fill="none">
        <path d="M0 275 C 260 255 420 300 900 280" /><line x1="400" y1="0" x2="400" y2="540" />
      </g>
    </svg>
  );
}

/** Normaliza lat/lng reales a coordenadas % dentro del lienzo del mapa (no son posiciones inventadas). */
export function normalizeLatLng(points: { lat: number; lng: number }[]): { x: number; y: number }[] {
  if (!points.length) return [];
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  const spanLat = maxLat - minLat || 0.01;
  const spanLng = maxLng - minLng || 0.01;
  const pad = 12; // % margin so pins don't sit on the edge
  return points.map((p) => ({
    x: pad + ((p.lng - minLng) / spanLng) * (100 - pad * 2),
    y: pad + (1 - (p.lat - minLat) / spanLat) * (100 - pad * 2),
  }));
}
