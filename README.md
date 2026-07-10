# Aviva — Visitas de Campo

Implementación real (no prototipo) de los diseños en `project/` y las conversaciones en `chats/`: una **app web para vendedores de campo** y un **admin web de Visitas de Campo**, compartiendo un mismo backend/base de datos.

## Estructura

```
apps/seller   → App web del vendedor (React + Vite). Inicio (metas), Visitas, Jornada.
apps/admin    → Admin web (React + Vite). Rutas por vendedor, Dashboard, Mapa, Seguimiento, Reportes, CRM.
server        → API (Express + TypeScript + Prisma/SQLite). Integraciones reales de DENUE (INEGI) y HubSpot.
packages/ui   → Tokens de diseño compartidos (colores, tipografía) usados por ambas apps.
```

## Arrancar en desarrollo

```bash
npm install
npm run db:migrate   # crea/actualiza server/prisma/dev.db
npm run db:seed       # datos base: productos, vendedores, giros, deals de ejemplo

npm run dev:server    # API en http://localhost:4000
npm run dev:seller    # app del vendedor en http://localhost:5173
npm run dev:admin     # admin en http://localhost:5174
```

Los dos frontends usan un proxy de Vite hacia `/api` y `/uploads`, así que no necesitas configurar CORS en desarrollo.

## Integraciones reales (no simuladas)

Copia `.env.example` a `server/.env` y completa:

- **DENUE (INEGI)** — `DENUE_TOKEN`. Sin él, "Rutas por vendedor → Generar ruta" muestra un aviso claro en vez de inventar prospectos; con el token, consulta el API real de INEGI (`Buscar` por giro/municipio) y ordena los resultados por cercanía real (haversine) a la ciudad del vendedor.
- **HubSpot** — `HUBSPOT_TOKEN` (Private App con scopes `crm.objects.deals.read/write`, `crm.objects.companies.read`, `crm.objects.owners.read`) y `HUBSPOT_PORTAL_ID`. Sin ellos, el CRM funciona con los deals locales y lo indica con un banner; con ellos, "Sincronizar" trae deals reales de HubSpot y los cambios en el drawer se escriben de vuelta a HubSpot.

Ninguna de las dos integraciones genera datos falsos: si no están configuradas, la UI lo dice explícitamente en vez de simular.

## Decisiones fuera del mockup original

- **Selector de vendedor en la app móvil**: el diseño no incluía pantalla de login. Como el backend es real y multi-vendedor, se agregó una pantalla mínima "¿Quién eres?" (persistida en `localStorage`) para simular sesión sin construir un sistema de autenticación completo.
- **Racha, metas y km recorridos** se calculan de datos reales (visitas y jornadas capturadas), no son valores fijos como en el prototipo.
- **Mapa de Leads / mapa de calor**: se mantiene el lienzo ilustrado (calles/avenida/parque/río) del diseño, pero los pines se posicionan a partir de coordenadas reales de DENUE normalizadas al lienzo — no son posiciones inventadas.
- **Cómo llegar** abre Google Maps con la dirección o coordenadas reales del prospecto; el mini-mapa del formulario de visita usa OpenStreetMap embebido cuando hay coordenadas.

## Producción

```bash
npm run build   # compila server, apps/seller y apps/admin
```


