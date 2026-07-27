import { useEffect, useState } from 'react';
import { api, type Usuario } from '../api';
import { useToast } from '../toast';
import { useSession } from '../session';
import { PageHeader } from '../components/FilterBar';

export function Usuarios() {
  const { showToast } = useToast();
  const { email: miEmail } = useSession();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [email, setEmail] = useState('');
  const [nombre, setNombre] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => { api.usuarios().then(setUsuarios).catch(() => {}); };
  useEffect(load, []);

  const agregar = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.agregarUsuario({ email, nombre: nombre || undefined });
      setEmail('');
      setNombre('');
      load();
    } catch (err: any) {
      showToast(err.message || 'No se pudo agregar el administrador');
    } finally {
      setSaving(false);
    }
  };

  const quitar = async (u: Usuario) => {
    if (!window.confirm(`¿Quitar acceso de administrador a ${u.nombre || u.email}?`)) return;
    try {
      await api.eliminarUsuario(u.email);
      load();
    } catch (err: any) {
      showToast(err.message || 'No se pudo quitar el acceso');
    }
  };

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>}
        title="Usuarios" subtitle="Administradores con acceso al panel"
      />

      <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, marginBottom: 16 }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid #eef2ee', fontSize: 17, fontWeight: 500, color: '#263238' }}>Administradores</div>
        <form onSubmit={agregar} style={{ display: 'flex', gap: 10, padding: '16px 22px', borderBottom: '1px solid #eef2ee' }}>
          <input
            type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            placeholder="correo@avivacredito.com" style={{ flex: 1, border: '1px solid #d9e1db', borderRadius: 8, padding: '10px 13px', fontSize: 13.5 }}
          />
          <input
            value={nombre} onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre (opcional)" style={{ flex: 1, border: '1px solid #d9e1db', borderRadius: 8, padding: '10px 13px', fontSize: 13.5 }}
          />
          <button type="submit" disabled={saving} style={{ background: '#157347', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13.5, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Agregando…' : 'Agregar admin'}
          </button>
        </form>

        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr .5fr', padding: '11px 22px', fontSize: 12, fontWeight: 700, letterSpacing: '.5px', color: '#8a978f', borderBottom: '1px solid #eef2ee' }}>
          <div>CORREO</div><div>NOMBRE</div><div>DESDE</div><div></div>
        </div>
        {usuarios.map((u) => (
          <div key={u.email} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 1fr .5fr', alignItems: 'center', padding: '13px 22px', borderBottom: '1px solid #f2f5f2', fontSize: 13 }}>
            <div style={{ fontWeight: 600, color: '#263238' }}>{u.email}{u.email === miEmail?.toLowerCase() && <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 600, color: '#22a36c' }}>(tú)</span>}</div>
            <div style={{ color: '#5a665f' }}>{u.nombre || '—'}</div>
            <div style={{ color: '#5a665f' }}>{u.createdAt ? new Date(u.createdAt).toLocaleDateString('es-MX') : '—'}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => quitar(u)} title="Quitar acceso" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: '#fbe3e0', border: 'none', cursor: 'pointer' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
