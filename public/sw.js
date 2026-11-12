const CACHE_NAME = 'xuanan-student-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      cache.addAll(['/icons/icon-192.png', '/icons/icon-512.png', '/icons/badge-96.png']).catch(() => undefined)
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() =>
        new Response(
          `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mất kết nối · Xuân An English</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#f8f9f6;color:#293b35;font-family:Arial,sans-serif;padding:24px;text-align:center}.card{background:#fff;border:1px solid #e8ece6;border-radius:16px;padding:28px;max-width:360px}button{margin-top:16px;background:#397759;color:#fff;border:0;border-radius:10px;padding:12px 20px;font-size:14px;cursor:pointer}</style></head><body><div class="card"><h2>Chưa có kết nối mạng</h2><p>Con hãy kiểm tra Wi-Fi hoặc 4G rồi tải lại trang để làm bài tập nhé.</p><button onclick="location.reload()">Tải lại trang</button></div></body></html>`,
          { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
      )
    );
  }
});

self.addEventListener('push', (event) => {
  let payload = {
    title: 'Xuân An English',
    body: 'Con có thông báo mới từ cô An.',
    url: '/student',
    tag: 'xuanan-notice',
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = { ...payload, ...parsed };
    } catch {
      const text = event.data.text();
      if (text) payload.body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/badge-96.png',
      tag: payload.tag || 'xuanan-notice',
      renotify: true,
      data: { url: payload.url || '/student' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/student';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      const target = new URL(targetUrl, self.location.origin);
      for (const client of clientsList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.origin === target.origin && clientUrl.pathname.startsWith('/student')) {
          return client.focus().then((focused) => {
            if (focused && 'navigate' in focused) {
              return focused.navigate(target.href);
            }
            return focused;
          });
        }
      }
      return self.clients.openWindow(target.href);
    })
  );
});
