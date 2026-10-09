/* ===== Redis 連線 (v6.x) =====
 *
 * v7.2 修補（原檔是一行、且有一個會讓整個 API 起不來的缺陷）：
 *   client.connect() 回傳的 promise 沒有 catch。Redis 沒開時它就是一個
 *   unhandled rejection，Node 18+ 預設會直接終止進程 —— 也就是說沒有 Redis
 *   的環境下，API 連啟動都做不到，而 Redis 在這台開發機上並不存在。
 *
 * 改成失敗容忍：連不上只警告一次，client.isReady 保持 false，
 * 呼叫端（api/middleware/cache.js）據此降級為進程內快取。
 */
const redis = require('redis');
require('dotenv').config();

const client = redis.createClient({ url: process.env.REDIS_URL || 'redis://localhost:6379' });

// 重連期間同一個錯誤會一直噴，節流一下
let lastErrorAt = 0;
client.on('error', (err) => {
  const now = Date.now();
  if (now - lastErrorAt > 10000) {
    lastErrorAt = now;
    console.warn('⚠️  Redis 不可用，快取降級為進程內記憶體：' + err.message);
  }
});

client.connect().catch(() => {
  // 已在 'error' 事件處理，這裡只是避免 unhandled rejection
});

module.exports = client;
