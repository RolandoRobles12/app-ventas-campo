-- CreateTable
CREATE TABLE "Producto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "esDeCampo" BOOLEAN NOT NULL DEFAULT false
);

-- CreateTable
CREATE TABLE "Giro" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "ProductoGiro" (
    "productoId" TEXT NOT NULL,
    "giroId" TEXT NOT NULL,

    PRIMARY KEY ("productoId", "giroId"),
    CONSTRAINT "ProductoGiro_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductoGiro_giroId_fkey" FOREIGN KEY ("giroId") REFERENCES "Giro" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Vendedor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nombre" TEXT NOT NULL,
    "iniciales" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "email" TEXT,
    "productoId" TEXT NOT NULL,
    "ciudad" TEXT NOT NULL,
    "colonia" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'Activo',
    "drawZone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Vendedor_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "VendedorGiro" (
    "vendedorId" TEXT NOT NULL,
    "giroId" TEXT NOT NULL,

    PRIMARY KEY ("vendedorId", "giroId"),
    CONSTRAINT "VendedorGiro_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "VendedorGiro_giroId_fkey" FOREIGN KEY ("giroId") REFERENCES "Giro" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Prospecto" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendedorId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "giro" TEXT,
    "distanciaKm" REAL,
    "lat" REAL,
    "lng" REAL,
    "origen" TEXT NOT NULL DEFAULT 'manual',
    "estado" TEXT NOT NULL DEFAULT 'por_visitar',
    "telefono" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Prospecto_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Visita" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "prospectoId" TEXT,
    "vendedorId" TEXT NOT NULL,
    "esNegocioNuevo" BOOLEAN NOT NULL DEFAULT false,
    "nombreNegocio" TEXT NOT NULL,
    "direccion" TEXT NOT NULL,
    "resultado" TEXT NOT NULL,
    "notas" TEXT,
    "fotoUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Visita_prospectoId_fkey" FOREIGN KEY ("prospectoId") REFERENCES "Prospecto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Visita_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Jornada" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendedorId" TEXT NOT NULL,
    "fecha" TEXT NOT NULL,
    "horaEntrada" TEXT,
    "horaSalidaComer" TEXT,
    "horaRegreso" TEXT,
    "horaSalida" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Jornada_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Meta" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendedorId" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "valorActual" REAL NOT NULL DEFAULT 0,
    "valorMeta" REAL NOT NULL,
    CONSTRAINT "Meta_vendedorId_fkey" FOREIGN KEY ("vendedorId") REFERENCES "Vendedor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CrmDeal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "hubspotDealId" TEXT,
    "cliente" TEXT NOT NULL,
    "negocio" TEXT NOT NULL,
    "productoId" TEXT,
    "etapa" TEXT NOT NULL DEFAULT 'Documentos subidos',
    "amount" REAL,
    "dealOwnerId" TEXT,
    "serviceOwner" TEXT,
    "source" TEXT NOT NULL DEFAULT 'local',
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CrmDeal_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "CrmDeal_dealOwnerId_fkey" FOREIGN KEY ("dealOwnerId") REFERENCES "Vendedor" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Producto_nombre_key" ON "Producto"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Giro_nombre_key" ON "Giro"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "Vendedor_email_key" ON "Vendedor"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Jornada_vendedorId_fecha_key" ON "Jornada"("vendedorId", "fecha");

-- CreateIndex
CREATE UNIQUE INDEX "Meta_vendedorId_tipo_periodo_key" ON "Meta"("vendedorId", "tipo", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "CrmDeal_hubspotDealId_key" ON "CrmDeal"("hubspotDealId");
