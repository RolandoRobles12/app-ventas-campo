import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth } from '@aviva/ui';
import { SessionProvider, useSession } from './session';
import { NoVendedor } from './pages/NoVendedor';
import { Hoy } from './pages/Hoy';
import { Mapa } from './pages/Mapa';
import { Historial } from './pages/Historial';
import { RegistrarVisita } from './pages/visita/RegistrarVisita';
import { VisitaExito } from './pages/visita/VisitaExito';
import { AppShell } from './components/AppShell';
import { BottomNav } from './components/BottomNav';
import { LocationGate } from './components/LocationGate';
import { UbicacionProvider } from './ubicacion';
import { OfflineSync } from './offline';
import { RecorridoProvider } from './recorrido';

function AppShellConSesion() {
  const { vendedor, loading } = useSession();
  const { pathname } = useLocation();

  if (loading) return <AppShell />;
  if (!vendedor) return <NoVendedor />;

  // Registrar una visita es una tarea de pantalla completa: sin la barra de
  // abajo hay más espacio y menos toques accidentales.
  const enVisita = pathname.startsWith('/visita');

  return (
    <AppShell>
      {/* Sin ubicación habilitada no se puede usar la app: el gate bloquea
          todo, y el GPS compartido y la sincronización solo arrancan cuando
          ya hay ubicación. */}
      <LocationGate>
        <UbicacionProvider vendedorId={vendedor.id}>
          <OfflineSync />
          <RecorridoProvider vendedor={vendedor}>
            <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <Routes>
                <Route path="/" element={<Hoy />} />
                <Route path="/mapa" element={<Mapa />} />
                <Route path="/historial" element={<Historial />} />
                <Route path="/visita/nueva" element={<RegistrarVisita nueva />} />
                <Route path="/visita/practica" element={<RegistrarVisita practica />} />
                <Route path="/visita/exito" element={<VisitaExito />} />
                <Route path="/visita/:id" element={<RegistrarVisita />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
            {!enVisita && <BottomNav />}
          </RecorridoProvider>
        </UbicacionProvider>
      </LocationGate>
    </AppShell>
  );
}

function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <SessionProvider>
          <AppShellConSesion />
        </SessionProvider>
      </RequireAuth>
    </AuthProvider>
  );
}

export default App;
