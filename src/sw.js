/* ===== 劇浪 v6.1 Service Worker ===== */
const CACHE_NAME = 'julang-v61-' + new Date().toISOString().slice(0, 10);
const CORE_ASSETS = [
  './index.html',
  './manifest.json',
  './js/config.js',
  './js/api.js',
  './js/mock-api.js',
  './js/player.js',
  './js/render.js',
  './js/ui.js',
  './js/ai-studio.js',
  './js/comic-player.js',
  './js/agent-studio.js',
  './js/canvas-editor.js',
  './js/community.js',
  './js/flow-canvas.js',
  './js/libtv-tools.js',
  './js/upload.js',
  './js/scriptwriter.js',
  './js/assets.js',
  './js/v61.js',
  './js/pwa.js',
  './js/app.js',
];

// 安裝：預緩存核心資產
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(CORE_ASSETS)).then(() => self.skipWaiting())
  );
});

// 激活：清理舊緩存
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 請求策略：
// - API 請求：網絡優先，失敗回傳離線提示
// - 圖片/CDN：緩存優先，後台更新（stale-while-revalidate）
// - 其他：網絡優先，回退緩存
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (url.pathname.includes('/api/')) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ code: 0, message: '當前處於離線模式' }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  if (/\.(png|jpg|jpeg|webp|svg|css|js)$/.test(url.pathname) || url.hostname.includes('cdn') || url.hostname.includes('picsum')) {
    e.respondWith(
      caches.match(e.request).then((cached) => {
        const fetchPromise = fetch(e.request).then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          }
          return res;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
