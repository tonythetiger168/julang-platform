/* ===== 回應快取中介軟體 (v7.2) =====
 *
 * 原始 repo 缺少此檔，但 routes/index.js 與 routes/drama.js 以
 * cache(prefix, ttl秒) 使用它，掛在熱門 GET 端點上
 * （/categories、/rankings/:type、/dramas/recommend、/dramas/:id…）。
 *
 * Redis 不是硬依賴：連不上就退回進程內 Map。這台開發機沒有 Redis，
 * 硬依賴會讓整個 API 起不來，所以降級是刻意設計，不是權宜。
 */
const redis = require('../config/redis');

const memory = new Map(); // key -> { body, expiresAt }
const MAX_MEMORY_ENTRIES = 500;

function getMemory(key) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) { memory.delete(key); return null; }
  return hit.body;
}

function setMemory(key, body, ttlSeconds) {
  if (memory.size >= MAX_MEMORY_ENTRIES) {
    // 粗暴但足夠：清掉最舊的一批，避免無上限成長
    let n = 0;
    for (const k of memory.keys()) { memory.delete(k); if (++n >= 100) break; }
  }
  memory.set(key, { body, expiresAt: Date.now() + ttlSeconds * 1000 });
}

function redisReady() {
  return !!(redis && redis.isReady === true);
}

module.exports = function cache(prefix, ttlSeconds) {
  const ttl = ttlSeconds || 60;

  return async function cacheMiddleware(req, res, next) {
    if (req.method !== 'GET') return next();

    // 快取鍵**必須含使用者**：端點只要回傳 per-user 欄位（例如 /dramas/:id 的
    // unlocked），只用 URL 當鍵就會把 A 的解鎖狀態餵給 B。沒有登入者時一律 'anon'，
    // 所以不使用 optionalAuth 的路由行為完全不變。
    const who = (req.user && req.user.userId) ? req.user.userId : 'anon';
    const key = 'jl:cache:' + (prefix || 'x') + ':' + who + ':' + (req.originalUrl || req.url);

    try {
      if (redisReady()) {
        const raw = await redis.get(key);
        if (raw) return res.json(JSON.parse(raw));
      } else {
        const hit = getMemory(key);
        if (hit) return res.json(hit);
      }
    } catch (e) {
      // 快取故障不應該影響請求本身
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      try {
        if (res.statusCode === 200) {
          if (redisReady()) redis.setEx(key, ttl, JSON.stringify(body)).catch(() => {});
          else setMemory(key, body, ttl);
        }
      } catch (e) { /* 忽略寫入快取失敗 */ }
      return originalJson(body);
    };

    next();
  };
};

module.exports.cache = module.exports;
