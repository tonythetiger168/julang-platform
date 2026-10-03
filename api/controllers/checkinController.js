const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');
const { CHECKIN_REWARDS, todayStart, dayStartOf, rewardFor } = require('../utils/checkin');

async function getStatus(req, res) {
  try {
    const today = todayStart();
    const lastCheckin = await prisma.checkinLog.findFirst({
      where: { userId: req.user.userId },
      orderBy: { date: 'desc' },
    });
    let streak = 0;
    let canCheckin = true;
    if (lastCheckin) {
      const diffDays = Math.round((today - dayStartOf(lastCheckin.date)) / 86400000);
      if (diffDays === 0) {
        canCheckin = false;
        streak = lastCheckin.streak;
      } else if (diffDays === 1) {
        streak = lastCheckin.streak;
      }
    }
    const nextReward = rewardFor((streak % 7) + 1);
    success(res, { canCheckin, streak, nextReward: nextReward.coins, rewards: CHECKIN_REWARDS });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取失敗');
  }
}

async function dailyCheckin(req, res) {
  try {
    const today = todayStart();
    const lastCheckin = await prisma.checkinLog.findFirst({
      where: { userId: req.user.userId },
      orderBy: { date: 'desc' },
    });
    let streak = 1;
    if (lastCheckin) {
      const diffDays = Math.round((today - dayStartOf(lastCheckin.date)) / 86400000);
      if (diffDays === 0) return error(res, 400, '今日已簽到');
      if (diffDays === 1) streak = Math.min(lastCheckin.streak + 1, 7);
    }
    const reward = rewardFor(streak);
    try {
      await prisma.$transaction([
        prisma.checkinLog.create({ data: { userId: req.user.userId, date: today, streak, coins: reward.coins } }),
        prisma.user.update({ where: { id: req.user.userId }, data: { coins: { increment: reward.coins } } }),
        prisma.coinTransaction.create({ data: { userId: req.user.userId, type: 'reward', amount: reward.coins, description: `連續簽到 ${streak} 天` } }),
      ]);
    } catch (e) {
      // v7.2：並發雙擊由 @@unique([userId, date]) 兜底，轉為友善提示而非 500
      if (e.code === 'P2002') return error(res, 400, '今日已簽到');
      throw e;
    }
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { coins: true } });
    success(res, { streak, coins: reward.coins, coinsEarned: reward.coins, streakDays: streak, totalCoins: user?.coins || 0 }, `連續簽到 ${streak} 天，獲得 ${reward.coins} 幣`);
  } catch (e) {
    console.error(e);
    error(res, 500, '簽到失敗');
  }
}

module.exports = { getStatus, dailyCheckin };
