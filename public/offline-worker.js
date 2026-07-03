self.addEventListener('fetch', event => {
  event.respondWith(
    caches.open('yugioh-builder-cache').then(cache =>
      cache.match(event.request).then(resp => resp || cache.add(event.request))
    )
  );
});