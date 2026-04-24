const cacheName = "alm64-v10";   // غيّر الرقم عند كل تحديث

const filesToCache = [
  "./",
  "./index.html",
  "./style.css",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

// ⚠️ لاحظ: لم نضع script.js ولا alm64.js هنا
// لأن تخزينهما يسبب مشاكل عند التحديث

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(cacheName).then((cache) => cache.addAll(filesToCache))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== cacheName).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first for JS files
self.addEventListener("fetch", (event) => {
  const url = event.request.url;

  // ملفات JS يجب أن تأتي من الشبكة دائمًا
  if (url.endsWith(".js")) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // باقي الملفات: cache-first
  event.respondWith(
    caches.match(event.request).then((response) => response || fetch(event.request))
  );
});
