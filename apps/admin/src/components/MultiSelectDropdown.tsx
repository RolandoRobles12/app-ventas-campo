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

  const selectedLabels = selected
    .map((v) => options.find((o) => o.value === v)?.label)
    .filter((l): l is string => !!l);

  const summary = selectedLabels.length === 0
    ? placeholder
    : selectedLabels.length <= 2
      ? selectedLabels.join(', ')
      : `${selectedLabels.slice(0, 2).join(', ')} +${selectedLabels.length - 2}`;

  // Las opciones marcadas suben al principio para que, con la lista abierta,
  // se vea de un vistazo qué está seleccionado sin tener que buscarlo.
  const filtered = (search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options
  ).slice().sort((a, b) => Number(selected.includes(b.value)) - Number(selected.includes(a.value)));

  const hasSelection = selected.length > 0;

  return (
    <div ref={boxRef} style={{ position: 'relative' }}>
      <button
        type="button" onClick={() => setOpen((v) => !v)} className="fsel" title={selectedLabels.join(', ') || undefined}
        style={{
          maxWidth: 230, textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          borderColor: hasSelection ? '#157347' : undefined, background: hasSelection ? '#eef8f1' : undefined,
          color: hasSelection ? '#0f5132' : undefined, fontWeight: hasSelection ? 600 : undefined,
        }}
      >
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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2px 4px 6px' }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: hasSelection ? '#157347' : '#9aa39c' }}>
              {hasSelection ? `${selected.length} seleccionado${selected.length === 1 ? '' : 's'}` : 'Ninguno seleccionado'}
            </span>
            <span style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => onChange(options.map((o) => o.value))} style={linkBtnStyle}>Todos</button>
              <button type="button" onClick={() => onChange([])} style={linkBtnStyle}>Limpiar</button>
            </span>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {filtered.length === 0 && <div style={{ fontSize: 12, color: '#9aa39c', padding: '8px 8px' }}>Sin resultados</div>}
            {filtered.map((opt) => {
              const on = selected.includes(opt.value);
              return (
                <label
                  key={opt.value} className="msel-opt"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 6, fontSize: 13, cursor: 'pointer',
                    background: on ? '#eef8f1' : 'transparent', color: on ? '#0f5132' : '#3a4a41', fontWeight: on ? 600 : 400,
                  }}
                >
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
