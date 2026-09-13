const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { code: 429, message: '請求過於頻繁，請稍後再試' },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { code: 429, message: '請求過於頻繁' },
});

// v5.0 AI 生成接口獨立限流：每分鐘 5 次，防止生成成本被打爆
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { code: 429, message: 'AI 生成請求過於頻繁，請稍後再試' },
});

module.exports = { authLimiter, apiLimiter, aiLimiter };
