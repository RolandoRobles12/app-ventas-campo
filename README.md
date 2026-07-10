# Aviva — Visitas de Campo

Implementación real (no prototipo) de una **app web para vendedores de campo** y un **admin web de Visitas de Campo**, compartiendo un mismo backend/base de datos.

## Estructura

```
apps/seller   → App web del vendedor (React + Vite). Inicio (metas), Visitas, Jornada.
apps/admin    → Admin web (React + Vite). Rutas por vendedor, Dashboard, Mapa, Seguimiento, Reportes, CRM.
server        → API (Express + TypeScript + Firestore). Integraciones reales de DENUE (INEGI) y HubSpot.
packages/ui   → Tokens de diseño compartidos (colores, tipografía) usados por ambas apps.
functions     → Cloud Function que envuelve `server` para desplegarlo en Firebase.
```

## Arrancar en desarrollo

La base de datos es Firestore. En local se usa el **emulador de Firestore**
(no necesitas un proyecto de Firebase real ni credenciales para desarrollar):

```bash
npm install
cp .env.example server/.env   # ya trae FIRESTORE_EMULATOR_HOST/GCLOUD_PROJECT

npm run emulators      # levanta el emulador de Firestore en :8080 (UI en :4200)
npm run db:seed        # datos base: productos, vendedores, giros, deals de ejemplo

npm run dev:server     # API en http://localhost:4000
npm run dev:seller     # app del vendedor en http://localhost:5173
npm run dev:admin      # admin en http://localhost:5174
```

`npm run emulators` y `npm run db:seed`/`npm run dev:server` van en terminales
distintas; mientras el emulador esté corriendo, los datos viven solo en memoria
(se pierden al detenerlo — vuelve a correr `db:seed`).

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

## Despliegue en Firebase

El proyecto está pensado para desplegarse como **dos sitios de Firebase Hosting** (vendedor y admin) más **una Cloud Function** (`api`, en `functions/`) que envuelve el mismo backend Express de `server/`.

1. **Crea el proyecto y los sitios de Hosting** (una vez):
   ```bash
   firebase projects:create tu-project-id
   firebase hosting:sites:create tu-site-vendedor
   firebase hosting:sites:create tu-site-admin
   firebase target:apply hosting seller tu-site-vendedor
   firebase target:apply hosting admin tu-site-admin
   ```
   Actualiza `.firebaserc` con tu `project-id` y los IDs de sitio (el comando `target:apply` lo hace por ti).

2. **Habilita Firestore** en el proyecto (modo nativo, no Datastore) desde la consola de Firebase o con `firebase firestore:databases:create '(default)' --location <región>`. No hay que provisionar ninguna base externa: la Cloud Function usa el Admin SDK, que ya tiene acceso a Firestore del mismo proyecto sin configuración adicional.

3. **Configura las variables de entorno de la función** copiando `functions/.env.example` a `functions/.env` y completándolo. Lo único que cambia respecto al desarrollo local son las **fotos de visitas**: en local se guardan en `server/uploads`; en Cloud Functions se suben a Firebase Storage porque el filesystem no es persistente. Esto ya está resuelto en `server/src/storage.ts` (controlado por `STORAGE_DRIVER`, que `functions/src/index.ts` fuerza a `"firebase"`); solo necesitas definir `FIREBASE_STORAGE_BUCKET` en `functions/.env`.

4. **Despliega los índices compuestos de Firestore** que usan las rutas de reportes/dashboard/mapa (`firestore.indexes.json`):
   ```bash
   firebase deploy --only firestore:indexes,firestore:rules
   ```

5. **Build y deploy**:
   ```bash
   npm run firebase:deploy   # build de server, apps y functions + firebase deploy
   ```
   O por partes: `npm run build`, `npm run build:functions`, luego `firebase deploy`.

`firebase.json` ya reescribe `/api/**` y `/uploads/**` hacia la función `api` en ambos sitios de Hosting, y todo lo demás cae a `index.html` (SPA). Como el frontend llama a rutas relativas (`/api/...`), no hace falta configurar CORS entre Hosting y la función; `CORS_ORIGINS` solo importa si llamas a la API desde otro dominio.

`firestore.rules` cierra Firestore a cualquier acceso directo desde el cliente (`allow read, write: if false`): toda la app pasa por la API, que usa el Admin SDK y por lo tanto ignora esas reglas.
