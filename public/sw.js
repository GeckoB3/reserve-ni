const CACHE_NAME = 'reserve-ni-daysheet-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isDaySheetPage(url) {
  return url.pathname.includes('/dashboard/day-sheet');
}

function isBookingsApi(url) {
  return url.pathname.startsWith('/api/venue/bookings');
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (!isDaySheetPage(url) && !isBookingsApi(url)) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone);
        });
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
