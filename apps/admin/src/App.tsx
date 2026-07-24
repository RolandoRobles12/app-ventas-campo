import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, RequireAuth } from '@aviva/ui';
import { FiltersProvider } from './filters';
import { ToastProvider } from './toast';
import { Chrome } from './components/Chrome';
import { Rutas } from './pages/Rutas';
import { Dashboard } from './pages/Dashboard';
import { Mapa } from './pages/Mapa';
import { Seguimiento } from './pages/Seguimiento';
import { Reportes } from './pages/Reportes';
import { Visitas } from './pages/Visitas';
import { Crm } from './pages/Crm';

function App() {
  return (
    <AuthProvider>
      <RequireAuth>
        <ToastProvider>
          <FiltersProvider>
            <Chrome>
              <Routes>
                <Route path="/" element={<Navigate to="/rutas" replace />} />
                <Route path="/rutas" element={<Rutas />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/mapa" element={<Mapa />} />
                <Route path="/seguimiento" element={<Seguimiento />} />
                <Route path="/visitas" element={<Visitas />} />
                <Route path="/reportes" element={<Reportes />} />
                <Route path="/crm" element={<Crm />} />
              </Routes>
            </Chrome>
          </FiltersProvider>
        </ToastProvider>
      </RequireAuth>
    </AuthProvider>
  );
}

export default App;
