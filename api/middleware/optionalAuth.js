/* ===== v7.3：optional auth 中介軟體 =====
 *
 * 用途：公開 GET 端點（/dramas/:id、/dramas/:id/episodes）需要「知道你是誰」才能
 * 算解鎖狀態，但**不能**因為沒登入或 token 過期就把人擋在門外。
 *
 * 契約：
 *   · 有合法 Authorization: Bearer <token> → req.user = { userId }
 *   · 沒有 / 格式不對 / token 無效過期 → 直接 next()，req.user 保持 undefined
 *   · 任何情況都不回 401（那是 auth.js 的職責）
 *
 * 為什麼要有獨立檔案而不是直接用 auth.js 的 optionalAuth：那個版本把整個
 * JWT payload（含 iat/exp）塞進 req.user，這裡凍結的契約只要 { userId }，
 * 讓下游 controller 不必防禦 payload 裡多出來的欄位。
 */
const jwt = require('jsonwebtoken');

// 與 auth.js 相同的密鑰解析規則；延後到呼叫時才讀 env，
// 避免測試在 require 之後才設定 JWT_SECRET 時拿到舊值。
function jwtSecret() {
  return process.env.JWT_SECRET || 'julang-dev-secret';
}

function extractToken(req) {
  const header = req && req.headers ? req.headers.authorization : null;
  if (!header) return null;
  // 只在真的以 Bearer 開頭時才取；"Token abc" 這種不該被當成 JWT 硬解
  const m = /^Bearer\s+(.+)$/i.exec(String(header).trim());
  return m ? m[1].trim() : null;
}

function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, jwtSecret());
      if (decoded && decoded.userId) req.user = { userId: decoded.userId };
    } catch {
      // 無效 token：忽略即可，公開接口照常放行
    }
  }
  next();
}

module.exports = optionalAuth;
// 兼容兩種 require 寫法（const optionalAuth = require(...) / .optionalAuth）
module.exports.optionalAuth = optionalAuth;
