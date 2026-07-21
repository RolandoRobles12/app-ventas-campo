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

1. Ve a la [consola de Firebase](https://console.firebase.google.com), **Agregar proyecto**, dale un nombre (puedes desactivar Google Analytics, no se usa). Anota el **Project ID** que te asigna. Registra ahí mismo una "app web" (sin marcar Hosting, eso ya está configurado en `firebase.json`) para obtener el `firebaseConfig` — ya está cargado en `packages/ui/src/firebase.ts`, no hace falta tocarlo salvo que cambies de proyecto.
2. Dentro del proyecto: **Build → Firestore Database → Crear base de datos**, modo producción, elige una región (ej. `us-central1`).
3. **Build → Authentication → Comenzar → Google** (habilita el proveedor). Solo se usa login con Google, restringido a cuentas `@avivacredito.com` (se valida tanto en el cliente como en el servidor); no hace falta crear usuarios a mano, cualquiera con esa cuenta de correo puede entrar.
4. **Configuración del proyecto** (ícono de engranaje) **→ Cuentas de servicio → Generar nueva clave privada**. Descarga el JSON y guárdalo **fuera de este repo** (ej. `C:\Users\tu-usuario\secrets\`) — nunca lo subas a git.
5. Actualiza `.firebaserc` en la raíz del repo: reemplaza `REEMPLAZA-CON-TU-PROJECT-ID` por tu Project ID real (deja los IDs de sitio de Hosting como están por ahora, se configuran en la sección de deploy).
6. Despliega las reglas e índices de Firestore que la API necesita (una vez, y de nuevo cada vez que cambie `firestore.indexes.json`):
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

## Autenticación

Ambas apps (vendedor y admin) requieren iniciar sesión con Google, restringido
a cuentas `@avivacredito.com` (`packages/ui/src/auth.tsx`). El backend verifica
cada request con el Admin SDK (`server/src/auth.ts`) y rechaza cualquier token
inválido o de otro dominio — la restricción del cliente (`hd` en el selector
de cuentas de Google) es solo UX, la que cuenta es la del servidor.

En la app del vendedor no hay un rol "admin" separado: cualquier cuenta
`@avivacredito.com` puede entrar al admin web. Para la app del vendedor, el
correo de la cuenta de Google se busca contra el campo `email` de los
documentos de `vendedores` en Firestore (`GET /api/auth/me`) — si no hay un
vendedor con ese correo, la app lo indica en vez de dejar pasar a nadie.

## Integraciones reales (no simuladas)

Copia `.env.example` a `server/.env` y completa:

- **DENUE (INEGI)** — `DENUE_TOKEN`. Sin él, "Rutas por vendedor → Generar ruta" muestra un aviso claro en vez de inventar prospectos; con el token, consulta el API real de INEGI (`Buscar` por giro, siempre con coordenadas+radio) y ordena los resultados por cercanía real (haversine).
- **Google Maps (Geocoding)** — `GOOGLE_MAPS_API_KEY` (Geocoding API habilitada en Google Cloud). El DENUE no acepta texto libre de ubicación (solo entidad federativa o coordenadas+radio), así que la pestaña "Por municipio / colonia / C.P." de "Configurar ruta" geocodifica ese texto con Google antes de consultar el DENUE — funciona con cualquier combinación (solo C.P., solo colonia, solo ciudad, o varias) en cualquier parte del país. Sin esta variable, esa pestaña muestra un aviso y solo queda disponible "Por ubicación (GPS)" (lat/lng directo, sin geocodificar).
- **HubSpot** — `HUBSPOT_TOKEN` (Private App con scopes `crm.objects.deals.read/write`, `crm.objects.companies.read`, `crm.objects.owners.read`, y **`crm.schemas.deals.read/write`** — estos dos últimos son indispensables para el campo "Service owner": sin ellos la propiedad personalizada `aviva_service_owner` no se puede crear en HubSpot y el campo nunca se guarda allá, aunque el token funcione para todo lo demás) y `HUBSPOT_PORTAL_ID`. Sin configurar, el CRM funciona con los deals locales y lo indica con un banner; con ellos, "Sincronizar" trae deals reales de HubSpot (paginando todos los que haya, no solo los primeros 100) y los cambios en el drawer se escriben de vuelta a HubSpot.
  - Si tu cuenta de HubSpot tiene **más de un pipeline de deals**, fija `HUBSPOT_PIPELINE_ID` (`GET /api/crm/pipelines` lista los disponibles con su ID); si no lo defines, se usa el primero que devuelva la API, lo cual solo es correcto si hay un único pipeline.
  - Ese pipeline debe tener etapas (`stages`) llamadas exactamente (sin distinguir mayúsculas): `Documentos subidos`, `Documentos verificados`, `Aprobado`, `Contrato enviado`, `Desembolso`, `Rechazado`. Si no existen con esos nombres, los cambios de etapa hechos en el admin se guardan localmente pero **no se reflejan en HubSpot**.
- **aviva-hr** (directorio real de empleados) — `AVIVA_HR_PROJECT_ID`. Es otro proyecto de Firebase (no de este equipo), así que el servidor no tiene cuenta de servicio para él: lee su colección `users` vía la REST API pública de Firestore (`firestore.googleapis.com`), igual que hace [Ro-Bot-Web](https://github.com/RolandoRobles12/Ro-Bot-Web) contra el mismo proyecto — esto requiere que las reglas de Firestore de aviva-hr permitan lectura no autenticada de esa colección. Sin el project id, "Rutas por vendedor" muestra "No configurado" en vez de intentar sincronizar.
  - El botón **"Sincronizar desde aviva-hr"** en Rutas por vendedor trae usuarios con `status` `active` o `invited`, los empareja por email contra `vendedores` (crea los que falten con los giros por defecto de su producto; a los que ya existen les actualiza nombre/estado/producto sin tocar ciudad/colonia/giros, que siguen siendo manuales vía "Configurar ruta") y asigna el producto según su posición (`role`): `Promotor Aviva Tu Negocio` → Aviva Tu Negocio, `Promotor Aviva Tu Casa` → Aviva Construrama, cualquier posición que contenga "Marchand" → Aviva Casa Marchand. No requiere haber corrido `db:seed` antes: si el producto correspondiente no existe todavía en `productos`, la sincronización lo crea (mismo nombre/giros que usa el seed). Una posición que no matchee ninguna de esas reglas se omite (se reporta en la respuesta) en vez de crear un vendedor sin producto.

Ninguna de las integraciones genera datos falsos: si no están configuradas, la UI lo dice explícitamente en vez de simular.

## Decisiones fuera del mockup original

- **Login en la app móvil**: el diseño no incluía pantalla de login. Se agregó autenticación real con Google (`@avivacredito.com`); la app resuelve automáticamente qué vendedor eres por tu correo en vez de pedirte elegirlo de una lista.
- **Racha, metas y km recorridos** se calculan de datos reales (visitas y jornadas capturadas), no son valores fijos como en el prototipo.
- **Mapa de Leads / mapa de calor**: mapas reales con Leaflet + OpenStreetMap (sin clave de API). El Mapa de Leads coloca pines en sus coordenadas geográficas reales, y el mapa de calor de Reportes se alimenta de `/api/mapa/calor`: la ubicación GPS que la app del vendedor captura al registrar cada visita (con respaldo a las coordenadas DENUE del prospecto para visitas sin GPS).
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
