const CACHE_NAME = "sticker-canvas-v1";
const SCOPE_URL = new URL(self.registration.scope);
const APP_SHELL = [
  SCOPE_URL.href,
  new URL("manifest.webmanifest", SCOPE_URL).href,
  new URL("sticker-canvas-logo.svg", SCOPE_URL).href,
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (
    request.method !== "GET" ||
    new URL(request.url).origin !== self.location.origin
  ) {
    return;
  }

  if (request.mode === "navigate") {
    const navigation = fetch(request)
        .then((response) => {
          const cacheUpdate = caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, response.clone()))
            .catch(() => {});
          return { response, cacheUpdate };
        })
        .catch(async () => {
          const response =
            (await caches.match(request)) ??
            (await caches.match(SCOPE_URL.href)) ??
            Response.error();
          return { response, cacheUpdate: Promise.resolve() };
        });
    event.respondWith(navigation.then((result) => result.response));
    event.waitUntil(navigation.then((result) => result.cacheUpdate));
    return;
  }

  const resource = caches.match(request).then(async (cached) => {
      if (cached) {
        return { response: cached, cacheUpdate: Promise.resolve() };
      }
      const response = await fetch(request);
      const cacheUpdate = response.ok
        ? caches
          .open(CACHE_NAME)
          .then((cache) => cache.put(request, response.clone()))
          .catch(() => {
              // Large model assets may exceed browser-managed cache quotas.
            })
        : Promise.resolve();
      return { response, cacheUpdate };
    });
  event.respondWith(resource.then((result) => result.response));
  event.waitUntil(resource.then((result) => result.cacheUpdate));
});
