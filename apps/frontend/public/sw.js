// Caches the app itself (HTML, scripts, styles, images) so the logbook still
// opens with no connection. API data is not cached here: the API is on a
// different origin, and the app keeps its own offline copy of it
// (src/lib/offlineCache.ts).

const CACHE = "logbook-shell-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(["/", "/index.html", "/manifest.webmanifest"]))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

// A reminder pushed by the server (see apps/backend/src/utils/push.ts).
self.addEventListener("push", (event) => {
  let message = {};
  try {
    message = event.data ? event.data.json() : {};
  } catch {
    message = { body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(message.title || "Reminder", {
      body: message.body || "",
      icon: "/icon-192.png",
      tag: message.tag,
      data: { url: message.url || "/reminders" },
    })
  );
});

// Clicking a reminder notification brings an open logbook tab forward, or
// opens one, on the page the notification points to.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.focus().then((w) => (w || open).navigate(url));
      return self.clients.openWindow(url);
    })
  );
});

async function putInCache(request, response) {
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.startsWith("/api")) return;

  // Pages: always try the network for the newest build, fall back to the
  // cached shell. Every route is the same index.html in a single-page app.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => putInCache("/index.html", response))
        .catch(() => caches.match("/index.html"))
    );
    return;
  }

  // Built assets have a content hash in their name, so a cached copy is
  // never stale; anything else is refreshed from the network when possible.
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((r) => putInCache(request, r))));
    return;
  }
  event.respondWith(
    fetch(request)
      .then((response) => putInCache(request, response))
      .catch(() => caches.match(request))
  );
});
