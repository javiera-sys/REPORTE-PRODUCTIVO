// Firebase Service Worker para Notificaciones en Segundo Plano
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCAOhYLqz9tNgvmjM9fPFatVGMqJG7WJTo",
  authDomain: "reporte-productivo.firebaseapp.com",
  projectId: "reporte-productivo",
  storageBucket: "reporte-productivo.firebasestorage.app",
  messagingSenderId: "392604605928",
  appId: "1:392604605928:web:896d5b169e26dde057185d"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[SW] Notificación en segundo plano recibida:', payload);
  const title = payload.notification?.title || payload.data?.title || '📌 Actualización de Producción';
  const options = {
    body: payload.notification?.body || payload.data?.body || 'Se ha registrado un nuevo cambio.',
    icon: 'https://cdn-icons-png.flaticon.com/512/2558/2558944.png',
    badge: 'https://cdn-icons-png.flaticon.com/512/2558/2558944.png',
    data: payload.data || {},
    vibrate: [200, 100, 200]
  };

  self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetNaveId = event.notification.data?.naveId;
  let targetUrl = self.location.origin + self.location.pathname;
  if (targetNaveId) {
    targetUrl += '#nave-' + targetNaveId;
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (let client of windowClients) {
        if ('focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

/* ============================================================
   VERSIÓN OFFLINE (PWA) — agregado sin tocar nada de lo anterior.
   Reglas:
   - Solo se cachea el "cascarón" de la app (HTML/CSS/JS/manifest/íconos).
   - data/cambios.json y data/modelos.json NUNCA se sirven desde caché
     si hay red disponible: siempre se intenta la red primero y se
     refresca la caché con lo último. La caché de datos es solo un
     respaldo para cuando no hay conexión, nunca la fuente de verdad.
   - Las llamadas a api.github.com (guardar/leer del repositorio) NUNCA
     se interceptan: pasan directo a la red, tal cual, sin caché.
   - No se cachea nada automáticamente al instalar: solo cuando el
     usuario presiona "Descargar versión offline" (mensaje CACHE_APP_SHELL).
   - Para forzar una actualización de caché tras subir cambios nuevos de
     código, sube CACHE_VERSION en app.js/css/html (ej. "v2"); el SW
     borra automáticamente las cachés de versiones viejas al activarse.
   ============================================================ */
const CACHE_VERSION = 'v1';
const APP_SHELL_CACHE = 'rpi-app-shell-' + CACHE_VERSION;
const DATA_CACHE = 'rpi-data-runtime'; // no lleva versión: es solo un respaldo, se sobrescribe siempre

const APP_SHELL_URLS = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './manifest.json'
];

const DATA_FILE_PATTERNS = [/\/data\/cambios\.json(\?|$)/, /\/data\/modelos\.json(\?|$)/];

self.addEventListener('install', () => {
  // No precachea nada solo; espera la orden explícita del botón para
  // que la instalación del SW (necesaria para notificaciones) siga
  // siendo ligera e inmediata.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('rpi-app-shell-') && k !== APP_SHELL_CACHE)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'CACHE_APP_SHELL') {
    event.waitUntil((async () => {
      try {
        const cache = await caches.open(APP_SHELL_CACHE);
        await cache.addAll(APP_SHELL_URLS);
        const clientsList = await self.clients.matchAll();
        clientsList.forEach((c) => c.postMessage({ type: 'APP_SHELL_CACHED', ok: true }));
      } catch (err) {
        const clientsList = await self.clients.matchAll();
        clientsList.forEach((c) => c.postMessage({ type: 'APP_SHELL_CACHED', ok: false, error: String(err) }));
      }
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo GET; deja pasar todo lo demás (PUT/POST a la API de GitHub, etc.) sin tocar.
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Nunca intervenir llamadas a la API de GitHub ni a otros orígenes externos
  // (fuentes, íconos de terceros, CDNs) - se dejan pasar directo a la red.
  if (url.origin !== self.location.origin) return;

  const isDataFile = DATA_FILE_PATTERNS.some((re) => re.test(url.pathname));
  if (isDataFile) {
    // Datos de la app: red primero, siempre. La caché es solo el último
    // respaldo conocido para cuando no hay internet.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(DATA_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(DATA_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        throw err;
      }
    })());
    return;
  }

  const isAppShellFile = APP_SHELL_URLS.some((path) => url.pathname.endsWith(path.replace('./', '/')) || (path === './' && (url.pathname === '/' || url.pathname.endsWith('/index.html'))));
  if (isAppShellFile) {
    // Cascarón de la app: red primero (para tomar cambios nuevos de
    // inmediato), y si no hay conexión, se sirve la última copia cacheada.
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(APP_SHELL_CACHE);
        cache.put(req, fresh.clone());
        return fresh;
      } catch (err) {
        const cache = await caches.open(APP_SHELL_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        throw err;
      }
    })());
  }
  // Cualquier otro request (imágenes, fuentes, etc.) no se intercepta:
  // se deja pasar tal cual, para mantener la descarga lo más ligera posible.
});
