/* こころの庭 — オフライン対応
 * アプリのファイルを端末に保存しておき、電波がなくても開けるようにします。
 * 記録データはここでは扱いません（記録は localStorage に保存されます）。
 *
 * アプリのファイルを更新したら、下の CACHE の番号を1つ上げてください（v1 → v2）。
 * 次にアプリを2回開いたときに新しい版に切り替わります。 */
var CACHE = 'kokoro-niwa-app-v1';
var ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE).then(function (cache) { return cache.addAll(ASSETS); })
      .then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) {
        return k.indexOf('kokoro-niwa-app-') === 0 && k !== CACHE;
      }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

// 保存してあるファイルをすぐ返し、裏で最新版を取りに行く
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE).then(function (cache) {
      var lookup = req.mode === 'navigate' ? './index.html' : req;
      return cache.match(lookup, { ignoreSearch: true }).then(function (cached) {
        var network = fetch(req).then(function (res) {
          if (res && res.ok && res.type === 'basic') {
            cache.put(req.mode === 'navigate' ? './index.html' : req, res.clone());
          }
          return res;
        }).catch(function () { return cached; });
        return cached || network;
      });
    })
  );
});
