// ===== v6.0 OpenAPI AccessKey 鑒權 =====
// 請求頭：X-Api-Key: jl-xxxx...
// 校驗 sha256 哈希 → 檢查配額 → 掛載 req.apiKey / req.apiUser

const crypto = require('crypto');

const prisma = require('../utils/prisma');
const { error } = require('../utils/response');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

async function apiKeyAuth(req, res, next) {
  const key = req.headers['x-api-key'] || '';
  if (!key.startsWith('jl-')) return error(res, 401, '缺少有效的 X-Api-Key（jl- 開頭）');
  try {
    const apiKey = await prisma.apiKey.findUnique({
      where: { keyHash: hashKey(key) },
      include: { user: { select: { id: true, nickname: true, status: true } } },
    });
    if (!apiKey || apiKey.revokedAt) return error(res, 401, 'AccessKey 無效或已吊銷');
    if (apiKey.user.status !== 1) return error(res, 403, '賬戶狀態異常');
    if (apiKey.used >= apiKey.quota) return error(res, 429, `AccessKey 配額已用完（${apiKey.quota} 點）`);
    req.apiKey = apiKey;
    req.apiUser = apiKey.user;
    next();
  } catch (e) {
    console.error(e);
    error(res, 500, '鑒權失敗');
  }
}

// 計費：按模型成本扣減 AccessKey 配額（在響應成功後調用）
async function chargeApiKey(apiKeyId, cost) {
  return prisma.apiKey.update({
    where: { id: apiKeyId },
    data: { used: { increment: cost }, lastUsedAt: new Date() },
  }).catch(() => {});
}

module.exports = { apiKeyAuth, hashKey, chargeApiKey };
