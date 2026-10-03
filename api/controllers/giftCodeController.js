const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');

// v7.2 修復：禮品碼表仍為內建配置（遷庫前），但 redeem 加型別校驗與並發保護；
// listCodes 路由已移除（此前無需登入即暴露全部碼/上限/過期時間）
const GIFT_CODES = {
  'JULANG2026': { coins: 100, expires: '2026-12-31', maxUses: 1000 },
  'WELCOME50': { coins: 50, expires: '2026-09-30', maxUses: 5000 },
  'VIPBONUS': { coins: 200, expires: '2026-10-31', maxUses: 100, vipOnly: true },
  'DRAMABOX': { coins: 30, expires: '2026-12-31', maxUses: 10000 },
};

async function redeemCode(req, res) {
  try {
    const { code } = req.body || {};
    if (typeof code !== 'string' || !/^[A-Za-z0-9_-]{4,32}$/.test(code.trim())) {
      return error(res, 400, '禮品碼格式不正確');
    }
    const normalized = code.trim().toUpperCase();
    const gift = GIFT_CODES[normalized];
    if (!gift) return error(res, 404, '無效的禮品碼');
    if (new Date(gift.expires + 'T23:59:59+08:00') < new Date()) return error(res, 400, '禮品碼已過期');
    if (gift.vipOnly) {
      const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { vipLevel: true } });
      if (!user?.vipLevel) return error(res, 403, '此禮品碼僅 VIP 用戶可用');
    }
    try {
      await prisma.$transaction(async (tx) => {
        // 事務內重查，避免並發超限/重複兌換
        const alreadyUsed = await tx.giftRedemption.findFirst({
          where: { code: normalized, userId: req.user.userId },
        });
        if (alreadyUsed) throw Object.assign(new Error('你已兌換過此禮品碼'), { code: 'BIZ_400' });
        const usedCount = await tx.giftRedemption.count({ where: { code: normalized } });
        if (usedCount >= gift.maxUses) throw Object.assign(new Error('禮品碼已兌換完畢'), { code: 'BIZ_400' });
        await tx.giftRedemption.create({ data: { code: normalized, userId: req.user.userId, coins: gift.coins } });
        await tx.user.update({ where: { id: req.user.userId }, data: { coins: { increment: gift.coins } } });
        await tx.coinTransaction.create({
          data: { userId: req.user.userId, type: 'reward', amount: gift.coins, description: `禮品碼兌換: ${normalized}` },
        });
      });
    } catch (e) {
      if (e.code === 'BIZ_400') return error(res, 400, e.message);
      if (e.code === 'P2002') return error(res, 400, '你已兌換過此禮品碼');
      throw e;
    }
    success(res, { coins: gift.coins }, `兌換成功，+${gift.coins} 幣`);
  } catch (e) {
    console.error(e);
    error(res, 500, '兌換失敗');
  }
}

module.exports = { redeemCode };
