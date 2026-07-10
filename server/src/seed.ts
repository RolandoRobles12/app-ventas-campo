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
  { name: 'Ferretería La Palma', address: 'Av. Juárez 210, Col. Centro, Tlaquepaque', phone: '55 1234 5678', dist: 1.2, giro: 'Ferretería y tlapalería' },
  { name: 'Abarrotes Doña Mari', address: 'Calle 5 de Mayo 44, San Pedro, Tlaquepaque', phone: '55 2345 6789', dist: 2.8, giro: 'Comercio de abarrotes' },
  { name: 'Taller Mecánico El Güero', address: 'Blvd. Hidalgo 890, Industrial, Tlaquepaque', phone: '55 3456 7890', dist: 3.5, giro: 'Talleres mecánicos' },
  { name: 'Papelería Escolar Sol', address: 'Av. Reforma 122, Las Flores, Tlaquepaque', phone: '55 4567 8901', dist: 4.1, giro: 'Ferretería y tlapalería' },
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
        distanciaKm: l.dist, giro: l.giro, origen: 'denue', estado: 'por_visitar', createdAt: Timestamp.now(),
      });
    }
    await batch.commit();
  }

  // Metas de ejemplo (hoy / este mes) por vendedor
  const today = new Date();
  const fechaHoy = today.toISOString().slice(0, 10);
  const fechaMes = today.toISOString().slice(0, 7);
  for (const nombre of Object.keys(vendedorRecords)) {
    const id = vendedorRecords[nombre];
    await db.collection('metas').doc(`${id}_solicitudes_hoy_${fechaHoy}`).set({
      vendedorId: id, tipo: 'solicitudes_hoy', periodo: fechaHoy, valorActual: 2, valorMeta: 5,
    }, { merge: true });
    await db.collection('metas').doc(`${id}_colocacion_mes_${fechaMes}`).set({
      vendedorId: id, tipo: 'colocacion_mes', periodo: fechaMes, valorActual: 35000, valorMeta: 120000,
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
