const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');
const { todayStart } = require('../utils/checkin');

const DAILY_AD_LIMIT = 15;
const AD_REWARD = 2;
const MIN_WATCH_INTERVAL_MS = 10 * 1000; // v7.2：兩次觀看最小間隔，防腳本刷幣

async function getStatus(req, res) {
  try {
    const today = todayStart();
    const todayWatched = await prisma.adWatchLog.count({
      where: { userId: req.user.userId, createdAt: { gte: today } },
    });
    success(res, { watched: todayWatched, limit: DAILY_AD_LIMIT, reward: AD_REWARD, remaining: Math.max(0, DAILY_AD_LIMIT - todayWatched) });
  } catch (e) {
    error(res, 500, '獲取失敗');
  }
}

async function watchAd(req, res) {
  try {
    const today = todayStart();
    const [todayWatched, lastWatch] = await Promise.all([
      prisma.adWatchLog.count({ where: { userId: req.user.userId, createdAt: { gte: today } } }),
      prisma.adWatchLog.findFirst({ where: { userId: req.user.userId }, orderBy: { createdAt: 'desc' } }),
    ]);
    if (todayWatched >= DAILY_AD_LIMIT) {
      return error(res, 429, `今日廣告次數已用完（${DAILY_AD_LIMIT}/${DAILY_AD_LIMIT}）`);
    }
    if (lastWatch && Date.now() - new Date(lastWatch.createdAt).getTime() < MIN_WATCH_INTERVAL_MS) {
      return error(res, 429, '觀看過於頻繁，請稍後再試');
    }
    // TODO（正式上線）：改為廣告平台 server-side callback 驗籤後才發幣
    await prisma.$transaction([
      prisma.adWatchLog.create({ data: { userId: req.user.userId, reward: AD_REWARD } }),
      prisma.user.update({ where: { id: req.user.userId }, data: { coins: { increment: AD_REWARD } } }),
      prisma.coinTransaction.create({ data: { userId: req.user.userId, type: 'ad', amount: AD_REWARD, description: '觀看激勵廣告' } }),
    ]);
    const remaining = DAILY_AD_LIMIT - todayWatched - 1;
    success(res, { coins: AD_REWARD, remaining }, `觀看成功，+${AD_REWARD} 幣，今日還剩 ${remaining} 次`);
  } catch (e) {
    console.error(e);
    error(res, 500, '失敗');
  }
}

module.exports = { getStatus, watchAd };
