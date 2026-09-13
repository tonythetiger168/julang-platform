const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');

const COIN_PACKAGES = [
  { id: 'mini', coins: 60, price: 6, bonus: 0, label: '60幣' },
  { id: 'standard', coins: 330, price: 30, bonus: 30, label: '330+30幣' },
  { id: 'mega', coins: 1200, price: 98, bonus: 200, label: '1200+200幣' },
  { id: 'ultra', coins: 3000, price: 198, bonus: 800, label: '3000+800幣' },
];
const EPISODE_COST = { early: 0, standard: 5, premium: 8, finale: 10 };
// v7.2：連看獎勵（與前端 player.js 對齊）
const BINGE_REWARDS = { 3: 5, 5: 10 };

async function getPackages(req, res) {
  success(res, COIN_PACKAGES);
}

async function getBalance(req, res) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { coins: true } });
    success(res, { coins: user?.coins || 0 });
  } catch (e) {
    error(res, 500, '獲取失敗');
  }
}

// v7.2 修復：購買改為「建單 pending → 支付回調確認」兩段式，杜絕無支付直接發幣
// paymentMock=true（預設，Demo/開發用）時立即確認；正式環境設 PAYMENT_MOCK=false 並實現支付網關回調
async function purchaseCoins(req, res) {
  try {
    const { packageId, clientOrderId } = req.body || {};
    const pkg = COIN_PACKAGES.find((p) => p.id === packageId);
    if (!pkg) return error(res, 400, '無效的硬幣包');
    if (clientOrderId != null && (typeof clientOrderId !== 'string' || clientOrderId.length > 64)) {
      return error(res, 400, '無效的訂單號');
    }
    // 冪等：同一 clientOrderId 重複提交直接返回原訂單
    if (clientOrderId) {
      const dup = await prisma.coinTransaction.findFirst({
        where: { userId: req.user.userId, orderId: clientOrderId, type: 'purchase' },
      });
      if (dup) return success(res, { coins: dup.amount, orderId: clientOrderId, duplicated: true }, '訂單已處理');
    }
    const totalCoins = pkg.coins + pkg.bonus;
    const mockPay = process.env.PAYMENT_MOCK !== 'false';
    if (!mockPay) {
      // 正式模式：僅建立待支付訂單，等待支付網關回調 confirmPayment
      const orderId = clientOrderId || `coin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await prisma.coinTransaction.create({
        data: { userId: req.user.userId, type: 'purchase', amount: totalCoins, cost: pkg.price, orderId, status: 'pending', description: `購買 ${pkg.label}` },
      });
      return success(res, { orderId, status: 'pending' }, '訂單已建立，待支付確認');
    }
    const orderId = clientOrderId || `coin_${Date.now()}`;
    await prisma.$transaction([
      prisma.coinTransaction.create({
        data: { userId: req.user.userId, type: 'purchase', amount: totalCoins, cost: pkg.price, orderId, status: 'completed', description: `購買 ${pkg.label}（模擬支付）` },
      }),
      prisma.user.update({ where: { id: req.user.userId }, data: { coins: { increment: totalCoins } } }),
    ]);
    success(res, { coins: totalCoins, orderId }, `購買成功，+${totalCoins} 幣`);
  } catch (e) {
    if (e.code === 'P2002') return success(res, { duplicated: true }, '訂單已處理');
    console.error(e);
    error(res, 500, '購買失敗');
  }
}

async function unlockEpisode(req, res) {
  try {
    const { dramaId, episodeId } = req.body || {};
    if (!dramaId || !episodeId) return error(res, 400, '缺少參數');
    const unlocked = await prisma.unlockedEpisode.findFirst({
      where: { userId: req.user.userId, dramaId, episodeId },
    });
    if (unlocked) return success(res, { alreadyUnlocked: true }, '已解鎖');
    const episode = await prisma.episode.findUnique({ where: { id: episodeId } });
    if (!episode) return error(res, 404, '劇集不存在');
    let cost = EPISODE_COST.premium;
    if (episode.sequence <= 5) cost = EPISODE_COST.early;
    else if (episode.sequence <= 20) cost = EPISODE_COST.standard;
    if (episode.sequence >= (await prisma.episode.count({ where: { dramaId } }))) cost = EPISODE_COST.finale;
    if (cost === 0) {
      await prisma.unlockedEpisode.create({ data: { userId: req.user.userId, dramaId, episodeId, cost: 0 } });
      return success(res, { cost: 0 }, '免費解鎖');
    }
    // v7.2 修復：條件扣幣代替「先查後扣」，從根本上杜絕並發透支
    const dec = await prisma.user.updateMany({
      where: { id: req.user.userId, coins: { gte: cost } },
      data: { coins: { decrement: cost } },
    });
    if (dec.count === 0) {
      const u = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { coins: true } });
      return error(res, 402, `硬幣不足，需要 ${cost} 幣，當前 ${u?.coins || 0} 幣`);
    }
    try {
      await prisma.$transaction([
        prisma.unlockedEpisode.create({ data: { userId: req.user.userId, dramaId, episodeId, cost } }),
        prisma.coinTransaction.create({ data: { userId: req.user.userId, type: 'spend', amount: -cost, description: `解鎖劇集 ${episodeId}` } }),
      ]);
    } catch (e) {
      // 解鎖記錄撞唯一鍵（並發重複解鎖）：退回硬幣
      if (e.code === 'P2002') {
        await prisma.user.update({ where: { id: req.user.userId }, data: { coins: { increment: cost } } });
        return success(res, { alreadyUnlocked: true }, '已解鎖');
      }
      throw e;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { coins: true } });
    success(res, { cost, remaining: user?.coins || 0 }, `解鎖成功，消耗 ${cost} 幣`);
  } catch (e) {
    console.error(e);
    error(res, 500, '解鎖失敗');
  }
}

// v7.2 新增：連看獎勵（前端 player.js 連看 3/5 集觸發），每檔每日限領一次
async function bingeReward(req, res) {
  try {
    const count = Number(req.body?.count);
    const reward = BINGE_REWARDS[count];
    if (!reward) return error(res, 400, '無效的連看檔位');
    const { todayStart } = require('../utils/checkin');
    const today = todayStart();
    const dup = await prisma.coinTransaction.findFirst({
      where: { userId: req.user.userId, type: 'binge', description: `連看${count}集`, createdAt: { gte: today } },
    });
    if (dup) return success(res, { coins: 0, duplicated: true }, '今日已領取該獎勵');
    await prisma.$transaction([
      prisma.user.update({ where: { id: req.user.userId }, data: { coins: { increment: reward } } }),
      prisma.coinTransaction.create({ data: { userId: req.user.userId, type: 'binge', amount: reward, description: `連看${count}集` } }),
    ]);
    success(res, { coins: reward }, `連看獎勵 +${reward} 幣`);
  } catch (e) {
    console.error(e);
    error(res, 500, '領取失敗');
  }
}

async function getUnlockStatus(req, res) {
  try {
    const { dramaId } = req.params;
    const unlocked = await prisma.unlockedEpisode.findMany({
      where: { userId: req.user.userId, dramaId },
      select: { episodeId: true },
    });
    success(res, unlocked.map((u) => u.episodeId));
  } catch (e) {
    error(res, 500, '獲取失敗');
  }
}

module.exports = { getPackages, getBalance, purchaseCoins, unlockEpisode, bingeReward, getUnlockStatus };
