import 'dotenv/config';
import { db, Timestamp } from './db.js';
import { slugify } from './firestore-helpers.js';

const PRODUCTOS = [
  { nombre: 'Aviva Contigo', esDeCampo: false },
  { nombre: 'Aviva Tu Negocio', esDeCampo: true },
  { nombre: 'Aviva Tu Compra', esDeCampo: false },
  { nombre: 'Aviva Casa Marchand', esDeCampo: true },
  { nombre: 'Aviva Construrama', esDeCampo: true },
];

const GIROS = [
  'Comercio de abarrotes',
  'Ferretería y tlapalería',
  'Papelerías',
  'Restaurantes y alimentos',
  'Talleres mecánicos',
  'Estéticas y belleza',
  'Farmacias',
];

// giros allowed per producto de campo
const GIROS_POR_PRODUCTO: Record<string, string[]> = {
  'Aviva Tu Negocio': GIROS,
  'Aviva Casa Marchand': ['Papelerías'],
  'Aviva Construrama': [],
};

const VENDEDORES = [
  { nombre: 'Jorge Díaz', iniciales: 'JD', color: '#ef8b3e', producto: 'Aviva Tu Negocio', ciudad: 'Tlaquepaque', colonia: 'Centro', giros: ['Ferretería y tlapalería', 'Talleres mecánicos', 'Comercio de abarrotes'], estado: 'Activo', email: 'jorge.diaz@avivacredito.com' },
  { nombre: 'Carlos Vega', iniciales: 'CV', color: '#0e8a8a', producto: 'Aviva Tu Negocio', ciudad: 'Tonalá', colonia: 'Centro', giros: ['Ferretería y tlapalería', 'Comercio de abarrotes', 'Farmacias'], estado: 'Pausado', email: 'carlos.vega@avivacredito.com' },
  { nombre: 'Rolando Robles', iniciales: 'RR', color: '#22a36c', producto: 'Aviva Tu Negocio', ciudad: 'Guadalajara', colonia: 'Americana', giros: ['Comercio de abarrotes', 'Restaurantes y alimentos', 'Estéticas y belleza'], estado: 'Activo', email: 'rolando.robles@avivacredito.com' },
  { nombre: 'Laura Sánchez', iniciales: 'LS', color: '#c96a1e', producto: 'Aviva Casa Marchand', ciudad: 'Zapopan', colonia: 'Centro', giros: ['Papelerías'], estado: 'Activo', email: 'laura.sanchez@avivacredito.com' },
  { nombre: 'María López', iniciales: 'ML', color: '#2a6fdb', producto: 'Aviva Casa Marchand', ciudad: 'Guadalajara', colonia: 'Centro', giros: ['Papelerías'], estado: 'Activo', email: 'maria.lopez@avivacredito.com' },
  { nombre: 'Miguel Soto', iniciales: 'MS', color: '#7a52c9', producto: 'Aviva Construrama', ciudad: 'Tlajomulco', colonia: 'Centro', giros: [], estado: 'Activo', email: 'miguel.soto@avivacredito.com' },
  { nombre: 'Ana Ruiz', iniciales: 'AR', color: '#a855f7', producto: 'Aviva Construrama', ciudad: 'Zapopan', colonia: 'Centro', giros: [], estado: 'Activo', email: 'ana.ruiz@avivacredito.com' },
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
    productoId, ciudad: v.ciudad, colonia: v.colonia, estado: v.estado,
    drawZone: false, giros: v.giros,
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
  for (const nombre of GIROS) {
    const id = slugify(nombre);
    await db.collection('giros').doc(id).set({ nombre }, { merge: true });
    giroRecords[nombre] = id;
  }

  const productoRecords: Record<string, string> = {};
  for (const p of PRODUCTOS) {
    const id = slugify(p.nombre);
    const giros = GIROS_POR_PRODUCTO[p.nombre] ?? [];
    await db.collection('productos').doc(id).set({ nombre: p.nombre, esDeCampo: p.esDeCampo, giros }, { merge: true });
    productoRecords[p.nombre] = id;
  }

  const vendedorRecords: Record<string, string> = {};
  for (const v of VENDEDORES) {
    vendedorRecords[v.nombre] = await upsertVendedor(v, productoRecords[v.producto]);
  }

  // Prospectos + una visita ya hecha para Jorge Díaz (para poblar la lista de la app del vendedor)
  const jorgeId = vendedorRecords['Jorge Díaz'];
  const existingProspectos = await db.collection('prospectos').where('vendedorId', '==', jorgeId).count().get();
  if (existingProspectos.data().count === 0) {
    const batch = db.batch();
    for (const l of LEADS_JORGE) {
      const ref = db.collection('prospectos').doc();
      batch.set(ref, {
        vendedorId: jorgeId, nombre: l.name, direccion: l.address, telefono: l.phone,
        distanciaKm: l.dist, giro: l.giro, origen: 'denue', estado: 'por_visitar',
        lat: l.lat, lng: l.lng, createdAt: Timestamp.now(),
      });
    }
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
        notas: null, fotoUrl: null, lat: v.lat, lng: v.lng, gpsAccuracy: 12,
        createdAt: Timestamp.fromDate(hace),
      });
    }
    await batch.commit();
  }

  // Metas de ejemplo por vendedor (solicitudes/día y venta/mes)
  const today = new Date();
  const fechaHoy = today.toISOString().slice(0, 10);
  for (const nombre of Object.keys(vendedorRecords)) {
    const id = vendedorRecords[nombre];
    await db.collection('vendedores').doc(id).set({
      metaSolicitudesDia: 5, metaVentaMes: 120000,
    }, { merge: true });
    await db.collection('jornadas').doc(`${id}_${fechaHoy}`).set({
      vendedorId: id, fecha: fechaHoy, horaEntrada: '09:30', horaSalidaComer: null, horaRegreso: null,
      horaSalida: null, activa: true, createdAt: Timestamp.now(),
    }, { merge: true });
  }

  // CRM deals de ejemplo (local, no vinculados a HubSpot hasta que se sincronice)
  const crmSeed = [
    { cliente: 'Luis Hernández', negocio: 'Ferretería La Palma', producto: 'Aviva Tu Negocio', etapa: 'Contrato enviado', amount: 18000, owner: 'Jorge Díaz', service: 'Paola Ríos' },
    { cliente: 'Marta Gómez', negocio: 'Abarrotes Doña Mari', producto: 'Aviva Tu Negocio', etapa: 'Documentos verificados', amount: 9500, owner: 'Rolando Robles', service: 'Iván Torres' },
    { cliente: 'Pedro Ramos', negocio: 'Taller El Güero', producto: 'Aviva Tu Negocio', etapa: 'Documentos subidos', amount: 15000, owner: 'Carlos Vega', service: 'Gabriela Mora' },
    { cliente: 'Sofía Cruz', negocio: 'Papelería Sol', producto: 'Aviva Casa Marchand', etapa: 'Desembolso', amount: 6000, owner: 'Laura Sánchez', service: 'Paola Ríos' },
    { cliente: 'Diego Núñez', negocio: 'Papelería El Estudiante', producto: 'Aviva Casa Marchand', etapa: 'Aprobado', amount: 12500, owner: 'María López', service: 'Iván Torres' },
    { cliente: 'Elena Vargas', negocio: 'Construrama del Valle', producto: 'Aviva Construrama', etapa: 'Rechazado', amount: 4000, owner: 'Miguel Soto', service: 'Gabriela Mora' },
    { cliente: 'Raúl Mendoza', negocio: 'Estética Bella', producto: 'Aviva Tu Negocio', etapa: 'Documentos subidos', amount: 8000, owner: 'Rolando Robles', service: 'Sergio Lara' },
  ];
  const existingDeals = await db.collection('crmDeals').count().get();
  if (existingDeals.data().count === 0) {
    const batch = db.batch();
    for (const d of crmSeed) {
      const ref = db.collection('crmDeals').doc();
      batch.set(ref, {
        cliente: d.cliente, negocio: d.negocio, etapa: d.etapa, amount: d.amount, serviceOwner: d.service,
        productoId: productoRecords[d.producto], dealOwnerId: vendedorRecords[d.owner], source: 'local',
        hubspotDealId: null, hubspotOwnerId: null, hubspotCompanyId: null, dealOwnerLabel: null,
        lastSyncedAt: null, createdAt: Timestamp.now(),
      });
    }
    await batch.commit();
  }

  console.log('Seed complete.');
}

main().catch((e) => { console.error(e); process.exit(1); });
