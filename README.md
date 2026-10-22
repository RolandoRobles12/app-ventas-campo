# Aviva — Visitas de Campo

Implementación real (no prototipo) de una **app web para vendedores de campo** y un **admin web de Visitas de Campo**, compartiendo un mismo backend/base de datos.

## Estructura

```
apps/seller   → App del vendedor (React + Vite, pensada para tablets Android). Mi ruta, Mapa, Historial y el registro de visita.
apps/admin    → Admin web (React + Vite, para laptop/PC). Resumen, En vivo, Visitas, Rutas (planeador), Equipo, Administradores.
server        → API (Express + TypeScript + Firestore). Integraciones reales de DENUE (INEGI), Google Maps y la base de colaboradores de aviva-recruiting.
packages/ui   → Tokens de diseño compartidos (colores, tipografía), login y cargador de Google Maps usados por ambas apps.
functions     → Cloud Functions: `api` (envuelve `server`) y la sincronización programada del equipo.
```

## Antes de arrancar: crea tu proyecto de Firebase

La base de datos es Firestore, y tanto desarrollo local como producción usan
**el mismo proyecto de Firebase** (no hay entorno de prueba separado). Como
todavía no existe, créalo una vez:

1. Ve a la [consola de Firebase](https://console.firebase.google.com), **Agregar proyecto**, dale un nombre (puedes desactivar Google Analytics, no se usa). Anota el **Project ID** que te asigna. Registra ahí mismo una "app web" (sin marcar Hosting, eso ya está configurado en `firebase.json`) para obtener el `firebaseConfig` — ya está cargado en `packages/ui/src/firebase.ts`, no hace falta tocarlo salvo que cambies de proyecto.
2. Dentro del proyecto: **Build → Firestore Database → Crear base de datos**, modo producción, elige una región (ej. `us-central1`).
3. **Build → Authentication → Comenzar → Google** (habilita el proveedor). Solo se usa login con Google, restringido a cuentas `@avivacredito.com` (se valida tanto en el cliente como en el servidor); no hace falta crear usuarios a mano, cualquiera con esa cuenta de correo puede entrar.
4. **Build → Storage → Comenzar** (modo producción, misma región que Firestore). Aquí es donde la app del vendedor sube las fotos de evidencia directo desde el navegador (ver `storage.rules`).
5. **Configuración del proyecto** (ícono de engranaje) **→ Cuentas de servicio → Generar nueva clave privada**. Descarga el JSON y guárdalo **fuera de este repo** (ej. `C:\Users\tu-usuario\secrets\`) — nunca lo subas a git.
6. Actualiza `.firebaserc` en la raíz del repo: reemplaza `REEMPLAZA-CON-TU-PROJECT-ID` por tu Project ID real (deja los IDs de sitio de Hosting como están por ahora, se configuran en la sección de deploy).
7. Despliega las reglas e índices que la API necesita (una vez, y de nuevo cada vez que cambien):
   ```bash
   npx firebase-tools login
   npx firebase-tools deploy --only firestore:indexes,firestore:rules,storage
   ```
   Sin las reglas/índices de Firestore, el Resumen, las Rutas y la lista del vendedor fallan con un error de "missing index" la primera vez que las uses (este cambio agregó índices nuevos para `prospectos`: vuelve a desplegarlos). Sin las reglas de Storage, subir fotos de visita falla con un error de permisos aunque el login sea correcto.

## Arrancar en desarrollo

```bash
npm install
cp .env.example server/.env
```

Edita `server/.env` y apunta `GOOGLE_APPLICATION_CREDENTIALS` a la ruta donde
guardaste el JSON de la cuenta de servicio del paso anterior. Con eso:

```bash
npm run dev            # API + app del vendedor + admin, una sola terminal
npm run db:seed        # una vez: productos, vendedores, giros y una ruta de ejemplo
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
  de dejar pasar a nadie. Un vendedor con `estado: 'Baja'` (ver "Equipo"
  abajo) tampoco entra, y el servidor le rechaza cualquier registro.
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

- **Base de colaboradores de aviva-recruiting** (altas y bajas del equipo) — ver la sección "Equipo: base de colaboradores" abajo.
- **DENUE (INEGI)** — `DENUE_TOKEN`. Es de donde salen los negocios de cada ruta. Sin él, el planeador de "Rutas" muestra un aviso claro en vez de inventar prospectos; con el token, consulta el API real de INEGI (`Buscar` por giro, siempre con coordenadas+radio, máximo 5 km).
- **Google Maps (Geocoding)** — `GOOGLE_MAPS_API_KEY` en `server/.env` (Geocoding API habilitada en Google Cloud). Solo hace falta si el admin escribe una zona sin elegir una sugerencia del buscador: el servidor geocodifica ese texto antes de consultar el DENUE (el DENUE no acepta texto libre de ubicación). Elegir una sugerencia o hacer clic en el mapa no la necesita.
- **Google Maps (mapas visuales)** — `VITE_GOOGLE_MAPS_API_KEY` en `apps/admin/.env` **y** en `apps/seller/.env` (copia el `.env.example` de cada app; habilita **"Maps JavaScript API"** y **"Places API"**; puede ser la misma clave, restringida por HTTP referrer a los dominios de cada app). El loader (`loadGoogleMaps`) vive en `packages/ui`. Sin esta variable, las pantallas de mapa muestran un aviso en vez de un mapa en blanco. Se usa en:
  - Admin: el mapa del planeador de rutas (`PlannerMap.tsx`: centro y radio de búsqueda, zonas dibujadas a mano, vista previa por día), el buscador de zona (`PlaceAutocompleteInput.tsx`), "En vivo" y el mapa de calor/rutas GPS de "Visitas" (`GeoMap.tsx`).
  - App del vendedor: solo la pestaña "Mapa" (se carga al abrirla; es lo más pesado para una tablet de gama baja). "Cómo llegar" abre Google Maps con la dirección o coordenadas del negocio y no necesita la clave.

Ninguna de las integraciones genera datos falsos: si no están configuradas, la UI lo dice explícitamente en vez de simular.

### Equipo: base de colaboradores (aviva-recruiting)

Los vendedores ya no salen de aviva-hr: salen de la **base de colaboradores de
Aviva Comercial Hub** ([aviva-recruiting](https://github.com/RolandoRobles12/aviva-recruiting)).
Allá, la colección `colaboradores` del proyecto de Firebase `aviva-recruiting`
es una copia de la hoja "Colaboradores" que su función `syncColaboradores`
actualiza a las 12:00 y 19:00 (id del documento = correo corporativo). Nunca
borra a nadie: una baja queda con `estatusApp: 'Baja'` (o `'Baja programada'`
con `fechaBajaIso`), y quien deja de aparecer en la hoja queda con
`presente: false`. El producto no se guarda: se calcula del puesto con
`productoDePuesto()` (`src/utils/productoDePuesto.ts` allá); la copia de esa
función está en `server/src/integrations/recruiting.ts` y **hay que mantenerla
igual** si allá cambian las reglas.

Cómo se refleja aquí (`server/src/equipo.ts`):

- Cada colaborador activo cuyo producto está marcado "de campo" en **Equipo →
  Productos de campo** (por defecto Aviva tu Negocio, Construrama y Casa
  Marchand) es un vendedor. Si no existe, se crea (alta); si existe, se le
  actualizan nombre, producto, puesto, zona, tienda y hub manager.
- Un vendedor cuyo colaborador ya no está activo (baja, fecha de baja
  cumplida, o ya no aparece) o que se cambió a un puesto que no es de campo
  queda con `estado: 'Baja'`: ya no entra a la app y deja de aparecer en
  Rutas/En vivo. No se borra nada; sus negocios pendientes se pueden pasar a
  otro vendedor desde **Equipo → Bajas → Reasignar**. Si vuelve a estar
  activo, se reactiva solo.
- Una "Baja programada" sigue activa hasta su fecha. Un puesto vacío en la
  hoja no basta para dar de baja a nadie. Un vendedor sin colaborador en la
  base (alta manual o de prueba) no se toca.
- Freno de seguridad: si una corrida daría de baja a más del 30% de los
  activos (mínimo 5), se detiene sin escribir nada y el admin decide en
  "Equipo" si la aplica de todos modos.
- Corre sola a las 7:30, 12:30 y 19:30 (hora de México; función
  `sincronizarEquipoProgramado` en `functions/src/index.ts`) y con el botón
  **Sincronizar ahora** de "Equipo".

Configuración (en `server/.env` y `functions/.env`):

- `RECRUITING_PROJECT_ID=aviva-recruiting`. Sin él, "Equipo" muestra "No configurado".
- Permiso de lectura: las reglas de Firestore de aviva-recruiting no dejan
  leer `colaboradores` desde fuera, así que el servidor lee con el Admin SDK y
  necesita el rol **Cloud Datastore Viewer** (`roles/datastore.viewer`) en el
  proyecto `aviva-recruiting`. Lo tiene que otorgar alguien con permisos de
  IAM en ese proyecto:
  ```bash
  # Cuenta de servicio con la que corre la Cloud Function `api` (por defecto,
  # la de Compute Engine del proyecto app-campo-aviva; confírmala en la consola
  # de Cloud Functions → api → Detalles → Cuenta de servicio):
  gcloud projects add-iam-policy-binding aviva-recruiting \
    --member="serviceAccount:816682987350-compute@developer.gserviceaccount.com" \
    --role="roles/datastore.viewer"
  ```
  En desarrollo local se usa la cuenta de `GOOGLE_APPLICATION_CREDENTIALS`,
  que necesita el mismo rol. Como alternativa a otorgar IAM, se puede poner en
  `RECRUITING_SERVICE_ACCOUNT` el JSON (o su base64) de una cuenta de servicio
  del propio proyecto aviva-recruiting que tenga ese rol.

## Cómo está pensada cada app

### App del vendedor (tablets Android de gama baja, todo el día en campo)

- **Solo visitas y rutas.** Se quitaron las metas de solicitudes y colocación (venían de HubSpot); el avance del día se mide en visitas contra las paradas que el admin le planeó para hoy.
- **Tres pestañas**: *Mi ruta* (pantalla principal), *Mapa* e *Historial*. Al registrar una visita la barra de abajo se oculta: es una tarea de pantalla completa.
- **Mi ruta**: avance del día (visitas de hoy contra la meta, racha de días seguidos), la **siguiente parada** (la más cercana según su GPS, con "Cómo llegar" y "Registrar visita" a un toque), el resto de las paradas de hoy ordenadas por cercanía (las atrasadas marcadas), las visitadas hoy y los próximos días plegados por si termina antes. En una tablet acostada se reparte en dos columnas.
- **Registrar visita** en una sola pantalla con botón fijo abajo: resultado con botones grandes y texto corto ("Hizo solicitud", "Volver otro día"…; se guarda el mismo valor de siempre), foto obligatoria con la cámara en vivo, notas con frases rápidas. Avisa si el vendedor está a más de 50 m del negocio (la visita no quedaría "verificada" en el admin). "Volver otro día" pide la fecha y regresa el negocio a su ruta ese día en vez de cerrarlo.
- Después de guardar, la pantalla de éxito ofrece **"Ir a la siguiente"** (la parada más cercana que queda), para encadenar visitas sin volver a la lista.
- **Sin señal** funciona igual: la ruta y el avance se guardan en la tablet, las visitas (con fotos) se encolan en IndexedDB y se envían solas; la cabecera muestra "Al día" o "N por enviar". La sesión también se recuerda para abrir la app sin señal.
- **Rendimiento**: colores sólidos y sombras chicas, Google Maps solo en la pestaña Mapa, fotos reducidas a 1280 px antes de subir y una sola lectura de GPS compartida (cada minuto con la app visible; el punto del recorrido se manda cada 5 min, como antes).

### Admin (laptop/PC)

- **Resumen**: indicadores del periodo (visitas vs periodo anterior, cumplimiento de ruta, visitas por vendedor al día, % de visitas verificadas por GPS, vendedores con visitas), visitas por día, resultado de las visitas, un bloque de **"Requiere atención"** (sin ruta, ruta por acabarse, paradas atrasadas, sin visitas, pocas verificadas) y el desempeño por vendedor ordenable.
- **En vivo**: dónde está cada vendedor hoy, visitas contra lo planeado, última visita y quién no ha empezado; al elegir a uno se ve su recorrido GPS del día. Se actualiza cada minuto.
- **Visitas**: el registro de cada visita con fotos, mapa de calor y rutas GPS, y **exportación a CSV** (Excel).
- **Rutas**: estado de la ruta de cada vendedor (sin ruta / se acaba pronto / con ruta) y el **planeador**: zona (buscador, clic en el mapa o zonas dibujadas), giros y ritmo (visitas por día, días de trabajo, duración) → **Generar ruta**. El servidor trae los negocios del DENUE, quita los que ya trae otro vendedor del mismo producto o que se visitaron en los últimos 90 días, los ordena en un recorrido corto (vecino más cercano + 2-opt) y los reparte por día (`fechaPlan` + número de parada). La vista previa se puede editar antes de publicar. La configuración se guarda, así que **Renovar** (uno o varios vendedores a la vez) arma el siguiente periodo con un clic.
- **Equipo**: conexión con la base de colaboradores, productos de campo (y qué giros busca cada uno) y vendedores activos/bajas.
- Se quitaron *Dashboard*, *Mapa de Leads*, *Seguimiento* y *Reportes* (su contenido quedó en Resumen, En vivo y Visitas) y *CRM · Prospectos* junto con la integración de HubSpot (ya estaba apagada por costos). La colección `crmDeals` se queda en Firestore tal cual.

### Decisiones que se conservan

- **Login con Google** (`@avivacredito.com`); la app resuelve qué vendedor eres por tu correo.
- **Foto de evidencia obligatoria y solo-cámara real** (`getUserMedia`, nunca un selector de archivos), hasta 5 por visita (`MAX_FOTOS` en la app y `MAX_FOTOS_POR_VISITA` en `server/src/routes/visitas.ts`, que es quien lo hace cumplir). Las fotos se suben directo a Firebase Storage (ver "Despliegue").
- **"En ruta"** se infiere de un ping de ubicación de los últimos 20 minutos (no hay "jornada" que iniciar).
- **Fechas en hora de México**: "hoy", los rangos del admin y las fechas de plan se calculan en `America/Mexico_City` (`server/src/fechas.ts`), no en la hora del servidor (UTC en Cloud Functions).

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

2. **Configura las variables de entorno de la función** copiando `functions/.env.example` a `functions/.env` y completándolo. No definas `GOOGLE_APPLICATION_CREDENTIALS` aquí: en Cloud Functions el Admin SDK ya tiene acceso a Firestore del propio proyecto sin ninguna clave. Importante: no uses nombres de variable con prefijo `FIREBASE_`, `X_GOOGLE_` o `EXT_` en `functions/.env` — Firebase Functions los reserva para uso interno y rechaza cargar el archivo completo si aparece alguno.

3. **Despliega las reglas de Storage** (una vez, y de nuevo si cambia `storage.rules`): `npx firebase-tools deploy --only storage`.

4. **Build y deploy**:
   ```bash
   npm run firebase:deploy   # build de server, apps y functions + firebase deploy
   ```
   O por partes: `npm run build`, `npm run build:functions`, luego `firebase deploy`.

   El primer deploy después de quitar HubSpot va a avisar que la función programada `syncHubspotDealsScheduled` ya no está en el código y preguntar si se borra: sí (o `firebase functions:delete syncHubspotDealsScheduled`). Despliega también los índices nuevos de `firestore.indexes.json` (`--only firestore:indexes`) antes de usar Rutas y la app del vendedor.

`firebase.json` ya reescribe `/api/**` hacia la función `api` en ambos sitios de Hosting, y todo lo demás cae a `index.html` (SPA). Como el frontend llama a rutas relativas (`/api/...`), no hace falta configurar CORS entre Hosting y la función; `CORS_ORIGINS` solo importa si llamas a la API desde otro dominio. Las fotos de visitas **no** pasan por ese rewrite: la app del vendedor las sube directo a Firebase Storage con el SDK cliente (`apps/seller/src/uploadFotos.ts`, reglas en `storage.rules`) y la función solo recibe las URLs resultantes — esto evita el límite fijo de 10 MB por request que Firebase Hosting impone a cualquier request reescrita hacia una función, sin importar el límite que configure el propio servidor.

`firestore.rules` cierra Firestore a cualquier acceso directo desde el cliente (`allow read, write: if false`): toda la app pasa por la API, que usa el Admin SDK y por lo tanto ignora esas reglas.
