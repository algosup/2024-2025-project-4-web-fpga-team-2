/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

self.addEventListener("install", (event: ExtendableEvent) => {
  console.log("[Service Worker] Installing...");
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event: ExtendableEvent) => {
  console.log("[Service Worker] Activated");
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event: FetchEvent) => {
  console.log("[Service Worker] Fetching:", event.request.url);
  
  event.respondWith(
    fetch(event.request).catch(() => {
      return new Response("You are offline", { status: 503 });
    })
  );
});
