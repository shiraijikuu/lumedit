/* Camera-WaterMark PWA Service Worker
 * 策略：页面(导航) network-first → 离线回退缓存，保证发布新版即时生效；
 *       同源静态资源 cache-first，首次访问后离线可用；跨域与 update.json 不拦截。
 * 发版时若改动静态资源，把下面 CACHE 版本号 +1 即可。 */
const CACHE = 'cwm-pwa-v3.0.18';
const CORE = [
  './manifest.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE && k !== 'cwm-shared').map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(req);
    if (fresh && fresh.ok) cache.put(req, fresh.clone());
    return fresh;
  } catch (err) {
    const hit = await cache.match(req);
    return hit || cache.match('./index.html');
  }
}

async function cacheFirst(req) {
  const hit = await caches.match(req);
  if (hit) return hit;
  const fresh = await fetch(req);
  if (fresh && fresh.ok && new URL(req.url).origin === self.location.origin) {
    const cache = await caches.open(CACHE);
    cache.put(req, fresh.clone()).catch(() => {});
  }
  return fresh;
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') {
    // Web Share Target：拦截 POST，提取图片存缓存，重定向到 ?shared=1
    if (req.method === 'POST' && req.url.includes('index.html')) {
      e.respondWith((async () => {
        try {
          const fd = await req.formData();
          const files = fd.getAll('images');
          if (files.length > 0) {
            const cache = await caches.open('cwm-shared');
            const entries = [];
            const batch = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
            for (let i = 0; i < files.length; i++) {
              const f = files[i];
              if (f && f.type && f.type.startsWith('image/')) {
                const key = 'cwm-shared-file-' + batch + '-' + i;
                await cache.put(key, new Response(f));
                entries.push({ key, name: f.name || 'shared.jpg', type: f.type });
              }
            }
            await cache.put('cwm-shared-files', new Response(JSON.stringify(entries), { headers: { 'Content-Type': 'application/json' } }));
          }
        } catch (err) {}
        return Response.redirect(new URL('index.html?shared=1', req.url).toString(), 303);
      })());
      return;
    }
    return;
  }
  let u;
  try { u = new URL(req.url); } catch (err) { return; }
  if (u.origin !== self.location.origin) return;     // 跨域（jsDelivr 等）走默认网络
  if (u.pathname.includes('update.json')) return;    // 更新检查永远走网络
  if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }
  e.respondWith(cacheFirst(req).catch(() => caches.match('./index.html')));
});
