import { useFilters, TODOS_PRODUCTOS, TODOS_VENDEDORES } from '../filters';

function SelectChevron() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6f7d75" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
  );
}

export function FilterBar({ extra }: { extra?: React.ReactNode }) {
  const { productos, vendedoresFiltrados, fProducto, fVendedor, setFProducto, setFVendedor } = useFilters();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: '#8a978f' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a978f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
        Filtros
      </span>
      <div style={{ position: 'relative' }}>
        <select className="fsel" value={fProducto} onChange={(e) => setFProducto(e.target.value)}>
          <option>{TODOS_PRODUCTOS}</option>
          {productos.map((p) => <option key={p.id}>{p.nombre}</option>)}
        </select>
        <SelectChevron />
      </div>
      <div style={{ position: 'relative' }}>
        <select className="fsel" value={fVendedor} onChange={(e) => setFVendedor(e.target.value)}>
          <option>{TODOS_VENDEDORES}</option>
          {vendedoresFiltrados.map((v) => <option key={v.id}>{v.nombre}</option>)}
        </select>
        <SelectChevron />
      </div>
      {extra}
    </div>
  );
}

export function PageHeader({ icon, title, subtitle, right }: { icon: React.ReactNode; title: string; subtitle: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#e6f2ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icon}</div>
        <div>
          <h1 style={{ margin: 0, fontSize: 27, fontWeight: 500, color: '#263238', letterSpacing: '-.2px' }}>{title}</h1>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#6f7d75', marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>
      {right}
    </div>
  );
}
