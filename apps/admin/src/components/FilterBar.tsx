import { useFilters } from '../filters';
import { RANGO_LABELS, type RangoPreset } from '../lib/dateRanges';
import { MultiSelectDropdown } from './MultiSelectDropdown';

function SelectChevron() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6f7d75" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
  );
}

const dateInputStyle: React.CSSProperties = {
  border: '1px solid #d9e1db', background: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#263238',
};

export function FilterBar({ extra }: { extra?: React.ReactNode }) {
  const {
    productos, vendedoresFiltrados, fProductos, fVendedores, setFProductos, setFVendedores,
    fRango, setFRango, fDesdePersonalizado, fHastaPersonalizado, setFDesdePersonalizado, setFHastaPersonalizado,
  } = useFilters();

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: '#8a978f' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#8a978f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
        Filtros
      </span>
      <MultiSelectDropdown
        label="Producto"
        options={productos.map((p) => ({ value: p.id, label: p.nombre }))}
        selected={fProductos}
        onChange={setFProductos}
        placeholder="Todos los productos"
      />
      <MultiSelectDropdown
        label="Vendedor"
        options={vendedoresFiltrados.map((v) => ({ value: v.id, label: v.nombre }))}
        selected={fVendedores}
        onChange={setFVendedores}
        placeholder="Todos los vendedores"
      />
      <div style={{ position: 'relative' }}>
        <select className="fsel" value={fRango} onChange={(e) => setFRango(e.target.value as RangoPreset)}>
          {(Object.keys(RANGO_LABELS) as RangoPreset[]).map((r) => <option key={r} value={r}>{RANGO_LABELS[r]}</option>)}
        </select>
        <SelectChevron />
      </div>
      {fRango === 'personalizado' && (
        <>
          <input type="date" value={fDesdePersonalizado ?? ''} onChange={(e) => setFDesdePersonalizado(e.target.value || null)} style={dateInputStyle} />
          <span style={{ color: '#8a978f', fontSize: 12.5 }}>a</span>
          <input type="date" value={fHastaPersonalizado ?? ''} onChange={(e) => setFHastaPersonalizado(e.target.value || null)} style={dateInputStyle} />
        </>
      )}
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
