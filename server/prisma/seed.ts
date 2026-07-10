import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

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

async function main() {
  console.log('Seeding…');

  const giroRecords: Record<string, { id: string }> = {};
  for (const nombre of GIROS) {
    giroRecords[nombre] = await prisma.giro.upsert({ where: { nombre }, update: {}, create: { nombre } });
  }

  const productoRecords: Record<string, { id: string }> = {};
  for (const p of PRODUCTOS) {
    const rec = await prisma.producto.upsert({ where: { nombre: p.nombre }, update: { esDeCampo: p.esDeCampo }, create: p });
    productoRecords[p.nombre] = rec;
    const giros = GIROS_POR_PRODUCTO[p.nombre] ?? [];
    for (const g of giros) {
      await prisma.productoGiro.upsert({
        where: { productoId_giroId: { productoId: rec.id, giroId: giroRecords[g].id } },
        update: {},
        create: { productoId: rec.id, giroId: giroRecords[g].id },
      });
    }
  }

  const vendedorRecords: Record<string, { id: string }> = {};
  for (const v of VENDEDORES) {
    const rec = await prisma.vendedor.upsert({
      where: { email: v.email },
      update: {
        nombre: v.nombre, iniciales: v.iniciales, color: v.color,
        productoId: productoRecords[v.producto].id, ciudad: v.ciudad, colonia: v.colonia, estado: v.estado,
      },
      create: {
        nombre: v.nombre, iniciales: v.iniciales, color: v.color, email: v.email,
        productoId: productoRecords[v.producto].id, ciudad: v.ciudad, colonia: v.colonia, estado: v.estado,
      },
    });
    vendedorRecords[v.nombre] = rec;
    for (const g of v.giros) {
      await prisma.vendedorGiro.upsert({
        where: { vendedorId_giroId: { vendedorId: rec.id, giroId: giroRecords[g].id } },
        update: {},
        create: { vendedorId: rec.id, giroId: giroRecords[g].id },
      });
    }
  }

  // Prospectos + una visita ya hecha para Jorge Díaz (para poblar la lista de la app del vendedor)
  const jorge = vendedorRecords['Jorge Díaz'];
  const existingProspectos = await prisma.prospecto.count({ where: { vendedorId: jorge.id } });
  if (existingProspectos === 0) {
    for (const l of LEADS_JORGE) {
      await prisma.prospecto.create({
        data: {
          vendedorId: jorge.id, nombre: l.name, direccion: l.address, telefono: l.phone,
          distanciaKm: l.dist, giro: l.giro, origen: 'denue', estado: 'por_visitar',
        },
      });
    }
  }

  // Metas de ejemplo (hoy / este mes) por vendedor
  const today = new Date();
  const fechaHoy = today.toISOString().slice(0, 10);
  const fechaMes = today.toISOString().slice(0, 7);
  for (const nombre of Object.keys(vendedorRecords)) {
    const rec = vendedorRecords[nombre];
    await prisma.meta.upsert({
      where: { vendedorId_tipo_periodo: { vendedorId: rec.id, tipo: 'solicitudes_hoy', periodo: fechaHoy } },
      update: {},
      create: { vendedorId: rec.id, tipo: 'solicitudes_hoy', periodo: fechaHoy, valorActual: 2, valorMeta: 5 },
    });
    await prisma.meta.upsert({
      where: { vendedorId_tipo_periodo: { vendedorId: rec.id, tipo: 'colocacion_mes', periodo: fechaMes } },
      update: {},
      create: { vendedorId: rec.id, tipo: 'colocacion_mes', periodo: fechaMes, valorActual: 35000, valorMeta: 120000 },
    });
    await prisma.jornada.upsert({
      where: { vendedorId_fecha: { vendedorId: rec.id, fecha: fechaHoy } },
      update: {},
      create: { vendedorId: rec.id, fecha: fechaHoy, horaEntrada: '09:30', activa: true },
    });
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
  const existingDeals = await prisma.crmDeal.count();
  if (existingDeals === 0) {
    for (const d of crmSeed) {
      await prisma.crmDeal.create({
        data: {
          cliente: d.cliente, negocio: d.negocio, etapa: d.etapa, amount: d.amount, serviceOwner: d.service,
          productoId: productoRecords[d.producto].id, dealOwnerId: vendedorRecords[d.owner].id, source: 'local',
        },
      });
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
