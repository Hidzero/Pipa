const CACHE_NAME = "pipa-entregas-v12";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.json",
  "./css/styles.css",
  "./js/app.js",
  "./js/agenda.js",
  "./js/auth.js",
  "./js/caminhoes.js",
  "./js/clientes.js",
  "./js/config.js",
  "./js/dashboard.js",
  "./js/financeiro.js",
  "./js/offline.js",
  "./js/pedidos.js",
  "./js/relatorios.js",
  "./js/router.js",
  "./js/rota.js",
  "./js/state.js",
  "./js/supabase.js",
  "./js/ui.js",
  "./assets/icon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))
      )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request)
        .then((response) => {
          const responseCopy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseCopy));
          return response;
        })
        .catch(() => caches.match("./index.html"));
    })
  );
});
