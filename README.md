# Aviva — Visitas de Campo

Implementación real (no prototipo) de una **app web para vendedores de campo** y un **admin web de Visitas de Campo**, compartiendo un mismo backend/base de datos.

## Estructura

```
apps/seller   → App del vendedor (React + Vite, pensada para tablets Android). Mi ruta, Mapa, Historial y el registro de visita.
apps/admin    → Admin web (React + Vite, para laptop/PC). Tablero, En vivo, Visitas, Rutas (planeador), Equipo, Administradores.
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
   Sin las reglas/índices de Firestore, el Tablero, las Rutas y la lista del vendedor fallan con un error de "missing index" la primera vez que las uses (este cambio agregó índices nuevos para `prospectos`: vuelve a desplegarlos). Sin las reglas de Storage, subir fotos de visita falla con un error de permisos aunque el login sea correcto.

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
- **HubSpot (solo lectura)** — `HUBSPOT_TOKEN` en `server/.env` y en `functions/.env`: token de una Private App con `crm.objects.deals.read` y `crm.objects.owners.read`. Lo usa solo el Tablero para confirmar solicitudes y su aprobación (ver "Admin" abajo). Sin él, el Tablero lo avisa y muestra las solicitudes marcadas en campo sin confirmar.
- **DENUE (INEGI)** — `DENUE_TOKEN`. Es de donde salen los negocios de cada ruta. Sin él, el planeador de "Rutas" muestra un aviso claro en vez de inventar prospectos; con el token, consulta el API real de INEGI (`Buscar` por giro, siempre con coordenadas+radio, máximo 5 km).
- **Google Maps (Geocoding)** — `GOOGLE_MAPS_API_KEY` en `server/.env` (Geocoding API habilitada en Google Cloud). Solo hace falta si el admin escribe una zona sin elegir una sugerencia del buscador: el servidor geocodifica ese texto antes de consultar el DENUE (el DENUE no acepta texto libre de ubicación). Elegir una sugerencia o hacer clic en el mapa no la necesita.
- **Avisos de citas (Firebase Cloud Messaging)** — `VITE_FIREBASE_VAPID_KEY` en `apps/seller/.env`: la clave pública de Firebase Console → Configuración del proyecto → Cloud Messaging → *Certificados de push web* (*Generar par de claves*). No es secreta. Sin ella la app no ofrece activar los avisos. El envío lo hace la función `recordatoriosDeCitas` con la cuenta de servicio de Functions (necesita la *Firebase Cloud Messaging API (V1)* habilitada, que viene así en proyectos de Firebase). Solo funcionan en el build de producción (el service worker no se registra en `npm run dev`).
- **Google Maps (mapas visuales)** — `VITE_GOOGLE_MAPS_API_KEY` en `apps/admin/.env` **y** en `apps/seller/.env` (copia el `.env.example` de cada app; habilita **"Maps JavaScript API"** y **"Places API"**; puede ser la misma clave, restringida por HTTP referrer a los dominios de cada app). El loader (`loadGoogleMaps`) vive en `packages/ui`. Sin esta variable, las pantallas de mapa muestran un aviso en vez de un mapa en blanco. Se usa en:
  - Admin: el mapa del planeador de rutas (`PlannerMap.tsx`: centro y radio de búsqueda, zonas dibujadas a mano, vista previa por día), el buscador de zona (`PlaceAutocompleteInput.tsx`), "En vivo" y el mapa de calor/rutas GPS de "Visitas" (`GeoMap.tsx`).
  - App del vendedor: la pestaña "Mapa" y **"Cómo llegar"** (se cargan al abrirlas; es lo más pesado para una tablet de gama baja). "Cómo llegar" se queda dentro de la app: traza la ruta por calles (a pie o en auto) con el `DirectionsService` de la Maps JavaScript API, así que la clave de la app del vendedor necesita además **"Directions API"** habilitada. Sin ella (o sin señal) dibuja una línea recta al negocio; solo si el mapa no carga ofrece abrir Google Maps como último recurso.

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
  queda con `estado: 'Baja'`: ya no entra a la app y deja de aparecer en el
  admin (Equipo, Rutas, En vivo, filtros). Las bajas no se gestionan aquí: se
  gestionan en aviva-recruiting. No se borra nada (sus visitas siguen en el
  historial) y sus pendientes dejan de bloquear esos negocios para el
  planeador. Si vuelve a estar activo, se reactiva solo.
- Un vendedor que **no aparece en la base** (p. ej. las altas de antes de esta integración, de aviva-hr) o que no tiene correo también queda con `estado: 'Baja'` (*No aparece en la base de colaboradores*): solo es activo quien la base dice. Su historial se conserva y, si después aparece, se reactiva solo. La primera corrida con esta regla puede rebasar el freno de abajo; el admin ve la lista y la aplica con *Aplicar de todos modos*.
- **Vendedores de prueba** (*Equipo → Vendedores de prueba*): un admin se da de alta con su propio correo (aunque esté en la base con un puesto que no es de campo) para usar la app del vendedor en producción. La sincronización no los toca; no cuentan en Tablero, En vivo, Visitas, Llamadas ni mapas salvo que se elijan en el filtro de vendedores (`resolveVendedorIds`); no les apartan negocios a los vendedores reales en el planeador ni cuentan como "ya era de alguien"; la app muestra *MODO PRUEBA*. *Borrar* elimina el vendedor y todo lo que registró (visitas, ruta, llamadas, ubicaciones, fotos). Sus solicitudes de HubSpot salen del usuario de HubSpot de ese correo. Ver `server/src/prueba.ts`.
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
- **Meta de negocios nuevos**: si su líder le pidió encontrar negocios en la calle (*De ellas, negocios nuevos que encuentre él* en el planeador), la tarjeta de meta se parte en dos barras, *De tu ruta* y *Negocios nuevos* (con un botón para registrar uno). Las visitas de ruta de más no cubren los nuevos que falten, ni al revés. Un "negocio nuevo" que en realidad ya estaba en la ruta de alguien o se visitó en los últimos 90 días se guarda, pero no cuenta: la pantalla de éxito se lo dice (`server/src/duplicados.ts` lo detecta por `negocioId` o por nombre parecido a 80 m o menos).
- **Zonas donde no puede ir**: las marca su líder. Se ven en rojo en el *Mapa*; si está dentro, *Mi ruta* lo avisa y no puede registrar visitas ahí (en el borde, con GPS impreciso, solo se advierte). Se guardan en la tablet para que el bloqueo funcione sin señal, y el servidor aplica la misma regla.
- **Tres pestañas**: *Mi ruta* (pantalla principal), *Mapa* e *Historial*. Al registrar una visita la barra de abajo se oculta: es una tarea de pantalla completa.
- **Mi ruta**: avance del día (visitas de hoy contra la meta, racha de días seguidos), la **siguiente parada** (la más cercana según su GPS, con "Cómo llegar" y "Registrar visita" a un toque), el resto de las paradas de hoy ordenadas por cercanía (las atrasadas marcadas), las visitadas hoy y los próximos días plegados por si termina antes. En una tablet acostada se reparte en dos columnas.
- **Visitado antes**: al abrir un negocio, la tablet muestra las últimas visitas que recibió (fecha, resultado, nota y quién fue: "Tú" u otro vendedor, aunque ya no esté activo). Se baja junto con la ruta para lo de hoy, mañana y lo atrasado, así que también se ve sin señal.
- **Registrar visita** en una sola pantalla con botón fijo abajo: resultado con botones grandes y texto corto ("Hizo solicitud", "Volver otro día"…; se guarda el mismo valor de siempre), foto obligatoria con la cámara en vivo, notas con frases rápidas. "Volver otro día" pide la fecha y regresa el negocio a su ruta ese día en vez de cerrarlo; también vale para un **negocio nuevo**, que entra a su ruta ese día con la ubicación donde lo encontró (y aparece en *Llamar* si tiene teléfono).
- **Cerco**: un negocio con ubicación conocida (del DENUE o registrado en la calle) solo se registra estando a la distancia que fija el admin en *Equipo → Registro de visitas* (150 m por defecto) y con un GPS así de preciso. Lejos, la app dice a cuántos metros está y ofrece *Cómo llegar* o **"El negocio está en otro lugar"**: se registra desde ahí y su ubicación llega a *Visitas* para que el líder la acepte (el negocio se mueve a ese punto en todas las rutas) o la descarte. *Cerrado o no existe* se registra desde donde sea, y un negocio sin ubicación se registra sin comprobar. El servidor aplica la misma regla; una visita que llega desde la cola sin señal fuera del cerco no se rechaza (se perdería): entra marcada.
- **Atribución de solicitudes**: al marcar *Hizo solicitud*, la app muestra las solicitudes de HubSpot del vendedor creadas hoy (la más reciente primero, con *Actualizar*) y él elige cuál es la de ese negocio. Una solicitud solo se liga a una visita. Si todavía no aparece (HubSpot a veces tarda) elige *Todavía no aparece*, y si no hay señal o HubSpot no responde se guarda igual: la visita queda **sin ligar** y se resuelve después, lo que pase primero:
  - *Mi ruta* le recuerda las que tiene sin ligar (de los últimos 3 días) y las liga desde ahí;
  - la función `ligarSolicitudesPendientes` (cada 15 min) la liga sola con la solicitud libre del vendedor creada más cerca de la hora de la visita (de 30 min antes a 12 h después).
  
  El Tablero cuenta solo las solicitudes ligadas (aunque se hayan creado horas después); la ventana de ±30 min solo se usa para las visitas de antes de este cambio. Ver `server/src/solicitudes.ts`.
- **Tipificación incorrecta**: si marcó *Hizo solicitud* y no la hubo, la corrige desde el recordatorio de *Mi ruta* (*No hizo solicitud: me equivoqué de resultado*). Si hizo la solicitud pero marcó otro resultado, la función `ligarSolicitudesPendientes` la detecta como **solicitud sin visita** (de ayer u hoy, con 20 min de gracia) y *Mi ruta* le pregunta de qué visita es: al elegirla, la visita pasa a *Hizo solicitud* y se liga; si no fue en una visita, la descarta. Se guarda el resultado original (`resultadoOriginal`); el admin lo ve en Visitas y el Tablero cuenta las visitas corregidas por vendedor. En la app del vendedor no se menciona HubSpot: solo "solicitudes".
- **Avisos de citas** (notificaciones push, en la app instalada y en Chrome): a las 9:00 el resumen de las citas del día y un aviso 60 y 30 minutos antes de cada una (al tocarlo abre *Cómo llegar*). La app los ofrece una vez ("Activar avisos"; se puede posponer) y, si se bloquearon, explica cómo permitirlos desde su menú. Los manda la función programada `recordatoriosDeCitas` cada 5 minutos (`server/src/recordatorios.ts`); cada aviso se manda una sola vez (`recordatoriosEnviados`).
- **Llamar y armar la agenda**: en *Mi ruta* hay dos vistas, *Mi ruta* y *Llamar*. *Llamar* junta los negocios pendientes con teléfono en el orden en que conviene llamar: primero los que pidieron que se les llame, luego por el día en que toca visitarlos (hoy, mañana, próximos días, sin día) y los que no contestaron al final de cada grupo. Al tocar *Llamar* se abre el marcador y, al volver, ya está abierta la hoja para anotar cómo le fue: *Agendé visita* (día y hora), *Llamar más tarde*, *No contestó*, *No le interesa* o *Número equivocado* (con el número correcto, si lo consiguió). El vendedor es dueño de su agenda: una cita mueve el negocio a ese día (`fechaPlan`) aunque el coordinador lo hubiera planeado para otro, y aparece en *Tus citas de hoy* con su hora; una hora antes de la cita pasa a ser la *siguiente parada*. Las llamadas también se guardan sin señal y se envían solas. El teléfono de un negocio se puede capturar o corregir al registrar la visita (también en negocios nuevos).
- **Guía de la primera vez** (`src/recorrido.tsx`): la primera vez que entra, el vendedor ve una bienvenida corta (para qué sirve la app, ruta, visitas, llamadas, sin señal) y desde ahí elige un **recorrido guiado** sobre su pantalla real o una **visita de práctica** (`/visita/practica`, no se guarda ni cuenta para la meta). Se marca como vista en el servidor (`vendedores.onboardingVisto`, `POST /api/auth/onboarding`) para no repetirla en otra tablet, y se puede volver a ver tocando sus iniciales.
- Después de guardar, la pantalla de éxito ofrece **"Ir a la siguiente"** (la parada más cercana que queda), para encadenar visitas sin volver a la lista.
- **Sin señal** funciona igual: la ruta y el avance se guardan en la tablet, las visitas (con fotos) se encolan en IndexedDB y se envían solas; la cabecera muestra "Al día" o "N por enviar". La sesión también se recuerda para abrir la app sin señal.
- **Rendimiento**: colores sólidos y sombras chicas, Google Maps solo en la pestaña Mapa, fotos reducidas a 1280 px antes de subir y una sola lectura de GPS compartida (cada minuto con la app visible; el punto del recorrido se manda cada 5 min, como antes).
- **Medición de uso** (`src/analitica.ts`, `src/grabacion.ts`): la app mide cómo se usa, como Microsoft Clarity pero dentro de la herramienta. Siempre: pantallas y tiempo en cada una (topado a 10 min por rato), toques con su posición y lo que se tocó (`data-track`, `aria-label` o el texto del botón; de un campo solo cuál fue, nunca su valor), toques de frustración (3+ en 1 s en el mismo lugar), toques en algo que no responde, errores, cortes de señal y los pasos de registrar una visita y anotar una llamada (con `track()`). Se guardan en la tablet y se mandan en lotes cada minuto (`POST /api/interacciones`, colección `interacciones`). Además, algunas sesiones se **graban** con rrweb (la estructura de la pantalla y cada cambio, no video): las de los vendedores que el admin eligió (`vendedores.grabarHasta`) y un % al azar (`config/app.grabacionPorcentaje`, 10 % por defecto). Lo escrito va enmascarado, fotos/cámara/mapas bloqueados (`rr-block`) y los teléfonos tapados (`rr-mask`). Se corta en fragmentos de 30 s comprimidos con gzip que esperan en IndexedDB y se suben directo a Storage (`grabaciones/{uid}/{sesión}/`, solo crear, nadie los lee desde el navegador) cuando hay señal y no hay ahorro de datos; el servidor los indexa en `grabaciones` (`POST /api/grabaciones/fragmento`). rrweb se carga solo en las sesiones que se graban. Al vendedor se le avisa en la bienvenida y en *Novedades*.

### Admin (laptop/PC)

- **Tablero** (pantalla de inicio; reemplaza al antiguo *Resumen*): el embudo de campo para cualquier persona, y debajo el detalle para quien coordina. Todos los números usan el mismo periodo y dicen, a la vista, qué cuentan y con qué operación.
  - **Embudo** (termina en **desembolsadas** y su monto: fecha de entrada a la etapa `hs_v2_date_entered_1341580187` y el *Importe* `amount` del deal, configurable con `HUBSPOT_PROP_MONTO`; una desembolsada cuenta también como aprobada): meta (negocios planeados en la ruta para esos días, más los negocios nuevos que debían encontrar: `propiosPorDia` por cada día con ruta) → negocios visitados (distintos, en persona) → reales (sin cerrados o inexistentes) → con interés (solicitud, información o volver otro día) → **solicitudes** confirmadas en HubSpot → **aprobadas**. Cada paso trae cómo iba en el periodo anterior.
  - **Tres tasas**: avance de la meta (visitados ÷ meta), conversión (solicitudes ÷ negocios reales) y aprobación (aprobadas ÷ con respuesta; las que siguen en revisión no cuentan y, si menos de la mitad tiene respuesta, se marca como *preliminar* y no se compara).
  - **Solicitud confirmada**: visita marcada como *Hizo solicitud* con un deal en el pipeline de campo (`890269050`) cuyo deal owner es el mismo vendedor (se empata por correo con `GET /crm/v3/owners`), creado entre 30 min antes y 30 min después de la visita. Cada negocio cuenta una vez; cada deal confirma una sola visita. Aprobado/rechazado salen de `hs_v2_date_entered_1341410960` y `hs_v2_date_entered_1341410959`: es el estado de hoy de las solicitudes creadas en el periodo.
  - Por **día, semana, mes** (navegando con ‹ ›) o **fechas** a elegir (hasta un año). Un periodo en curso se compara contra el anterior **cortado en el mismo punto de avance** (hoy hasta esta hora vs el mismo día de la semana pasada; del 1 al 11 vs del 1 al 11 del mes pasado; un rango, contra los mismos días justo antes). Vista y fechas van en la URL, así que el enlace se puede compartir. Filtros de producto y vendedor.
  - Debajo: **tendencia** (solicitudes con las aprobadas, o visitas) de los últimos 8 periodos o de cada día/semana del rango, el embudo **por producto**, el embudo **por vendedor** (ordenable; clic en un nombre para ver solo el suyo) y **Requiere atención** (plegado): sin ruta, ruta por acabarse, paradas atrasadas, sin visitas, pocas visitas en el negocio y pocas solicitudes en HubSpot.
  - **En el negocio** (por vendedor): % de las visitas *comprobables* hechas a 50 m o menos del negocio. No se pueden medir —y no cuentan ni a favor ni en contra— las visitas a negocios nuevos (su única ubicación es la que manda el propio vendedor: compararla consigo misma siempre daría "sí" e inflaría el número), a negocios agregados a mano en la ruta (sin coordenadas) y las guardadas sin GPS; la tabla dice cuántas son de cada tipo en vez de dejar la celda vacía. Ninguna celda queda en blanco: si no hay número, dice por qué (sin ruta, sin visitas, en revisión…).
  - HubSpot se consulta **solo al abrir el Tablero** (nada se copia a Firestore; ver `server/src/integrations/hubspot.ts`) y la respuesta se reutiliza 15 min. Sin `HUBSPOT_TOKEN` o si HubSpot falla, el Tablero lo dice y sigue mostrando los números de visitas.
- **En vivo**: dónde está cada vendedor hoy, visitas contra lo planeado, última visita y quién no ha empezado; al elegir a uno se ve su recorrido GPS del día. Se actualiza cada minuto.
- **Visitas**: el registro de cada visita con fotos, mapa de calor y rutas GPS, y **exportación a CSV** (Excel). Cada *Hizo solicitud* dice a qué solicitud de HubSpot quedó ligada (y si se ligó sola) o *Solicitud sin ligar*. Filtro de **alertas**: *solicitud sin ligar*, *ubicación por revisar* (el vendedor dijo que el negocio está en otro lugar —con *Aceptar* / *Descartar* ahí mismo— o llegó sin señal fuera del cerco) y *GPS sospechoso* (para llegar desde su punto anterior habría tenido que ir a más de 150 km/h; `server/src/sospechaGps.ts`). Se filtra también por resultado y por **origen**: *negocios nuevos* (de calle) o *prospectos de la ruta* (DENUE); un negocio nuevo que ya era de alguien lleva la etiqueta *ya era de alguien*. El nombre del negocio abre su **historial**: todas sus visitas, de cualquier vendedor, y en la ruta de quién está hoy.
- **Llamadas y agenda**: a qué negocios llamó cada vendedor, qué pasó y las visitas que agendó (colección `llamadas`); indicadores del periodo (llamadas, % que contestó, visitas agendadas), las **próximas citas** pendientes, el resumen por vendedor y exportación a CSV. El historial de un negocio muestra sus llamadas junto con sus visitas.
- **Uso de la app**: cómo usan los vendedores la app (ver *Medición de uso* arriba). *Resumen de uso*: tiempo, sesiones, toques de frustración, errores y cortes de señal; los embudos de *Registrar una visita* y *Anotar una llamada* (intentos que llegan a cada paso) y por qué no se pudo guardar una visita; uso por día y por hora; tiempo y frustración por pantalla; **mapa de toques** por pantalla con lo más tocado; tabla por vendedor, desde donde se **graban todas sus sesiones** 1, 3 o 7 días; errores de la app; teléfonos y app instalada contra navegador (`GET /api/interacciones/resumen`). *Grabaciones de sesiones*: el % de sesiones al azar y la lista de sesiones grabadas, que se reproducen en el panel (rrweb-player) con sus momentos (pantallas, frustración, errores, visitas guardadas) para saltar a ellos. Los fragmentos se bajan por la API (`GET /api/grabaciones/:sesión/fragmentos/:n`), nunca con un enlace público. La función programada `limpiarAnalitica` borra las grabaciones de más de 30 días y los eventos de más de 120.
- **Guía del panel**: la primera vez (por navegador) sale una explicación de qué hace el vendedor con la app y un recorrido por cada pantalla; se vuelve a ver con *¿Cómo funciona?* arriba a la derecha.
- **Rutas**: estado de la ruta de cada vendedor (sin ruta / se acaba pronto / con ruta) y el **planeador**: zona (buscador, clic en el mapa o zona dibujada; con *Juntar otra zona vecina* se combinan hasta 4, y el recorrido de cada día pasa por todas), giros y ritmo (visitas por día —de ellas, cuántos negocios nuevos encuentra él—, días de trabajo, duración) → **Generar ruta**. Cada zona es una consulta al DENUE (cada una con su tope de 5 km). En el mismo paso, **Donde no puede ir**: zonas en rojo, buscando un lugar (colonia, calle, mercado) con un radio o dibujándolas a mano (nombre, motivo opcional que el vendedor ve solo si se marca, y a qué otros vendedores aplica; también se puede reutilizar la de otro vendedor). Al crearla o aplicarla se quitan de la ruta los pendientes que caen dentro (colección `zonasRestringidas`). El servidor trae los negocios del DENUE, quita los que caen en sus zonas restringidas, quita los que ya trae otro vendedor del mismo producto o que se visitaron en los últimos 90 días, los ordena en un recorrido corto (vecino más cercano + 2-opt) y los reparte por día (`fechaPlan` + número de parada). La vista previa se puede editar antes de publicar. Al publicar reemplazando lo pendiente, las citas que el vendedor ya agendó por teléfono (de hoy en adelante) se conservan. La configuración se guarda, así que **Renovar** (uno o varios vendedores a la vez) arma el siguiente periodo con un clic.
- **Equipo**: conexión con la base de colaboradores, productos de campo (y qué giros busca cada uno), **registro de visitas** (distancia máxima al negocio, de 30 a 1,000 m; es también la que cuenta una visita como "hecha en el negocio") y el equipo activo con filtros (producto, vendedor, hub manager, zona, búsqueda) y el estado de la ruta de cada uno.
- Se quitaron *Dashboard*, *Mapa de Leads*, *Seguimiento* y *Reportes* (su contenido quedó en Tablero, En vivo y Visitas) y *CRM · Prospectos* junto con la integración de HubSpot (ya estaba apagada por costos). HubSpot volvió solo como lectura para el Tablero, sin sincronizar nada. La colección `crmDeals` se queda en Firestore tal cual.

### Historial: quien ya no está activo y cada negocio

La base de colaboradores decide quién está activo hoy, pero lo que pasó en campo no se pierde:

- **Equipo actual vs. historia.** Rutas, En vivo y Equipo solo trabajan con el equipo activo. Las pantallas de un periodo (Tablero y Visitas) cuentan todo lo que pasó en ese periodo: quien ya no está activo aparece en la tabla por vendedor del Tablero con la etiqueta *ya no activo* si visitó en el periodo, y en el filtro de vendedores bajo **"Ya no activos"**. Los indicadores del equipo ("vendedores con visitas", "Requiere atención") siguen siendo solo del equipo activo. Si alguien vuelve a darse de alta con el mismo correo, se reactiva el mismo vendedor con toda su historia.
- **La visita guarda cómo era el vendedor al hacerla**: `vendedorNombre`, `productoId`, `productoNombre`, `zona` y `hubManagerNombre`. Si después cambia de producto o de zona, sus visitas viejas siguen contando donde se hicieron.
- **Cada negocio tiene un `negocioId`** (`server/src/negocios.ts`), el mismo en cualquier ruta y en cada visita: un hash del nombre y la dirección normalizados (sin acentos, mayúsculas ni puntuación), o del nombre y el GPS si un negocio nuevo se registró sin dirección. Con él se arma el historial del negocio, el planeador deja de proponer lo que ya trae otro vendedor o se visitó hace poco, y una ruta publicada no repite negocios. Del DENUE se guarda además su id (`denueId`) como referencia.

**Datos anteriores a este cambio** (prospectos y visitas sin `negocioId` ni la foto del vendedor): se completan con

```bash
npm run db:backfill-historial            # dry run: conteos y ejemplos de lo que agregaría
npm run db:backfill-historial -- --yes   # escribe
```

Solo agrega campos que faltan (nunca cambia uno que ya tiene valor) y se puede repetir. A las visitas viejas les pone el dato *actual* del vendedor, que es lo más cercano que queda. Ojo: escribe en la base a la que apunten tus credenciales (producción si no hay `FIRESTORE_EMULATOR_HOST`); saca un respaldo antes y corre primero el dry run. Mientras no se corra, todo funciona igual, pero el historial de un negocio solo muestra las visitas nuevas.

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

   El primer deploy después de quitar HubSpot va a avisar que la función programada `syncHubspotDealsScheduled` ya no está en el código y preguntar si se borra: sí (o `firebase functions:delete syncHubspotDealsScheduled`). Despliega también los índices nuevos de `firestore.indexes.json` (`--only firestore:indexes`) antes de usar Rutas, el historial de negocios y la app del vendedor.

`firebase.json` ya reescribe `/api/**` hacia la función `api` en ambos sitios de Hosting, y todo lo demás cae a `index.html` (SPA). Como el frontend llama a rutas relativas (`/api/...`), no hace falta configurar CORS entre Hosting y la función; `CORS_ORIGINS` solo importa si llamas a la API desde otro dominio. Las fotos de visitas **no** pasan por ese rewrite: la app del vendedor las sube directo a Firebase Storage con el SDK cliente (`apps/seller/src/uploadFotos.ts`, reglas en `storage.rules`) y la función solo recibe las URLs resultantes — esto evita el límite fijo de 10 MB por request que Firebase Hosting impone a cualquier request reescrita hacia una función, sin importar el límite que configure el propio servidor.

`firestore.rules` cierra Firestore a cualquier acceso directo desde el cliente (`allow read, write: if false`): toda la app pasa por la API, que usa el Admin SDK y por lo tanto ignora esas reglas.
