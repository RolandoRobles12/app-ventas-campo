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

Dentro de ese dominio, cada app resuelve el rol por separado, buscando el
correo de la cuenta de Google contra Firestore vía `GET /api/auth/me`:

- **App del vendedor**: se busca contra el campo `email` de los documentos de
  `vendedores` — si no hay un vendedor con ese correo, la app lo indica en vez
  de dejar pasar a nadie.
- **Panel de admin**: se busca contra la colección `usuarios` (doc id = email
  en minúsculas, `rol: 'admin'`). Sin un doc ahí, la cuenta entra a la app
  (pasa el login de Google) pero ve "Sin acceso al panel" en vez del panel —
  y el servidor (`requireAdmin` en `server/src/auth.ts`) rechaza con 403
  cualquier request a las rutas de admin aunque alguien le pegue directo a la
  API sin pasar por la UI. Los administradores se gestionan desde
  **Usuarios** dentro del propio admin (agregar/quitar por correo; no se
  puede quitar al último administrador).
  - Primer alta: como hace falta ser admin para entrar a "Usuarios", el
    primer administrador se siembra por variable de entorno
    `INITIAL_ADMIN_EMAILS` (lista separada por comas) — el servidor la
    aplica una vez al arrancar (`bootstrapInitialAdmins` en
    `server/src/auth.ts`) y, si alguien borra por error a esos correos desde
    la UI, se restauran en el siguiente arranque/deploy.

## Integraciones reales (no simuladas)

Copia `.env.example` a `server/.env` y completa:

- **DENUE (INEGI)** — `DENUE_TOKEN`. Sin él, "Rutas por vendedor → Generar ruta" muestra un aviso claro en vez de inventar prospectos; con el token, consulta el API real de INEGI (`Buscar` por giro, siempre con coordenadas+radio) y ordena los resultados por cercanía real (haversine).
- **Google Maps (Geocoding)** — `GOOGLE_MAPS_API_KEY` en `server/.env` (Geocoding API habilitada en Google Cloud). El DENUE no acepta texto libre de ubicación (solo entidad federativa o coordenadas+radio), así que la pestaña "Por municipio / colonia / C.P." de "Configurar ruta" geocodifica ese texto con Google antes de consultar el DENUE — funciona con cualquier combinación (solo C.P., solo colonia, solo ciudad, o varias) en cualquier parte del país. Sin esta variable, esa pestaña muestra un aviso y solo queda disponible "Por ubicación (GPS)" (lat/lng directo, sin geocodificar).
- **Google Maps (mapas visuales)** — `VITE_GOOGLE_MAPS_API_KEY` en `apps/admin/.env` **y** en `apps/seller/.env` (copia el `.env.example` de cada app; habilita **"Maps JavaScript API"** y **"Places API"** en el mismo proyecto de Google Cloud — puede ser la misma clave en ambas apps o una distinta por app, ambas restringidas por HTTP referrer a sus propios dominios). El loader (`loadGoogleMaps`) vive en `packages/ui` y lo comparten las dos apps; cada una lee su propia env var en tiempo de build. Es una clave expuesta en el navegador (normal para este uso) — protégela restringiéndola por HTTP referrer en Google Cloud Console a los dominios donde corre cada app, no ocultándola. Sin esta variable, las pantallas de mapa muestran un aviso en vez de un mapa en blanco. En el admin se usa en tres lugares:
  - El Mapa de Leads y el mapa de calor de Reportes (`GeoMap.tsx`) — mapas reales de Google en vez del lienzo de OpenStreetMap/Leaflet que traía el prototipo.
  - "Configurar ruta" → "Ciudad/Municipio" y "Colonia o C.P." son autocomplete real de Google Places (`PlaceAutocompleteInput.tsx`): hay que elegir una sugerencia de la lista, no solo escribir texto libre, así se manda la ubicación exacta en vez de volver a adivinarla en el servidor.
  - "Configurar ruta" → "Por ubicación (GPS)" y "Dibujar zona en el mapa" (`LocationPickerMap.tsx`) son mapas reales donde se hace clic para colocar el punto o dibujar el contorno — antes el modo GPS pedía lat/lng a mano y "dibujar zona" era una cuadrícula ilustrativa que ni siquiera se guardaba. La zona dibujada ahora sí se guarda (`zonaPoligono` en el vendedor), aunque por ahora es informativa: la búsqueda del DENUE sigue usando el punto+radio, no recorta por el polígono — avísame si quieres que también filtre por ahí.
- **HubSpot** — `HUBSPOT_TOKEN` (Private App con scopes `crm.objects.deals.read/write`, `crm.objects.companies.read`, `crm.objects.owners.read`, y **`crm.schemas.deals.read/write`** — estos dos últimos son indispensables para el campo "Service owner": sin ellos la propiedad personalizada `aviva_service_owner` no se puede crear en HubSpot y el campo nunca se guarda allá, aunque el token funcione para todo lo demás) y `HUBSPOT_PORTAL_ID`. Sin configurar, el CRM funciona con los deals locales y lo indica con un banner; con ellos, "Sincronizar" trae solo los deals reales del pipeline de "Nuevas visitas" (paginando todos los que haya, no solo los primeros 100) y los cambios en el drawer se escriben de vuelta a HubSpot.
  - El pipeline a sincronizar ya no se elige con una env var: `loadDealPipeline()` en `server/src/integrations/hubspot.ts` detecta automáticamente cuál pipeline de la cuenta tiene el stage "Aprobado" con el id fijado en `FUNNEL_STAGE_IDS`, y solo trae deals de ese pipeline (`GET /api/crm/pipelines` sigue existiendo para consultar ids si la pipeline se recrea en HubSpot y hay que actualizar esos ids).
  - Ese pipeline debe tener etapas (`stages`) llamadas exactamente (sin distinguir mayúsculas): `Documentos subidos`, `Documentos verificados`, `Aprobado`, `Contrato enviado`, `Desembolso`, `Rechazado`. Si no existen con esos nombres, los cambios de etapa hechos en el admin se guardan localmente pero **no se reflejan en HubSpot**. El resumen del funnel en la UI solo muestra 4 de esas 6 etapas (`Aprobado`, `Contrato enviado`, `Desembolso`, `Rechazado` — ver `FUNNEL_STAGE_LABELS`); las otras 2 siguen existiendo como pasos intermedios del deal.
- **aviva-hr** (directorio real de empleados) — `AVIVA_HR_PROJECT_ID`. Es otro proyecto de Firebase (no de este equipo), así que el servidor no tiene cuenta de servicio para él: lee su colección `users` vía la REST API pública de Firestore (`firestore.googleapis.com`), igual que hace [Ro-Bot-Web](https://github.com/RolandoRobles12/Ro-Bot-Web) contra el mismo proyecto — esto requiere que las reglas de Firestore de aviva-hr permitan lectura no autenticada de esa colección. Sin el project id, "Rutas por vendedor" muestra "No configurado" en vez de intentar sincronizar.
  - El botón **"Sincronizar desde aviva-hr"** en Rutas por vendedor trae usuarios con `status` `active` o `invited`, los empareja por email contra `vendedores` (crea los que falten con los giros por defecto de su producto; a los que ya existen les actualiza nombre/estado/producto sin tocar ciudad/colonia/giros, que siguen siendo manuales vía "Configurar ruta") y asigna el producto según su posición (`role`): `Promotor Aviva Tu Negocio` → Aviva Tu Negocio, `Promotor Aviva Tu Casa` → Aviva Construrama, cualquier posición que contenga "Marchand" → Aviva Casa Marchand. No requiere haber corrido `db:seed` antes: si el producto correspondiente no existe todavía en `productos`, la sincronización lo crea (mismo nombre/giros que usa el seed). Una posición que no matchee ninguna de esas reglas se omite (se reporta en la respuesta) en vez de crear un vendedor sin producto.

Ninguna de las integraciones genera datos falsos: si no están configuradas, la UI lo dice explícitamente en vez de simular.

## Decisiones fuera del mockup original

- **Login en la app móvil**: el diseño no incluía pantalla de login. Se agregó autenticación real con Google (`@avivacredito.com`); la app resuelve automáticamente qué vendedor eres por tu correo en vez de pedirte elegirlo de una lista.
- **Racha, metas y km recorridos** se calculan de datos reales (visitas y jornadas capturadas), no son valores fijos como en el prototipo.
- **Mapa de Leads / mapa de calor**: mapas reales de Google (`GeoMap.tsx`, ver "Integraciones reales" arriba). El Mapa de Leads coloca pines en sus coordenadas geográficas reales, y el mapa de calor de Reportes se alimenta de `/api/mapa/calor`: la ubicación GPS que la app del vendedor captura al registrar cada visita (con respaldo a las coordenadas DENUE del prospecto para visitas sin GPS).
- **Cómo llegar** abre Google Maps con la dirección o coordenadas reales del prospecto; el mini-mapa del formulario de visita (`apps/seller/src/components/MapPreview.tsx`) también es un mapa real de Google (Maps JavaScript API vía `@aviva/ui`, compartido con el admin) en vez del iframe de OpenStreetMap que traía el prototipo — requiere `VITE_GOOGLE_MAPS_API_KEY` en `apps/seller/.env` (copia `apps/seller/.env.example`), puede ser la misma clave que usa el admin.
- **Fotografía de evidencia obligatoria y solo-cámara real**: el prototipo tenía un botón "Tomar foto con la cámara" que en realidad era un `<input type="file" capture="environment">` — ese atributo es solo una sugerencia de UI, así que en varios navegadores/dispositivos igual ofrecía "elegir archivo" o la galería. Se reemplazó por una cámara en vivo dentro de la propia app (`getUserMedia` + `<video>` + captura a `<canvas>`, `apps/seller/src/components/CameraCapture.tsx`): nunca existe un selector de archivos, solo el stream de la cámara y un botón que congela el frame actual. Además, tanto la foto como el resultado de la visita ahora son obligatorios para guardar — se valida en el formulario (botón deshabilitado sin ambos) y también en el servidor (`POST /api/visitas` rechaza con 400 si falta la foto, aunque alguien le pegue directo a la API).

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

2. **Configura las variables de entorno de la función** copiando `functions/.env.example` a `functions/.env` y completándolo. Lo único que cambia respecto al desarrollo local son las **fotos de visitas**: en local se guardan en `server/uploads`; en Cloud Functions se suben a Firebase Storage porque el filesystem no es persistente. Esto ya está resuelto en `server/src/storage.ts` (controlado por `STORAGE_DRIVER`, que `functions/src/index.ts` fuerza a `"firebase"`); solo necesitas definir `STORAGE_BUCKET` en `functions/.env`. No definas `GOOGLE_APPLICATION_CREDENTIALS` aquí: en Cloud Functions el Admin SDK ya tiene acceso a Firestore del propio proyecto sin ninguna clave. Importante: no uses nombres de variable con prefijo `FIREBASE_`, `X_GOOGLE_` o `EXT_` en `functions/.env` — Firebase Functions los reserva para uso interno y rechaza cargar el archivo completo si aparece alguno (por eso es `STORAGE_BUCKET`, no `FIREBASE_STORAGE_BUCKET`).

3. **Build y deploy**:
   ```bash
   npm run firebase:deploy   # build de server, apps y functions + firebase deploy
   ```
   O por partes: `npm run build`, `npm run build:functions`, luego `firebase deploy`.

`firebase.json` ya reescribe `/api/**` y `/uploads/**` hacia la función `api` en ambos sitios de Hosting, y todo lo demás cae a `index.html` (SPA). Como el frontend llama a rutas relativas (`/api/...`), no hace falta configurar CORS entre Hosting y la función; `CORS_ORIGINS` solo importa si llamas a la API desde otro dominio.

`firestore.rules` cierra Firestore a cualquier acceso directo desde el cliente (`allow read, write: if false`): toda la app pasa por la API, que usa el Admin SDK y por lo tanto ignora esas reglas.
