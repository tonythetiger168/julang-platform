/* ===== CSRF 防護中間件 v7.2 ===== */
// 策略：對非安全方法（POST/PUT/PATCH/DELETE）驗證 Origin/Referer
// 生產環境建議配合 CSRF Token（本實現為輕量版）

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:8080').split(',');

function csrfProtection(req, res, next) {
  // 安全方法跳過
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();

  // 檢查 Origin
  const origin = req.headers.origin;
  if (origin && !ALLOWED_ORIGINS.includes(origin)) {
    console.warn(`[CSRF] Blocked request from origin: ${origin}`);
    return res.status(403).json({ code: 403, message: 'CSRF 驗證失敗：非法來源' });
  }

  // 檢查 Referer（備用）
  const referer = req.headers.referer;
  if (!origin && referer) {
    const refererOrigin = new URL(referer).origin;
    if (!ALLOWED_ORIGINS.includes(refererOrigin)) {
      console.warn(`[CSRF] Blocked request from referer: ${refererOrigin}`);
      return res.status(403).json({ code: 403, message: 'CSRF 驗證失敗：非法來源' });
    }
  }

  // API Key 認證的請求（OpenAPI）跳過 CSRF（因為是非瀏覽器客戶端）
  if (req.headers['x-api-key']) return next();

  next();
}

module.exports = { csrfProtection };
