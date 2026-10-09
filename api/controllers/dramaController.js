/* ===== 劇集控制器 (v7.2) =====
 *
 * 契約來自 api/routes/drama.js 與 routes/index.js：
 *   getRecommendations / search / getCategories / getRankings
 *   getDrama / getEpisodes / toggleFollow / recordWatch
 *
 * 兩個必須注意的型別陷阱（Prisma + Postgres）：
 *   · `Drama.views` 是 BigInt —— BigInt 不能 JSON 序列化，`res.json()` 會直接丟
 *     TypeError，所以出口一定要轉 number。
 *   · `Drama.rating` 是 Decimal（decimal.js 物件）—— 序列化會變成字串，前端比較
 *     會壞掉，一樣轉 number。
 *
 * 形狀契約（沿用 demo 層，前端 render.js 依賴）：**列表的 `episodes` 必須是數字**
 * （卡片印 `${drama.episodes}集`），只有詳情（getDrama）才回傳集數陣列。
 */
const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');

/* v7.3：付費牆 —— 前 N 集免費。
 * 這是**全專案唯一定義**：adController 用 require('./dramaController') 取同一份，
 * 測試也從這裡 import，避免「前端說 5 集、後端說 3 集」的漂移。 */
const FREE_EPISODES = 5;

// BigInt / Decimal / string -> number（壞值回 fallback）
function num(v, fallback = 0) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

const CARD_SELECT = {
  id: true, title: true, desc: true, cover: true, totalEpisodes: true,
  isFree: true, pricePerEp: true, views: true, likes: true, rating: true,
  createdAt: true, category: { select: { id: true, name: true } },
};

const EPISODE_SELECT = {
  id: true, episodeNumber: true, title: true, videoUrl: true, duration: true,
};

function toCard(d) {
  return {
    id: d.id,
    title: d.title,
    desc: d.desc,
    cover: d.cover,
    category: d.category ? d.category.name : null,
    categoryId: d.category ? d.category.id : null,
    episodes: d.totalEpisodes || 0,
    totalEpisodes: d.totalEpisodes || 0,
    isFree: !!d.isFree,
    pricePerEp: d.pricePerEp || 0,
    views: num(d.views),
    likes: d.likes || 0,
    rating: num(d.rating),
    createdAt: d.createdAt,
  };
}

function pageLimit(req, def = 20, max = 50) {
  const n = parseInt(req.query && req.query.limit, 10);
  return Math.min(Math.max(Number.isNaN(n) ? def : n, 1), max);
}

/* ===== v7.3 付費牆 =====================================================
 * 每集對外要帶 free / unlocked / locked / cost 四個欄位，且 locked 時
 * videoUrl 必須是 null（付費牆不能只是裝飾：沒付錢就別把播放位址交出去）。
 * getDrama 與 getEpisodes 共用這兩個小工具，避免兩邊形狀漂移。
 */

// 該集是否免費：整齣免費，或集數落在前 FREE_EPISODES 集內
function isFreeEpisode(dramaIsFree, episode) {
  return dramaIsFree === true || num(episode.episodeNumber) <= FREE_EPISODES;
}

// 該用戶在這齣劇已解鎖的 episodeId 集合。
// 未登入 → 空集合（不是錯誤）；查詢失敗 → 也回空集合（fail-closed：寧可少解鎖，不可誤放行）。
async function loadUnlockedIds(userId, dramaId) {
  if (!userId || !dramaId) return new Set();
  try {
    // 沒有解鎖記錄就沒必要查 DB（免費劇 / 未登入 / 空劇）
    if (!prisma.unlockedEpisode || typeof prisma.unlockedEpisode.findMany !== 'function') return new Set();
    const rows = await prisma.unlockedEpisode.findMany({
      where: { userId, dramaId },
      select: { episodeId: true },
    });
    return new Set((rows || []).map((r) => r.episodeId));
  } catch (e) {
    console.error(e);
    return new Set();
  }
}

// 統一的「每集輸出」形狀（getDrama 與 getEpisodes 共用）
function toEpisode(e, ctx) {
  const free = isFreeEpisode(ctx.dramaIsFree, e);
  const unlocked = free || ctx.unlockedIds.has(e.id);
  const locked = !unlocked;
  return {
    id: e.id,
    episodeNumber: e.episodeNumber,
    title: e.title,
    duration: e.duration,
    videoUrl: locked ? null : e.videoUrl,
    free,
    unlocked,
    locked,
    // 契約：需要解鎖時為 Drama.pricePerEp；免費集為 0
    cost: free ? 0 : num(ctx.pricePerEp),
  };
}

// 需要查 UnlockedEpisode 嗎？（整齣免費 / 未登入 / 沒有集數都免查）
function needsUnlockLookup(drama, userId, episodeCount) {
  return drama.isFree !== true && !!userId && episodeCount > 0;
}

/* v7.7：社群互動數字（追劇人數 followCount / 留言數 commentCount）用**真實的 count**，
 * 絕不寫死或估算（專案對「不造假」有硬性要求，見 HANDOFF §1.5）。
 * 但這兩筆是附加資訊，查不到時要**優雅降級為 0**，不能讓整個詳情端點 500：
 *   · model 不存在（例如測試用的 mocked Prisma 沒有這個 model）→ 0
 *   · 查詢丟錯（DB 暫時性問題）→ 0，並記 console.error */
async function safeCount(model, args) {
  try {
    if (!model || typeof model.count !== 'function') return 0;
    return num(await model.count(args));
  } catch (e) {
    console.error(e);
    return 0;
  }
}

const PUBLISHED = { status: 1, auditStatus: 'approved' };

// GET /dramas/recommend
async function getRecommendations(req, res) {
  try {
    const list = await prisma.drama.findMany({
      where: PUBLISHED,
      orderBy: [{ rating: 'desc' }, { views: 'desc' }],
      take: pageLimit(req),
      select: CARD_SELECT,
    });
    success(res, { total: list.length, page: 1, list: list.map(toCard) });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取推薦失敗');
  }
}

// GET /dramas/search?q=
async function search(req, res) {
  try {
    const q = String((req.query && req.query.q) || '').trim();
    if (!q) return success(res, { total: 0, page: 1, list: [], q: '' });
    const list = await prisma.drama.findMany({
      where: {
        ...PUBLISHED,
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { desc: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { views: 'desc' },
      take: pageLimit(req),
      select: CARD_SELECT,
    });
    success(res, { total: list.length, page: 1, q, list: list.map(toCard) });
  } catch (e) {
    console.error(e);
    error(res, 500, '搜尋失敗');
  }
}

// GET /categories（前端 loadCategories 期望 res.data 是陣列）
async function getCategories(req, res) {
  try {
    const rows = await prisma.category.findMany({
      where: { status: 1 },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true, icon: true, _count: { select: { dramas: true } } },
    });
    success(res, rows.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      dramaCount: (c._count && c._count.dramas) || 0,
    })));
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取分類失敗');
  }
}

// GET /rankings/:type  (hot | new | rate)
const RANK_ORDER = {
  hot: [{ views: 'desc' }],
  new: [{ createdAt: 'desc' }],
  rate: [{ rating: 'desc' }],
};

async function getRankings(req, res) {
  try {
    const type = String(req.params.type || 'hot');
    if (!RANK_ORDER[type]) return error(res, 400, '無效的排行榜類型（hot / new / rate）');
    const list = await prisma.drama.findMany({
      where: PUBLISHED,
      orderBy: RANK_ORDER[type],
      take: pageLimit(req, 20, 100),
      select: CARD_SELECT,
    });
    success(res, { type, total: list.length, list: list.map(toCard) });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取排行榜失敗');
  }
}

// GET /dramas/:id —— 唯一會回傳 episodes 陣列的端點
// 掛 optionalAuth：有登入才查 UnlockedEpisode 算 unlocked，未登入只有免費集為 true。
async function getDrama(req, res) {
  try {
    const userId = req.user && req.user.userId;
    const d = await prisma.drama.findUnique({
      where: { id: req.params.id },
      select: {
        ...CARD_SELECT,
        episodes: { where: { status: 1 }, orderBy: { episodeNumber: 'asc' }, select: EPISODE_SELECT },
      },
    });
    if (!d) return error(res, 404, '劇集不存在');
    const card = toCard(d);
    const episodes = d.episodes || [];
    const unlockedIds = needsUnlockLookup(d, userId, episodes.length)
      ? await loadUnlockedIds(userId, d.id)
      : new Set();
    const ctx = { dramaIsFree: d.isFree, pricePerEp: d.pricePerEp, unlockedIds };
    card.episodes = episodes.map((e) => toEpisode(e, ctx));
    card.freeEpisodes = FREE_EPISODES;
    // v7.7：右側操作列要顯示的兩個真實數字。放在最後、各自獨立降級，
    // 所以就算其中一個查詢壞了，付費牆欄位與 freeEpisodes 契約完全不受影響。
    const [followCount, commentCount] = await Promise.all([
      safeCount(prisma.userFollow, { where: { dramaId: d.id } }),
      safeCount(prisma.comment, { where: { dramaId: d.id } }),
    ]);
    card.followCount = followCount;
    card.commentCount = commentCount;
    success(res, card);
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取劇集失敗');
  }
}

// GET /dramas/:id/episodes（掛 optionalAuth）
async function getEpisodes(req, res) {
  try {
    const userId = req.user && req.user.userId;
    const drama = await prisma.drama.findUnique({
      where: { id: req.params.id },
      select: { id: true, isFree: true, pricePerEp: true, totalEpisodes: true },
    });
    if (!drama) return error(res, 404, '劇集不存在');
    const list = await prisma.episode.findMany({
      where: { dramaId: drama.id, status: 1 },
      orderBy: { episodeNumber: 'asc' },
      select: EPISODE_SELECT,
    });
    const unlockedIds = needsUnlockLookup(drama, userId, list.length)
      ? await loadUnlockedIds(userId, drama.id)
      : new Set();
    const ctx = { dramaIsFree: drama.isFree, pricePerEp: drama.pricePerEp, unlockedIds };
    success(res, {
      dramaId: drama.id,
      isFree: !!drama.isFree,
      pricePerEp: drama.pricePerEp || 0,
      freeEpisodes: FREE_EPISODES,
      total: list.length,
      list: list.map((e) => toEpisode(e, ctx)),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取集數失敗');
  }
}

// POST /dramas/:id/follow（需登入）
async function toggleFollow(req, res) {
  try {
    const dramaId = req.params.id;
    const userId = req.user.userId;
    const drama = await prisma.drama.findUnique({ where: { id: dramaId }, select: { id: true } });
    if (!drama) return error(res, 404, '劇集不存在');
    const existing = await prisma.userFollow.findUnique({
      where: { userId_dramaId: { userId, dramaId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.userFollow.delete({ where: { id: existing.id } });
      return success(res, { following: false, dramaId });
    }
    await prisma.userFollow.create({ data: { userId, dramaId } });
    success(res, { following: true, dramaId });
  } catch (e) {
    console.error(e);
    error(res, 500, '追劇操作失敗');
  }
}

// POST /dramas/:id/watch（需登入）
async function recordWatch(req, res) {
  try {
    const dramaId = req.params.id;
    const userId = req.user.userId;
    const body = req.body || {};
    const episodeId = body.episodeId ? String(body.episodeId) : null;
    const progressSeconds = Math.max(0, parseInt(body.progressSeconds, 10) || 0);

    const drama = await prisma.drama.findUnique({ where: { id: dramaId }, select: { id: true } });
    if (!drama) return error(res, 404, '劇集不存在');

    // episodeId 可為 null，但 Postgres 的 unique index 不把兩個 NULL 視為相等，
    // 所以只有在有 episodeId 時才能用複合唯一鍵 upsert。
    if (episodeId) {
      await prisma.watchHistory.upsert({
        where: { userId_dramaId_episodeId: { userId, dramaId, episodeId } },
        update: { progressSeconds, watchedAt: new Date() },
        create: { userId, dramaId, episodeId, progressSeconds },
      });
    } else {
      await prisma.watchHistory.create({ data: { userId, dramaId, episodeId: null, progressSeconds } });
    }

    await prisma.drama.update({ where: { id: dramaId }, data: { views: { increment: 1 } } });
    success(res, { recorded: true, dramaId, episodeId, progressSeconds });
  } catch (e) {
    console.error(e);
    error(res, 500, '記錄觀看失敗');
  }
}

module.exports = {
  getRecommendations,
  search,
  getCategories,
  getRankings,
  getDrama,
  getEpisodes,
  toggleFollow,
  recordWatch,
  FREE_EPISODES,
  // 匯出給測試用（不是路由需要的）
  _toCard: toCard,
  _num: num,
  _toEpisode: toEpisode,
  _isFreeEpisode: isFreeEpisode,
  _safeCount: safeCount,
};
