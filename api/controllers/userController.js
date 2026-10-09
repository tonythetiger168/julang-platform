/* ===== 用戶控制器 (v7.2) =====
 *
 * 契約來自 api/routes/user.js：
 *   getProfile / getCoins / checkin / getFollows / getHistory
 *
 * `checkin` 直接**委派**給 checkinController.dailyCheckin：簽到邏輯（UTC+8 跨日、
 * 連續天數、CoinTransaction）已經有一份被 tests/checkin.test.js 覆蓋的實作，
 * 不在這裡重寫第二套。
 *
 * 注意：`UserFollow` 與 `WatchHistory` 在 schema.prisma 裡**沒有** drama 關聯欄位
 * （只有 dramaId），所以劇名/封面要用第二次查詢補上，不能寫 `select: { drama: … }`。
 */
const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');
const checkinController = require('./checkinController');

const PROFILE_SELECT = {
  id: true, phone: true, nickname: true, avatar: true, coins: true,
  vipLevel: true, vipExpireAt: true, inviteCode: true, isCreator: true,
  status: true, createdAt: true, lastLoginAt: true,
};

// GET /user/profile
async function getProfile(req, res) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: PROFILE_SELECT });
    if (!user) return error(res, 404, '用戶不存在');
    success(res, user);
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取資料失敗');
  }
}

// GET /user/coins（前端 loadUserCoins 讀 res.data.coins）
async function getCoins(req, res) {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.userId }, select: { coins: true } });
    if (!user) return error(res, 404, '用戶不存在');
    success(res, { coins: user.coins });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取金幣失敗');
  }
}

// POST /user/checkin —— 委派，不重寫
function checkin(req, res) {
  if (!checkinController || typeof checkinController.dailyCheckin !== 'function') {
    return error(res, 501, '簽到功能尚未實作');
  }
  return checkinController.dailyCheckin(req, res);
}

// GET /user/follows
async function getFollows(req, res) {
  try {
    const rows = await prisma.userFollow.findMany({
      where: { userId: req.user.userId },
      orderBy: { updatedAt: 'desc' },
      select: { dramaId: true, lastEpisode: true, progressSeconds: true, createdAt: true },
    });
    const ids = rows.map((r) => r.dramaId);
    const dramas = ids.length
      ? await prisma.drama.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true, cover: true, totalEpisodes: true },
        })
      : [];
    const byId = new Map(dramas.map((d) => [d.id, d]));
    success(res, rows.map((r) => {
      const d = byId.get(r.dramaId) || {};
      return {
        dramaId: r.dramaId,
        title: d.title || null,
        cover: d.cover || null,
        totalEpisodes: d.totalEpisodes || 0,
        lastEpisode: r.lastEpisode,
        progressSeconds: r.progressSeconds,
        createdAt: r.createdAt,
      };
    }));
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取追劇失敗');
  }
}

// GET /user/history
async function getHistory(req, res) {
  try {
    const rows = await prisma.watchHistory.findMany({
      where: { userId: req.user.userId },
      orderBy: { watchedAt: 'desc' },
      take: 50,
      select: { dramaId: true, episodeId: true, progressSeconds: true, watchedAt: true },
    });
    const ids = [...new Set(rows.map((r) => r.dramaId))];
    const dramas = ids.length
      ? await prisma.drama.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true, cover: true, totalEpisodes: true },
        })
      : [];
    const byId = new Map(dramas.map((d) => [d.id, d]));
    success(res, rows.map((r) => {
      const d = byId.get(r.dramaId) || {};
      return {
        dramaId: r.dramaId,
        episodeId: r.episodeId,
        title: d.title || null,
        cover: d.cover || null,
        totalEpisodes: d.totalEpisodes || 0,
        progressSeconds: r.progressSeconds,
        watchedAt: r.watchedAt,
      };
    }));
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取觀看紀錄失敗');
  }
}

module.exports = { getProfile, getCoins, checkin, getFollows, getHistory };
