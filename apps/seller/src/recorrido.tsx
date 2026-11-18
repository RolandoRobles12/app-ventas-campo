import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Recorrido, type PasoRecorrido } from '@aviva/ui';
import { api, type Vendedor } from './api';
import { Bienvenida } from './components/Bienvenida';
import { NOVEDADES_VERSION, Novedades } from './components/Novedades';

// Onboarding del vendedor: la primera vez que entra ve la bienvenida (para
// qué sirve la app) y desde ahí puede hacer el recorrido guiado por su
// pantalla o practicar una visita que no se guarda. Todo se puede volver a
// ver desde el menú de su cuenta (tocando sus iniciales).

interface RecorridoState {
  verBienvenida: () => void;
  verNovedades: () => void;
  iniciarRecorrido: () => void;
  practicar: () => void;
}

const RecorridoContext = createContext<RecorridoState | null>(null);

const llaveVisto = (vendedorId: string) => `aviva.onboarding.${vendedorId}`;

const llaveNovedades = (vendedorId: string) => `aviva.novedades.${vendedorId}`;
function novedadesEnEsteTelefono(vendedorId: string): string | null {
  try { return localStorage.getItem(llaveNovedades(vendedorId)); } catch { return null; }
}

function vistoEnEsteTelefono(vendedorId: string): boolean {
  try {
    return localStorage.getItem(llaveVisto(vendedorId)) === '1';
  } catch {
    return false;
  }
}

const bienvenidaInicial = (v: Vendedor) => !v.onboardingVisto && !vistoEnEsteTelefono(v.id);

const PASOS: PasoRecorrido[] = [
  { objetivo: 'avance', titulo: 'Tu meta del día', texto: 'Aquí ves cuántas visitas llevas y cuántas te faltan. Si tu líder te pide negocios nuevos, ves dos barras: tu ruta y los nuevos (una no cubre a la otra). Si cumples varios días seguidos, sumas a tu racha 🔥.' },
  { objetivo: 'avisos', titulo: 'Avisos de tus citas', texto: 'Actívalos y te recordamos tus citas a las 9 am, 1 hora y 30 minutos antes de cada una.' },
  { objetivo: 'sin-ligar', titulo: 'Solicitudes sin ligar', texto: 'Cuando marcas "Hizo solicitud" y la solicitud todavía no aparecía, aquí te la recordamos para que elijas cuál es. Si no hubo solicitud, corrige el resultado aquí mismo.' },
  { objetivo: 'sin-visita', titulo: 'Solicitudes sin visita', texto: 'Si hiciste una solicitud pero marcaste otro resultado en la visita, aquí te preguntamos de qué visita es para corregirla.' },
  { objetivo: 'siguiente', titulo: 'Tu siguiente parada', texto: 'Es el negocio más cercano (o tu próxima cita). "Cómo llegar" te muestra el camino en el mapa; cuando estés ahí, toca "Registrar visita".' },
  { objetivo: 'vistas', titulo: 'Tu ruta y tus llamadas', texto: 'En "Llamar" están los negocios con teléfono. Llama antes de ir: si agendas una cita, aparece en tu ruta ese día y a esa hora.' },
  { objetivo: 'lista', titulo: 'El resto de tu día', texto: 'Toca cualquier negocio para registrar su visita. Van del más cercano al más lejano; los de otros días están más abajo.' },
  { objetivo: 'nuevo', titulo: '¿Un negocio fuera de tu ruta?', texto: 'Si visitas uno que no está en tu lista, regístralo aquí. Cuenta como negocio nuevo, salvo que ya fuera de alguien. Si te pide volver otro día, queda en tu ruta.' },
  { objetivo: 'conexion', titulo: 'Funciona sin señal', texto: 'Si no hay internet, lo que registras se guarda en el teléfono y se envía solo. "Al día" significa que ya se envió todo.' },
  { objetivo: 'nav-mapa', titulo: 'Mapa', texto: 'Ve todas tus paradas en el mapa para planear por dónde empezar. Las zonas en rojo son donde no puedes visitar negocios.' },
  { objetivo: 'nav-historial', titulo: 'Historial', texto: 'Revisa lo que registraste y cómo vas en la semana.' },
  { objetivo: 'cuenta', titulo: 'Tu cuenta', texto: 'Toca tus iniciales para volver a ver esta guía, practicar una visita o cerrar sesión.' },
];

export function RecorridoProvider({ vendedor, children }: { vendedor: Vendedor; children: ReactNode }) {
  const navigate = useNavigate();
  const [bienvenida, setBienvenida] = useState(() => bienvenidaInicial(vendedor));
  const [recorrido, setRecorrido] = useState(false);
  // Quien ya había visto la bienvenida ve una vez lo que cambió.
  const [novedades, setNovedades] = useState(() => !bienvenidaInicial(vendedor)
    && vendedor.novedadesVistas !== NOVEDADES_VERSION && novedadesEnEsteTelefono(vendedor.id) !== NOVEDADES_VERSION);
  const marcarNovedades = useCallback(() => {
    try { localStorage.setItem(llaveNovedades(vendedor.id), NOVEDADES_VERSION); } catch { /* sin espacio */ }
    if (vendedor.novedadesVistas !== NOVEDADES_VERSION) api.marcarNovedades(NOVEDADES_VERSION).catch(() => {});
  }, [vendedor]);

  // Si la vio sin señal, el servidor no se enteró: se le avisa en cuanto se pueda.
  useEffect(() => {
    if (!vendedor.onboardingVisto && vistoEnEsteTelefono(vendedor.id)) api.marcarOnboarding().catch(() => {});
  }, [vendedor]);

  // La bienvenida ya incluye todo lo nuevo: quien la ve no necesita las novedades.
  const marcarVisto = useCallback(() => {
    try { localStorage.setItem(llaveVisto(vendedor.id), '1'); } catch { /* sin espacio: solo se pierde el recordatorio */ }
    if (!vendedor.onboardingVisto) api.marcarOnboarding().catch(() => {});
    marcarNovedades();
  }, [vendedor, marcarNovedades]);

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
    <RecorridoContext.Provider value={{ verBienvenida: () => setBienvenida(true), verNovedades: () => setNovedades(true), iniciarRecorrido, practicar }}>
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
      {novedades && !bienvenida && (
        <Novedades
          onCerrar={() => { marcarNovedades(); setNovedades(false); }}
          onRecorrido={() => { marcarNovedades(); setNovedades(false); iniciarRecorrido(); }}
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
