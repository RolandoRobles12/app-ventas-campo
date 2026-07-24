import { useEffect, useRef, useState } from 'react';

export interface MultiSelectOption { value: string; label: string }

function ChevronIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6f7d75" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
  );
}

// Dropdown con checkboxes: mismo look que un <select> del resto del admin
// (comparte la clase .fsel), pero permite elegir una o varias opciones a la
// vez en vez de una sola. Se usa para los filtros de producto/vendedor/
// resultado en toda la app.
export function MultiSelectDropdown({
  label, options, selected, onChange, placeholder,
}: {
  label: string;
  options: MultiSelectOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  useEffect(() => { if (!open) setSearch(''); }, [open]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const summary = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? placeholder
      : `${selected.length} seleccionados`;

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} className="fsel" style={{ maxWidth: 210, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {summary}
      </button>
      <ChevronIcon />
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 80, background: '#fff',
          border: '1px solid #e0e8e2', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.16)',
          width: 260, padding: 8,
        }}>
          {options.length > 8 && (
            <input
              autoFocus value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Buscar ${label.toLowerCase()}…`}
              style={{ width: '100%', border: '1px solid #e0e8e2', borderRadius: 7, padding: '7px 9px', fontSize: 12.5, marginBottom: 6, boxSizing: 'border-box' }}
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 4px 6px' }}>
            <button type="button" onClick={() => onChange(options.map((o) => o.value))} style={linkBtnStyle}>Todos</button>
            <button type="button" onClick={() => onChange([])} style={linkBtnStyle}>Limpiar</button>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filtered.length === 0 && <div style={{ fontSize: 12, color: '#9aa39c', padding: '8px 8px' }}>Sin resultados</div>}
            {filtered.map((opt) => {
              const on = selected.includes(opt.value);
              return (
                <label key={opt.value} className="msel-opt" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 6, fontSize: 13, color: '#3a4a41', cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => toggle(opt.value)} style={{ accentColor: '#157347', width: 14, height: 14, flex: 'none' }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{opt.label}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#157347', fontWeight: 600, fontSize: 11.5, cursor: 'pointer', padding: '2px 4px',
};
