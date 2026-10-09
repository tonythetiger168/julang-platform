/* ===== 速率限制中介軟體 (v7.2) =====
 *
 * 這個檔案在原始 repo 中並不存在，但 server.js 與路由檔都 require 它
 * （apiLimiter / authLimiter），少了它整個 API 連 require 都過不了。
 * 三個 limiter 的職責由呼叫點決定：
 *   apiLimiter  → server.js 全域掛載
 *   authLimiter → routes/auth.js 的 register / login（防暴力破解）
 *   aiLimiter   → v7.3 起**沒有任何路由使用**：原本的 /ai/*、/ai/tools 與 /openapi/*
 *                 生成端點已整條移除。保留匯出是為了不讓 tests/middleware.test.js
 *                 的既有契約測試（與未來 AI 端點回歸）斷掉；要清掉請連測試一起改。
 */
const rateLimit = require('express-rate-limit');

function make({ windowMs, limit, message }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // 與 api/utils/response.js 的錯誤格式一致
    message: { code: 429, message },
  });
}

const apiLimiter = make({ windowMs: 15 * 60 * 1000, limit: 600, message: '請求過於頻繁，請稍後再試' });
const authLimiter = make({ windowMs: 15 * 60 * 1000, limit: 20, message: '嘗試次數過多，請 15 分鐘後再試' });
const aiLimiter = make({ windowMs: 60 * 1000, limit: 20, message: 'AI 請求過於頻繁，請稍後再試' });

module.exports = { apiLimiter, authLimiter, aiLimiter };
