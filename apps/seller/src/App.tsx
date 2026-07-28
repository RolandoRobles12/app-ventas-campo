import { Routes, Route } from 'react-router-dom';
import { AuthProvider, RequireAuth } from '@aviva/ui';
import { SessionProvider, useSession } from './session';
import { NoVendedor } from './pages/NoVendedor';
import { Home } from './pages/Home';
import { VisitasList } from './pages/visitas/VisitasList';
import { VisitForm } from './pages/visitas/VisitForm';
import { VisitSuccess } from './pages/visitas/VisitSuccess';
import { PhoneShell } from './components/PhoneShell';
import { BottomNav } from './components/BottomNav';
import { LocationTracker } from './components/LocationTracker';
import { LocationGate } from './components/LocationGate';
import { OfflineSync } from './offline';

function AppShell() {
  const { vendedor, loading } = useSession();

  if (loading) {
    return <PhoneShell />;
  }

  if (!vendedor) {
    return <NoVendedor />;
  }

  return (
    <PhoneShell>
      {/* Sin ubicación habilitada no se puede usar la app: el gate bloquea
          todo, y el tracker/sync solo arrancan cuando ya hay ubicación. */}
      <LocationGate>
        <LocationTracker />
        <OfflineSync />
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/visitas" element={<VisitasList />} />
            <Route path="/visitas/nuevo" element={<VisitForm mode="nuevo" />} />
            <Route path="/visitas/:id" element={<VisitForm mode="lead" />} />
            <Route path="/visitas/exito" element={<VisitSuccess />} />
          </Routes>
        </div>
        <BottomNav />
      </LocationGate>
    </PhoneShell>
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
