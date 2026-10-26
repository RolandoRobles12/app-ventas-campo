import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Recorrido, type PasoRecorrido } from '@aviva/ui';
import { api, type Vendedor } from './api';
import { Bienvenida } from './components/Bienvenida';

// Onboarding del vendedor: la primera vez que entra ve la bienvenida (para
// qué sirve la app) y desde ahí puede hacer el recorrido guiado por su
// pantalla o practicar una visita que no se guarda. Todo se puede volver a
// ver desde el menú de su cuenta (tocando sus iniciales).

interface RecorridoState {
  verBienvenida: () => void;
  iniciarRecorrido: () => void;
  practicar: () => void;
}

const RecorridoContext = createContext<RecorridoState | null>(null);

const llaveVisto = (vendedorId: string) => `aviva.onboarding.${vendedorId}`;

function vistoEnEsteTelefono(vendedorId: string): boolean {
  try {
    return localStorage.getItem(llaveVisto(vendedorId)) === '1';
  } catch {
    return false;
  }
}

const PASOS: PasoRecorrido[] = [
  { objetivo: 'avance', titulo: 'Tu meta del día', texto: 'Aquí ves cuántas visitas llevas y cuántas te faltan. Si cumples varios días seguidos, sumas a tu racha 🔥.' },
  { objetivo: 'siguiente', titulo: 'Tu siguiente parada', texto: 'Es el negocio más cercano (o tu próxima cita). "Cómo llegar" abre Google Maps; cuando estés ahí, toca "Registrar visita".' },
  { objetivo: 'vistas', titulo: 'Tu ruta y tus llamadas', texto: 'En "Llamar" están los negocios con teléfono. Llama antes de ir: si agendas una cita, aparece en tu ruta ese día y a esa hora.' },
  { objetivo: 'lista', titulo: 'El resto de tu día', texto: 'Toca cualquier negocio para registrar su visita. Van del más cercano al más lejano; los de otros días están más abajo.' },
  { objetivo: 'nuevo', titulo: '¿Un negocio fuera de tu ruta?', texto: 'Si visitas uno que no está en tu lista, regístralo aquí. También cuenta como visita.' },
  { objetivo: 'conexion', titulo: 'Funciona sin señal', texto: 'Si no hay internet, lo que registras se guarda en el teléfono y se envía solo. "Al día" significa que ya se envió todo.' },
  { objetivo: 'nav-mapa', titulo: 'Mapa', texto: 'Ve todas tus paradas en el mapa para planear por dónde empezar.' },
  { objetivo: 'nav-historial', titulo: 'Historial', texto: 'Revisa lo que registraste y cómo vas en la semana.' },
  { objetivo: 'cuenta', titulo: 'Tu cuenta', texto: 'Toca tus iniciales para volver a ver esta guía, practicar una visita o cerrar sesión.' },
];

export function RecorridoProvider({ vendedor, children }: { vendedor: Vendedor; children: ReactNode }) {
  const navigate = useNavigate();
  const [bienvenida, setBienvenida] = useState(() => !vendedor.onboardingVisto && !vistoEnEsteTelefono(vendedor.id));
  const [recorrido, setRecorrido] = useState(false);

  // Si la vio sin señal, el servidor no se enteró: se le avisa en cuanto se pueda.
  useEffect(() => {
    if (!vendedor.onboardingVisto && vistoEnEsteTelefono(vendedor.id)) api.marcarOnboarding().catch(() => {});
  }, [vendedor]);

  const marcarVisto = useCallback(() => {
    try { localStorage.setItem(llaveVisto(vendedor.id), '1'); } catch { /* sin espacio: solo se pierde el recordatorio */ }
    if (!vendedor.onboardingVisto) api.marcarOnboarding().catch(() => {});
  }, [vendedor]);

  const iniciarRecorrido = useCallback(() => {
    setBienvenida(false);
    navigate('/');
    setRecorrido(true);
  }, [navigate]);

  const practicar = useCallback(() => {
    setBienvenida(false);
    navigate('/visita/practica');
  }, [navigate]);

  const terminarRecorrido = useCallback(() => setRecorrido(false), []);

  return (
    <RecorridoContext.Provider value={{ verBienvenida: () => setBienvenida(true), iniciarRecorrido, practicar }}>
      {children}
      {bienvenida && (
        <Bienvenida
          nombre={vendedor.nombre.split(' ')[0]}
          onSalir={(siguiente) => {
            marcarVisto();
            if (siguiente === 'recorrido') iniciarRecorrido();
            else if (siguiente === 'practica') practicar();
            else setBienvenida(false);
          }}
        />
      )}
      {recorrido && <Recorrido pasos={PASOS} onTerminar={terminarRecorrido} grande color="#0f5132" />}
    </RecorridoContext.Provider>
  );
}

export function useRecorrido(): RecorridoState {
  const ctx = useContext(RecorridoContext);
  if (!ctx) throw new Error('useRecorrido debe usarse dentro de RecorridoProvider');
  return ctx;
}
