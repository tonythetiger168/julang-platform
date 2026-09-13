const jwt = require('jsonwebtoken');

// v7.2 修復：生產環境缺少 JWT_SECRET 時直接拒絕啟動，避免使用公開的預設密鑰
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ 致命錯誤：生產環境必須設置 JWT_SECRET 環境變數');
    process.exit(1);
  }
  console.warn('⚠️  未設置 JWT_SECRET，使用開發用密鑰（僅限本地開發）');
}
const SECRET = JWT_SECRET || 'julang-dev-secret';

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ code: 401, message: '未授權' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ code: 401, message: 'Token 無效' });
  }
}

module.exports = auth;
module.exports.authenticate = auth;

// v6.0 深化：可選登入（公開接口中識別登入用戶，如評論列表的 mine 標記）
function optionalAuth(req, _res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try { req.user = jwt.verify(token, SECRET); } catch { /* 忽略無效 token */ }
  }
  next();
}
module.exports.optionalAuth = optionalAuth;

// v7.2 新增：校驗用戶仍然存在且狀態正常（封禁用戶即時失效）
function activeUser(req, res, next) {
  const prisma = require('../utils/prisma');
  prisma.user.findUnique({ where: { id: req.user.userId }, select: { status: true } })
    .then((u) => {
      if (!u || u.status !== 1) return res.status(401).json({ code: 401, message: '帳號不存在或已被停用' });
      next();
    })
    .catch(() => res.status(500).json({ code: 500, message: '伺服器內部錯誤' }));
}
module.exports.activeUser = activeUser;
