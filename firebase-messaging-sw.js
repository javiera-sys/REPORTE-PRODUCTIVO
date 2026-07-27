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
