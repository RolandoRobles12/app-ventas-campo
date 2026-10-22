import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth } from '@aviva/ui';
import { SessionProvider, useSession } from './session';
import { FiltersProvider } from './filters';
import { ToastProvider } from './toast';
import { Chrome } from './components/Chrome';
import { NoAdmin } from './pages/NoAdmin';
import { Resumen } from './pages/Resumen';
import { EnVivo } from './pages/EnVivo';
import { Visitas } from './pages/Visitas';
import { Rutas } from './pages/Rutas';
import { Planeador } from './pages/Planeador';
import { Equipo } from './pages/Equipo';
import { Usuarios } from './pages/Usuarios';

function AppShell() {
  const { isAdmin, loading } = useSession();

  if (loading) return null;
  if (!isAdmin) return <NoAdmin />;

  return (
    <ToastProvider>
      <FiltersProvider>
        <Chrome>
          <Routes>
            <Route path="/" element={<Navigate to="/resumen" replace />} />
            <Route path="/resumen" element={<Resumen />} />
            <Route path="/en-vivo" element={<EnVivo />} />
            <Route path="/visitas" element={<Visitas />} />
            <Route path="/rutas" element={<Rutas />} />
            <Route path="/rutas/:vendedorId" element={<Planeador />} />
            <Route path="/equipo" element={<Equipo />} />
            <Route path="/usuarios" element={<Usuarios />} />
            <Route path="*" element={<Navigate to="/resumen" replace />} />
          </Routes>
        </Chrome>
      </FiltersProvider>
    </ToastProvider>
  );
}

function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <SessionProvider>
          <AppShell />
        </SessionProvider>
      </RequireAuth>
    </AuthProvider>
  );
}

export default App;
