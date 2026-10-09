const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');
const { todayStart } = require('../utils/checkin');
// FREE_EPISODES 只有一份定義（dramaController），這裡共用同一份，避免免費集判定漂移
const { FREE_EPISODES } = require('./dramaController');

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

/* POST /ads/watch
 *
 * 兩種模式（body 選填 { dramaId, episodeId }）：
 *   1. 沒帶 → 原本的「看廣告領幣」：AdWatchLog + coins + CoinTransaction(type:'ad')，
 *      回 { coins, remaining }。行為與 v7.2 完全一致。
 *   2. 帶了 → 「看廣告解鎖某集」：驗證集數屬於該劇且非免費集，然後在同一個
 *      $transaction 內寫 AdWatchLog + upsert UnlockedEpisode(cost: 0)，
 *      **不發幣**，回 { unlocked, episodeId, method:'ad', remaining }。
 *
 * 反濫用（每日上限 DAILY_AD_LIMIT + 最短間隔 MIN_WATCH_INTERVAL_MS）兩種模式共用，
 * 不改任何一個判斷條件。差別只在「已解鎖 / 免費集」這兩個不需要消耗廣告的情境
 * 會提前返回（先查再決定），因此不會被計次、也不會被間隔擋下。
 */
async function watchAd(req, res) {
  try {
    const userId = req.user.userId;
    const body = req.body || {};
    const dramaId = body.dramaId ? String(body.dramaId) : null;
    const episodeId = body.episodeId ? String(body.episodeId) : null;

    // 只帶一半是壞請求：寧可報錯，也不要默默當成「領幣模式」把幣發出去
    if ((dramaId && !episodeId) || (episodeId && !dramaId)) {
      return error(res, 400, '廣告解鎖需要同時提供 dramaId 與 episodeId');
    }
    const target = dramaId && episodeId ? { dramaId, episodeId } : null;

    if (target) {
      const [drama, episode] = await Promise.all([
        prisma.drama.findUnique({
          where: { id: target.dramaId },
          select: { id: true, isFree: true },
        }),
        prisma.episode.findUnique({
          where: { id: target.episodeId },
          select: { id: true, dramaId: true, episodeNumber: true },
        }),
      ]);
      // 集數不存在、劇不存在、或集數不屬於這齣劇 → 404（不區分，避免探測）
      if (!drama || !episode || episode.dramaId !== target.dramaId) {
        return error(res, 404, '劇集不存在');
      }
      // 免費集：沒有廣告可看，也沒有紀錄可寫（不佔每日次數）
      if (drama.isFree === true || Number(episode.episodeNumber) <= FREE_EPISODES) {
        return success(res, { unlocked: true, free: true }, '免費集數，無需觀看廣告');
      }
      // 先查再決定：重複解鎖不寫第二筆 AdWatchLog、不重複扣廣告次數
      const existing = await prisma.unlockedEpisode.findUnique({
        where: {
          userId_dramaId_episodeId: {
            userId,
            dramaId: target.dramaId,
            episodeId: target.episodeId,
          },
        },
        select: { id: true },
      });
      if (existing) return success(res, { unlocked: true, alreadyUnlocked: true }, '本集已解鎖');
    }

    // ===== 反濫用：兩種模式共用（維持既有條件與訊息）=====
    const today = todayStart();
    const [todayWatched, lastWatch] = await Promise.all([
      prisma.adWatchLog.count({ where: { userId, createdAt: { gte: today } } }),
      prisma.adWatchLog.findFirst({ where: { userId }, orderBy: { createdAt: 'desc' } }),
    ]);
    if (todayWatched >= DAILY_AD_LIMIT) {
      return error(res, 429, `今日廣告次數已用完（${DAILY_AD_LIMIT}/${DAILY_AD_LIMIT}）`);
    }
    if (lastWatch && Date.now() - new Date(lastWatch.createdAt).getTime() < MIN_WATCH_INTERVAL_MS) {
      return error(res, 429, '觀看過於頻繁，請稍後再試');
    }

    if (target) {
      // 廣告解鎖模式：同一個 transaction 內寫觀看紀錄 + 解鎖紀錄
      // reward: 0 —— 這次廣告換的是「解鎖」，不是硬幣；cost: 0 同理
      await prisma.$transaction([
        prisma.adWatchLog.create({ data: { userId, reward: 0 } }),
        prisma.unlockedEpisode.upsert({
          where: {
            userId_dramaId_episodeId: {
              userId,
              dramaId: target.dramaId,
              episodeId: target.episodeId,
            },
          },
          update: { cost: 0 },
          create: { userId, dramaId: target.dramaId, episodeId: target.episodeId, cost: 0 },
        }),
      ]);
      const remaining = Math.max(0, DAILY_AD_LIMIT - todayWatched - 1);
      return success(res, { unlocked: true, episodeId: target.episodeId, method: 'ad', remaining }, '觀看成功，已解鎖本集');
    }

    // ===== 原本的領幣模式（行為不變）=====
    // TODO（正式上線）：改為廣告平台 server-side callback 驗籤後才發幣
    await prisma.$transaction([
      prisma.adWatchLog.create({ data: { userId, reward: AD_REWARD } }),
      prisma.user.update({ where: { id: userId }, data: { coins: { increment: AD_REWARD } } }),
      prisma.coinTransaction.create({ data: { userId, type: 'ad', amount: AD_REWARD, description: '觀看激勵廣告' } }),
    ]);
    const remaining = DAILY_AD_LIMIT - todayWatched - 1;
    success(res, { coins: AD_REWARD, remaining }, `觀看成功，+${AD_REWARD} 幣，今日還剩 ${remaining} 次`);
  } catch (e) {
    console.error(e);
    error(res, 500, '失敗');
  }
}

module.exports = { getStatus, watchAd };
