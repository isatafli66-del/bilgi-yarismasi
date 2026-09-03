const CACHE_ADI = 'tazzy-quiz-v1.3.0';
const UYGULAMA_DOSYALARI = [
  '/',
  '/manifest.webmanifest',
  '/icons/tazzy-192.png',
  '/icons/tazzy-512.png',
  '/Tazzy Siyah.png',
  '/Tazzy Beyaz.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_ADI).then(cache => cache.addAll(UYGULAMA_DOSYALARI)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(anahtarlar => Promise.all(anahtarlar.filter(anahtar => anahtar !== CACHE_ADI).map(anahtar => caches.delete(anahtar))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  if(event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if(url.origin !== self.location.origin || url.pathname.startsWith('/socket.io/')) return;
  if(['/admin', '/ekran', '/tazzy-master', '/logout'].some(yol => url.pathname.startsWith(yol))) return;

  if(event.request.mode === 'navigate') {
    if(url.pathname !== '/') return;
    event.respondWith(fetch(event.request).catch(() => caches.match('/')));
    return;
  }

  event.respondWith(
    caches.match(event.request).then(eslesen => eslesen || fetch(event.request).then(cevap => {
      if(cevap.ok) {
        const kopya = cevap.clone();
        caches.open(CACHE_ADI).then(cache => cache.put(event.request, kopya));
      }
      return cevap;
    }))
  );
});
