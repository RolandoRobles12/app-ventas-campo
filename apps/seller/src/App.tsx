import { Routes, Route } from 'react-router-dom';
import { SessionProvider, useSession } from './session';
import { PickVendedor } from './pages/PickVendedor';
import { Home } from './pages/Home';
import { VisitasList } from './pages/visitas/VisitasList';
import { VisitForm } from './pages/visitas/VisitForm';
import { VisitSuccess } from './pages/visitas/VisitSuccess';
import { Jornada } from './pages/Jornada';
import { PhoneShell, StatusBar } from './components/PhoneShell';
import { BottomNav } from './components/BottomNav';

function AppShell() {
  const { vendedor, loading } = useSession();

  if (loading) {
    return (
      <PhoneShell>
        <StatusBar />
      </PhoneShell>
    );
  }

  if (!vendedor) {
    return <PickVendedor />;
  }

  return (
    <PhoneShell>
      <StatusBar />
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/visitas" element={<VisitasList />} />
          <Route path="/visitas/nuevo" element={<VisitForm mode="nuevo" />} />
          <Route path="/visitas/:id" element={<VisitForm mode="lead" />} />
          <Route path="/visitas/exito" element={<VisitSuccess />} />
          <Route path="/jornada" element={<Jornada />} />
        </Routes>
      </div>
      <BottomNav />
    </PhoneShell>
  );
}

function App() {
  return (
    <SessionProvider>
      <AppShell />
    </SessionProvider>
  );
}

export default App;
