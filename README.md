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

## Antes de arrancar: crea tu proyecto de Firebase

La base de datos es Firestore, y tanto desarrollo local como producción usan
**el mismo proyecto de Firebase** (no hay entorno de prueba separado). Como
todavía no existe, créalo una vez:

1. Ve a la [consola de Firebase](https://console.firebase.google.com), **Agregar proyecto**, dale un nombre (puedes desactivar Google Analytics, no se usa). Anota el **Project ID** que te asigna.
2. Dentro del proyecto: **Build → Firestore Database → Crear base de datos**, modo producción, elige una región (ej. `us-central1`).
3. **Configuración del proyecto** (ícono de engranaje) **→ Cuentas de servicio → Generar nueva clave privada**. Descarga el JSON y guárdalo **fuera de este repo** (ej. `C:\Users\tu-usuario\secrets\`) — nunca lo subas a git.
4. Actualiza `.firebaserc` en la raíz del repo: reemplaza `REEMPLAZA-CON-TU-PROJECT-ID` por tu Project ID real (deja los IDs de sitio de Hosting como están por ahora, se configuran en la sección de deploy).
5. Despliega las reglas e índices de Firestore que la API necesita (una vez, y de nuevo cada vez que cambie `firestore.indexes.json`):
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:indexes,firestore:rules
   ```
   Sin esto, las rutas de dashboard/reportes/mapa fallan con un error de "missing index" la primera vez que las uses.

## Arrancar en desarrollo

```bash
npm install
cp .env.example server/.env
```

Edita `server/.env` y apunta `GOOGLE_APPLICATION_CREDENTIALS` a la ruta donde
guardaste el JSON de la cuenta de servicio del paso anterior. Con eso:

```bash
npm run dev            # API + app del vendedor + admin, una sola terminal
npm run db:seed        # una vez: productos, vendedores, giros, deals de ejemplo
```

`npm run dev` no instala nada extra (todo es Node/npm). Como usas el mismo
proyecto que producción, ten presente que `db:seed` y cualquier prueba local
escriben datos reales — es idempotente (no duplica productos/vendedores si
lo corres de nuevo), pero visitas/prospectos que crees probando sí quedan ahí.

Los dos frontends usan un proxy de Vite hacia `/api` y `/uploads`, así que no necesitas configurar CORS en desarrollo.

### Alternativa offline: emulador de Firestore

Si prefieres desarrollar sin tocar datos reales (o sin conexión), usa el
emulador de Firestore en vez del proyecto real. Requiere **Java (JDK 11+)**
instalado además de Node — es lo único no-JS del proyecto (Windows:
`winget install EclipseAdoptium.Temurin.21.JDK`, luego reabre la terminal y
confirma con `java -version`).

En `server/.env`, comenta `GOOGLE_APPLICATION_CREDENTIALS` y descomenta
`FIRESTORE_EMULATOR_HOST`/`GCLOUD_PROJECT`. Luego:

```bash
npm run dev:emulator   # emulador + seed + API + apps, una sola terminal
```

Los datos del emulador viven solo en memoria: se pierden al detenerlo.

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

El proyecto está pensado para desplegarse como **dos sitios de Firebase Hosting** (vendedor y admin) más **una Cloud Function** (`api`, en `functions/`) que envuelve el mismo backend Express de `server/`. El proyecto de Firebase y Firestore ya deberían existir (ver "Antes de arrancar" arriba); esto es lo que falta para publicar la app:

1. **Crea los sitios de Hosting** (una vez):
   ```bash
   firebase hosting:sites:create tu-site-vendedor
   firebase hosting:sites:create tu-site-admin
   firebase target:apply hosting seller tu-site-vendedor
   firebase target:apply hosting admin tu-site-admin
   ```
   (`target:apply` actualiza `.firebaserc` con los IDs de sitio por ti).

2. **Configura las variables de entorno de la función** copiando `functions/.env.example` a `functions/.env` y completándolo. Lo único que cambia respecto al desarrollo local son las **fotos de visitas**: en local se guardan en `server/uploads`; en Cloud Functions se suben a Firebase Storage porque el filesystem no es persistente. Esto ya está resuelto en `server/src/storage.ts` (controlado por `STORAGE_DRIVER`, que `functions/src/index.ts` fuerza a `"firebase"`); solo necesitas definir `FIREBASE_STORAGE_BUCKET` en `functions/.env`. No definas `GOOGLE_APPLICATION_CREDENTIALS` aquí: en Cloud Functions el Admin SDK ya tiene acceso a Firestore del propio proyecto sin ninguna clave.

3. **Build y deploy**:
   ```bash
   npm run firebase:deploy   # build de server, apps y functions + firebase deploy
   ```
   O por partes: `npm run build`, `npm run build:functions`, luego `firebase deploy`.

`firebase.json` ya reescribe `/api/**` y `/uploads/**` hacia la función `api` en ambos sitios de Hosting, y todo lo demás cae a `index.html` (SPA). Como el frontend llama a rutas relativas (`/api/...`), no hace falta configurar CORS entre Hosting y la función; `CORS_ORIGINS` solo importa si llamas a la API desde otro dominio.

`firestore.rules` cierra Firestore a cualquier acceso directo desde el cliente (`allow read, write: if false`): toda la app pasa por la API, que usa el Admin SDK y por lo tanto ignora esas reglas.
