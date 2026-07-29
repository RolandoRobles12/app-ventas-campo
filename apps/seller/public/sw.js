// Service worker mínimo, sin dependencias: el objetivo es que la app abra
// aunque no haya señal (el vendedor consulta su lista y registra visitas que
// quedan en la cola local — ver src/offline.ts). Estrategia:
//   - /api y /uploads jamás se tocan: siempre red (los datos vivos y la cola
//     offline los maneja la app, no el service worker).
//   - navegación (el shell): red primero y se guarda copia; sin red, se sirve
//     el último index.html cacheado.
//   - assets del build (JS/CSS con hash en el nombre): caché primero — un
//     hash nuevo es una URL nueva, así que nunca se sirve una versión vieja.
const CACHE = 'aviva-vendedor-v2';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copia = res.clone();
          caches.open(CACHE).then((c) => c.put('/index.html', copia));
          return res;
        })
        .catch(() => caches.match('/index.html')),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request).then((res) => {
      if (res.ok) {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(event.request, copia));
      }
      return res;
    })),
  );
});
