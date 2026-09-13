/* ===== 統一錯誤處理中間件 v7.2 ===== */

function errorHandler(err, req, res, next) {
  // 記錄錯誤
  console.error(`[Error] ${req.method} ${req.path} | ${err.name}: ${err.message}`);

  // Prisma 錯誤處理
  if (err.code === 'P2002') {
    return res.status(409).json({ code: 409, message: '數據已存在（唯一約束違反）' });
  }
  if (err.code === 'P2025') {
    return res.status(404).json({ code: 404, message: '記錄不存在' });
  }
  if (err.code === 'P2003') {
    return res.status(400).json({ code: 400, message: '外鍵約束違反' });
  }

  // JWT 錯誤
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({ code: 401, message: '無效的認證令牌' });
  }
  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({ code: 401, message: '認證令牌已過期' });
  }

  // 驗證錯誤
  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    return res.status(400).json({ code: 400, message: err.message || '輸入驗證失敗' });
  }

  // 默認 500
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    code: err.status || 500,
    message: isDev ? (err.message || '伺服器內部錯誤') : '伺服器內部錯誤',
    ...(isDev && { stack: err.stack }),
  });
}

module.exports = { errorHandler };
