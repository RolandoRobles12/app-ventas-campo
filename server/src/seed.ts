import 'dotenv/config';
import { db, Timestamp } from './db.js';
import { slugify } from './firestore-helpers.js';
import { hoyMx, sumarDias } from './fechas.js';
import { GIROS_DENUE } from './integrations/denue.js';
import { productoIdLocal } from './equipo.js';
import { negocioIdDe } from './negocios.js';

// Mismos productos que la base de colaboradores de aviva-recruiting (ver
// integrations/recruiting.ts y equipo.ts): id local + si es de campo.
const PRODUCTOS = [
  { nombre: 'Aviva tu Negocio', esDeCampo: true, giros: GIROS_DENUE },
  { nombre: 'Casa Marchand', esDeCampo: true, giros: ['Papelerías'] },
  { nombre: 'Construrama', esDeCampo: true, giros: ['Ferretería y tlapalería'] },
  { nombre: 'Bodega Aurrera', esDeCampo: false, giros: [] },
] as const;

const ruta = (etiqueta: string, lat: number, lng: number, giros: string[]) => ({
  zona: { etiqueta, lat, lng, radioMetros: 2000, poligonos: null }, giros, visitasPorDia: 8, dias: [1, 2, 3, 4, 5, 6], semanas: 1,
});

const VENDEDORES = [
  { nombre: 'Jorge Díaz', iniciales: 'JD', color: '#ef8b3e', producto: 'Aviva tu Negocio', zona: 'Tlaquepaque', estado: 'Activo', email: 'jorge.diaz@avivacredito.com', rutaConfig: ruta('Centro, Tlaquepaque, Jal.', 20.6409, -103.3117, ['Ferretería y tlapalería', 'Talleres mecánicos', 'Comercio de abarrotes']) },
  { nombre: 'Carlos Vega', iniciales: 'CV', color: '#0e8a8a', producto: 'Aviva tu Negocio', zona: 'Tonalá', estado: 'Baja', email: 'carlos.vega@avivacredito.com', rutaConfig: null },
  { nombre: 'Rolando Robles', iniciales: 'RR', color: '#22a36c', producto: 'Aviva tu Negocio', zona: 'Guadalajara', estado: 'Activo', email: 'rolando.robles@avivacredito.com', rutaConfig: ruta('Americana, Guadalajara, Jal.', 20.6736, -103.3634, ['Comercio de abarrotes', 'Restaurantes y alimentos', 'Estéticas y belleza']) },
  { nombre: 'Laura Sánchez', iniciales: 'LS', color: '#c96a1e', producto: 'Casa Marchand', zona: 'Zapopan', estado: 'Activo', email: 'laura.sanchez@avivacredito.com', rutaConfig: null },
  { nombre: 'María López', iniciales: 'ML', color: '#2a6fdb', producto: 'Casa Marchand', zona: 'Guadalajara', estado: 'Activo', email: 'maria.lopez@avivacredito.com', rutaConfig: null },
  { nombre: 'Miguel Soto', iniciales: 'MS', color: '#7a52c9', producto: 'Construrama', zona: 'Tlajomulco', estado: 'Activo', email: 'miguel.soto@avivacredito.com', rutaConfig: null },
  { nombre: 'Ana Ruiz', iniciales: 'AR', color: '#a855f7', producto: 'Construrama', zona: 'Zapopan', estado: 'Activo', email: 'ana.ruiz@avivacredito.com', rutaConfig: null },
];

const LEADS_JORGE = [
  { name: 'Ferretería La Palma', address: 'Av. Juárez 210, Col. Centro, Tlaquepaque', phone: '55 1234 5678', dist: 1.2, giro: 'Ferretería y tlapalería', lat: 20.6409, lng: -103.3117 },
  { name: 'Abarrotes Doña Mari', address: 'Calle 5 de Mayo 44, San Pedro, Tlaquepaque', phone: '55 2345 6789', dist: 2.8, giro: 'Comercio de abarrotes', lat: 20.6376, lng: -103.2996 },
  { name: 'Taller Mecánico El Güero', address: 'Blvd. Hidalgo 890, Industrial, Tlaquepaque', phone: '55 3456 7890', dist: 3.5, giro: 'Talleres mecánicos', lat: 20.6295, lng: -103.3208 },
  { name: 'Papelería Escolar Sol', address: 'Av. Reforma 122, Las Flores, Tlaquepaque', phone: '55 4567 8901', dist: 4.1, giro: 'Ferretería y tlapalería', lat: 20.6488, lng: -103.3062 },
];

// Visitas de demostración con GPS para poblar el mapa de calor en el emulador.
// Puntos alrededor de la zona de cada vendedor en la ZMG.
const VISITAS_DEMO: { vendedor: string; negocio: string; resultado: string; lat: number; lng: number }[] = [
  { vendedor: 'Jorge Díaz', negocio: 'Ferretería La Palma', resultado: 'Se realizó solicitud', lat: 20.6409, lng: -103.3117 },
  { vendedor: 'Jorge Díaz', negocio: 'Abarrotes Doña Mari', resultado: 'Se dejó información', lat: 20.6376, lng: -103.2996 },
  { vendedor: 'Jorge Díaz', negocio: 'Taller El Güero', resultado: 'Cliente no interesado', lat: 20.6295, lng: -103.3208 },
  { vendedor: 'Jorge Díaz', negocio: 'Miscelánea San Pedro', resultado: 'Se realizó solicitud', lat: 20.6402, lng: -103.3101 },
  { vendedor: 'Jorge Díaz', negocio: 'Abarrotes El Centro', resultado: 'Se dejó información', lat: 20.6415, lng: -103.3128 },
  { vendedor: 'Rolando Robles', negocio: 'Café La Americana', resultado: 'Se realizó solicitud', lat: 20.6736, lng: -103.3634 },
  { vendedor: 'Rolando Robles', negocio: 'Estética Bella', resultado: 'Se dejó información', lat: 20.6712, lng: -103.3679 },
  { vendedor: 'Rolando Robles', negocio: 'Abarrotes Chapultepec', resultado: 'Se realizó solicitud', lat: 20.6748, lng: -103.3618 },
  { vendedor: 'Laura Sánchez', negocio: 'Papelería Zapopan Centro', resultado: 'Se realizó solicitud', lat: 20.7214, lng: -103.3918 },
  { vendedor: 'Laura Sánchez', negocio: 'Papelería El Estudiante', resultado: 'Se reagenda visita', lat: 20.7239, lng: -103.3887 },
  { vendedor: 'María López', negocio: 'Papelería Catedral', resultado: 'Se dejó información', lat: 20.6767, lng: -103.3475 },
  { vendedor: 'Miguel Soto', negocio: 'Construrama del Valle', resultado: 'Se realizó solicitud', lat: 20.4737, lng: -103.4459 },
];

async function upsertVendedor(v: (typeof VENDEDORES)[number], productoId: string): Promise<string> {
  const existing = await db.collection('vendedores').where('email', '==', v.email).limit(1).get();
  const data = {
    nombre: v.nombre, iniciales: v.iniciales, color: v.color, email: v.email,
    productoId, zona: v.zona, ciudad: v.zona, estado: v.estado,
    giros: v.rutaConfig?.giros ?? [], rutaConfig: v.rutaConfig,
    ...(v.estado === 'Baja' ? { bajaEn: Timestamp.now(), bajaMotivo: 'Baja en la base de colaboradores' } : {}),
  };
  if (!existing.empty) {
    const id = existing.docs[0].id;
    await db.collection('vendedores').doc(id).update(data);
    return id;
  }
  const ref = await db.collection('vendedores').add({ ...data, createdAt: Timestamp.now() });
  return ref.id;
}

async function main() {
  console.log('Seeding…');

  const giroRecords: Record<string, string> = {};
  for (const nombre of GIROS_DENUE) {
    const id = slugify(nombre);
    await db.collection('giros').doc(id).set({ nombre }, { merge: true });
    giroRecords[nombre] = id;
  }

  const productoRecords: Record<string, string> = {};
  for (const p of PRODUCTOS) {
    const id = productoIdLocal(p.nombre);
    await db.collection('productos').doc(id).set({ nombre: p.nombre, esDeCampo: p.esDeCampo, giros: p.giros, origen: 'recruiting' }, { merge: true });
    productoRecords[p.nombre] = id;
  }

  const vendedorRecords: Record<string, string> = {};
  for (const v of VENDEDORES) {
    vendedorRecords[v.nombre] = await upsertVendedor(v, productoRecords[v.producto]);
  }

  // Demo: Rolando Robles también tiene acceso de admin al panel, para poder
  // probar "Usuarios" localmente sin tener que configurar INITIAL_ADMIN_EMAILS.
  await db.collection('usuarios').doc('rolando.robles@avivacredito.com').set(
    { email: 'rolando.robles@avivacredito.com', nombre: 'Rolando Robles', rol: 'admin', createdAt: Timestamp.now() },
    { merge: true },
  );

  // Prospectos + una visita ya hecha para Jorge Díaz (para poblar la lista de la app del vendedor)
  const jorgeId = vendedorRecords['Jorge Díaz'];
  const existingProspectos = await db.collection('prospectos').where('vendedorId', '==', jorgeId).count().get();
  if (existingProspectos.data().count === 0) {
    const batch = db.batch();
    // Dos paradas hoy y dos mañana, como las dejaría el planeador de rutas.
    const hoy = hoyMx();
    LEADS_JORGE.forEach((l, i) => {
      const ref = db.collection('prospectos').doc();
      batch.set(ref, {
        vendedorId: jorgeId, negocioId: negocioIdDe({ nombre: l.name, direccion: l.address }),
        nombre: l.name, direccion: l.address, telefono: l.phone,
        distanciaKm: l.dist, giro: l.giro, origen: 'denue', estado: 'por_visitar',
        lat: l.lat, lng: l.lng, fechaPlan: sumarDias(hoy, i < 2 ? 0 : 1), orden: (i % 2) + 1,
        createdAt: Timestamp.now(),
      });
    });
    await batch.commit();
  }

  // Visitas de demo con ubicación GPS (solo si aún no hay visitas), para el mapa de calor
  const existingVisitas = await db.collection('visitas').count().get();
  if (existingVisitas.data().count === 0) {
    const batch = db.batch();
    for (const v of VISITAS_DEMO) {
      const ref = db.collection('visitas').doc();
      const hace = new Date();
      hace.setDate(hace.getDate() - Math.floor(Math.random() * 7));
      batch.set(ref, {
        vendedorId: vendedorRecords[v.vendedor], prospectoId: null, esNegocioNuevo: true,
        nombreNegocio: v.negocio, direccion: 'Zona metropolitana de Guadalajara', resultado: v.resultado,
        notas: null, fotos: [], lat: v.lat, lng: v.lng, gpsAccuracy: 12,
        createdAt: Timestamp.fromDate(hace),
      });
    }
    await batch.commit();
  }

  // Recorrido de ejemplo (puntos GPS de hoy, cada ~5 min) para poder probar
  // "Ver recorrido" en Seguimiento sin esperar a que la app real mande
  // pings: traza una ruta interpolando entre las paradas conocidas de cada
  // vendedor en VISITAS_DEMO.
  const existingUbicaciones = await db.collection('ubicaciones').count().get();
  if (existingUbicaciones.data().count === 0) {
    const paradasPorVendedor = new Map<string, { lat: number; lng: number }[]>();
    for (const v of VISITAS_DEMO) {
      const lista = paradasPorVendedor.get(v.vendedor) ?? [];
      lista.push({ lat: v.lat, lng: v.lng });
      paradasPorVendedor.set(v.vendedor, lista);
    }
    const inicio = new Date();
    inicio.setHours(9, 30, 0, 0);
    const batch = db.batch();
    for (const [nombre, paradas] of paradasPorVendedor) {
      const id = vendedorRecords[nombre];
      if (!id) continue;
      let minuto = 0;
      for (let i = 0; i < paradas.length; i++) {
        const desde = paradas[i];
        const hasta = paradas[Math.min(i + 1, paradas.length - 1)];
        const pasos = i < paradas.length - 1 ? 3 : 1;
        for (let s = 0; s < pasos; s++) {
          const t = pasos > 1 ? s / pasos : 0;
          const ref = db.collection('ubicaciones').doc();
          batch.set(ref, {
            vendedorId: id, lat: desde.lat + (hasta.lat - desde.lat) * t, lng: desde.lng + (hasta.lng - desde.lng) * t,
            accuracy: 15, createdAt: Timestamp.fromDate(new Date(inicio.getTime() + minuto * 60000)),
          });
          minuto += 5;
        }
      }
    }
    await batch.commit();
  }

  console.log('Seed complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
