/* ===== 創作者控制器 (v7.2) =====
 *
 * 契約來自 api/routes/creator.js（routes/index.js 把 /creators 掛在這支）：
 *   registerSchema / createDramaSchema / updateDramaSchema / addEpisodeSchema
 *   register / getProfile / updateProfile / getMyDramas / createDrama / updateDrama
 *   addEpisode / deleteEpisode / getDashboard / getAuditLogs / getPublicProfile / toggleFollow
 *
 * 四個 schema 必須是**真的 zod object**：`validate(ctrl.X)` 在**路由定義時**就呼叫
 * `.safeParse`，而 PATCH /creators/me/profile 還會先呼叫 `registerSchema.partial()`
 * ——缺了任何一個，整個 server 連啟動都做不到。
 *
 * 三個型別／權限陷阱：
 *   1. `Drama.views` 是 BigInt（`res.json()` 直接丟 TypeError）、`rating` 是 Decimal
 *      （會被序列化成字串）→ 出口一律走 num()。
 *   2. 創作者只能動自己的劇：`Creator.userId === req.user.userId`，不是自己的回 403。
 *      Creator / Drama 都沒有方便的反向欄位可以「一次查完又驗權」，所以固定是
 *      「先查身分 → 再查劇 → 比對 creatorId」。
 *   3. `User.isCreator` 只是快取旗標；真正的來源是 `Creator` 這一列。register 會
 *      同時更新兩邊。
 *
 * 「還不是創作者」在 /me/* 一律回 **404**（找不到 Creator 身分）；403 保留給
 * 「這部劇／這個資源不是你的」。
 *
 * 已知邊界（刻意不做，不假裝）：
 *   · createDrama 不驗 categoryId 是否存在（多一次查詢換來的 FK 錯誤訊息有限），
 *     亂傳的 categoryId 會由資料庫的 FK 擋下並回 500。
 *   · 新劇一律 `auditStatus: 'pending'`、`publishedAt: null`；沒有任何審核端點，
 *     所以這裡不寫 AuditLog（審核紀錄由審核流程寫入）。
 *   · deleteEpisode 是**硬刪除**（Episode 有 status 欄位可做軟刪，但沒有端点使用它）。
 */
const { z } = require('zod');
const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');

// ---------- schema ----------

// 可為 null 的文字欄位：允許前端送 null 來清空
const clearable = (max, label) => z.string().trim().max(max, `${label}最多 ${max} 字`).nullable();

// POST /creators/register（把現有 user 升級成創作者）
// PATCH /creators/me/profile 用 registerSchema.partial()，所以這 5 個欄位都能單獨更新
const registerSchema = z.object({
  realName: z.string().trim().min(1, '請填寫真實姓名').max(50, '姓名最多 50 字'),
  idCard: z.string().trim().min(1).max(40, '證件號最多 40 字').optional(),
  bio: clearable(300, '簡介').optional(),
  avatar: clearable(1000, '頭像網址').optional(),
  nickname: z.string().trim().min(1, '暱稱至少 1 字').max(20, '暱稱最多 20 字').optional(),
});

// POST /creators/me/dramas
// 注意：auditStatus / creatorId / views / rating 都不在 schema 裡 —— validate() 會把
// 多餘欄位剔掉，所以建立時不可能自己指定審核狀態或把劇掛到別人名下。
const createDramaSchema = z.object({
  title: z.string().trim().min(1, '請填寫劇名').max(100, '劇名最多 100 字'),
  desc: clearable(2000, '簡介').optional(),
  cover: clearable(1000, '封面網址').optional(),
  categoryId: clearable(64, '分類').optional(),
  isFree: z.boolean().optional(),
  pricePerEp: z.coerce.number().int('單集價格必須是整數').min(0, '價格不能是負數').max(100000).optional(),
  totalEpisodes: z.coerce.number().int().min(0).max(2000).optional(),
  status: z.coerce.number().int().min(0).max(1).optional(),
});

// PATCH /creators/me/dramas/:id —— 路由沒有用 .partial()，所以這裡全部 optional
const updateDramaSchema = z.object({
  title: z.string().trim().min(1, '請填寫劇名').max(100, '劇名最多 100 字').optional(),
  desc: clearable(2000, '簡介').optional(),
  cover: clearable(1000, '封面網址').optional(),
  categoryId: clearable(64, '分類').optional(),
  isFree: z.boolean().optional(),
  pricePerEp: z.coerce.number().int('單集價格必須是整數').min(0, '價格不能是負數').max(100000).optional(),
  totalEpisodes: z.coerce.number().int().min(0).max(2000).optional(),
  status: z.coerce.number().int().min(0).max(1).optional(),
});

// POST /creators/me/dramas/:id/episodes
const addEpisodeSchema = z.object({
  episodeNumber: z.coerce.number().int().min(1, '集數從 1 開始').max(2000).optional(),
  title: z.string().trim().max(100, '標題最多 100 字').optional(),
  videoUrl: z.string().trim().min(1, '請提供影片網址').max(1000),
  duration: z.coerce.number().int().min(0).max(36000).optional(),
});

// ---------- 工具 ----------

// BigInt / Decimal / string -> number（壞值回 fallback）
function num(v, fallback = 0) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function sumOf(list, pick) {
  return list.reduce((acc, item) => acc + num(pick(item)), 0);
}

// 自己的創作者資料（含 idCard，只回給本人）
const CREATOR_SELECT = {
  id: true, userId: true, realName: true, idCard: true, bio: true, avatar: true,
  verified: true, status: true, createdAt: true, updatedAt: true,
};

// 公開資料：**不含 idCard**
const PUBLIC_CREATOR_SELECT = {
  id: true, userId: true, realName: true, bio: true, avatar: true,
  verified: true, status: true, createdAt: true,
};

const USER_BRIEF = {
  id: true, phone: true, nickname: true, avatar: true, coins: true,
  isCreator: true, createdAt: true,
};

// 列表卡片形狀沿用 dramaController／demo 層：`episodes` 必須是**數字**
const CARD_SELECT = {
  id: true, title: true, desc: true, cover: true, totalEpisodes: true, status: true,
  auditStatus: true, rejectReason: true, isFree: true, pricePerEp: true,
  views: true, likes: true, rating: true, createdAt: true, publishedAt: true,
  category: { select: { id: true, name: true } },
};

const EPISODE_SELECT = {
  id: true, episodeNumber: true, title: true, videoUrl: true, duration: true,
  status: true, createdAt: true,
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
    status: d.status === undefined || d.status === null ? 1 : d.status,
    auditStatus: d.auditStatus || 'pending',
    rejectReason: d.rejectReason || null,
    isFree: !!d.isFree,
    pricePerEp: d.pricePerEp || 0,
    views: num(d.views),
    likes: d.likes || 0,
    rating: num(d.rating),
    publishedAt: d.publishedAt || null,
    createdAt: d.createdAt,
  };
}

function pageArgs(req, def = 20, max = 50) {
  const rawLimit = parseInt(req.query && req.query.limit, 10);
  const take = Math.min(Math.max(Number.isNaN(rawLimit) ? def : rawLimit, 1), max);
  const rawPage = parseInt(req.query && req.query.page, 10);
  const page = Math.max(Number.isNaN(rawPage) ? 1 : rawPage, 1);
  return { take, page, skip: (page - 1) * take };
}

// 每個 /me/* 端點的第一步：確認登入者 + 取得 Creator 身分。
// 不是創作者時**已經回應**，呼叫端只要 `if (!creator) return;` 就好。
async function requireCreator(req, res) {
  const userId = (req.user && req.user.userId) || null;
  if (!userId) {
    error(res, 401, '未授權');
    return null;
  }
  const creator = await prisma.creator.findUnique({ where: { userId }, select: CREATOR_SELECT });
  if (!creator) {
    error(res, 404, '尚未成為創作者');
    return null;
  }
  return creator;
}

// 取自己的劇；不是自己的回 403、不存在回 404（都已回應，回 null）
async function requireOwnDrama(req, res, creator, dramaId) {
  const drama = await prisma.drama.findUnique({
    where: { id: dramaId },
    select: { id: true, creatorId: true, totalEpisodes: true, auditStatus: true },
  });
  if (!drama) {
    error(res, 404, '劇集不存在');
    return null;
  }
  if (drama.creatorId !== creator.id) {
    error(res, 403, '無權操作此劇集');
    return null;
  }
  return drama;
}

function mergeProfile(creator, user) {
  return Object.assign({}, creator, {
    // 有 Creator 這一列就是創作者（User.isCreator 只是快取旗標）
    isCreator: true,
    avatar: creator.avatar || (user && user.avatar) || null,
    nickname: (user && user.nickname) || null,
    phone: (user && user.phone) || null,
    coins: user ? num(user.coins) : 0,
  });
}

// ---------- 端點 ----------

// POST /creators/register —— 把現有 user 升級成創作者
async function register(req, res) {
  try {
    const userId = (req.user && req.user.userId) || null;
    if (!userId) return error(res, 401, '未授權');

    const body = req.body || {};
    const realName = body.realName === undefined || body.realName === null ? '' : String(body.realName).trim();
    if (!realName) return error(res, 400, '請填寫真實姓名');

    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_BRIEF });
    if (!user) return error(res, 404, '用戶不存在');

    const exists = await prisma.creator.findUnique({ where: { userId }, select: { id: true } });
    if (exists) return error(res, 409, '已是創作者，無需重複申請');

    const data = { userId, realName };
    if (body.idCard) data.idCard = body.idCard;
    if (body.bio) data.bio = body.bio;
    if (body.avatar) data.avatar = body.avatar;
    else if (user.avatar) data.avatar = user.avatar;

    const creator = await prisma.creator.create({ data, select: CREATOR_SELECT });

    // User.isCreator 必須同步，否則前端「我的」頁判斷不出身分
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { isCreator: true },
      select: USER_BRIEF,
    });

    success(res, { creator, user: updatedUser || null }, '已成為創作者');
  } catch (e) {
    console.error(e);
    error(res, 500, '申請創作者失敗');
  }
}

// GET /creators/me/profile
async function getProfile(req, res) {
  try {
    const creator = await requireCreator(req, res);
    if (!creator) return;
    const user = await prisma.user.findUnique({ where: { id: creator.userId }, select: USER_BRIEF });
    success(res, mergeProfile(creator, user));
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取創作者資料失敗');
  }
}

// PATCH /creators/me/profile（body 已由 registerSchema.partial() 解析）
async function updateProfile(req, res) {
  try {
    const creator = await requireCreator(req, res);
    if (!creator) return;

    const body = req.body || {};
    const data = {};
    for (const field of ['realName', 'idCard', 'bio', 'avatar']) {
      if (body[field] !== undefined) data[field] = body[field];
    }
    const nickname = body.nickname; // nickname 存在 User 身上，不在 Creator

    if (!Object.keys(data).length && nickname === undefined) {
      return error(res, 400, '沒有可更新的欄位');
    }

    const updated = Object.keys(data).length
      ? await prisma.creator.update({ where: { id: creator.id }, data, select: CREATOR_SELECT })
      : creator;

    if (nickname !== undefined) {
      await prisma.user.update({ where: { id: creator.userId }, data: { nickname } });
    }

    const user = await prisma.user.findUnique({ where: { id: creator.userId }, select: USER_BRIEF });
    success(res, mergeProfile(updated || creator, user), '資料已更新');
  } catch (e) {
    console.error(e);
    error(res, 500, '更新創作者資料失敗');
  }
}

// GET /creators/me/dramas
async function getMyDramas(req, res) {
  try {
    const creator = await requireCreator(req, res);
    if (!creator) return;

    const where = { creatorId: creator.id };
    const status = req.query && req.query.status;
    if (status === '0' || status === '1') where.status = Number(status);
    const auditStatus = req.query && req.query.auditStatus;
    if (auditStatus === 'pending' || auditStatus === 'approved' || auditStatus === 'rejected') {
      where.auditStatus = auditStatus;
    }

    const { take, page, skip } = pageArgs(req);
    const list = await prisma.drama.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      select: CARD_SELECT,
    });
    success(res, { total: list.length, page, limit: take, list: list.map(toCard) });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取我的劇集失敗');
  }
}

// POST /creators/me/dramas
async function createDrama(req, res) {
  try {
    const creator = await requireCreator(req, res);
    if (!creator) return;

    const body = req.body || {};
    const title = body.title === undefined || body.title === null ? '' : String(body.title).trim();
    if (!title) return error(res, 400, '請填寫劇名');

    // 新劇一律待審、沒有上架時間；status 只決定審核通過後要不要露出
    const data = {
      title,
      creatorId: creator.id,
      auditStatus: 'pending',
      status: body.status === undefined ? 1 : body.status,
      publishedAt: null,
    };
    if (body.desc !== undefined) data.desc = body.desc;
    if (body.cover !== undefined) data.cover = body.cover;
    if (body.categoryId !== undefined) data.categoryId = body.categoryId;
    if (body.isFree !== undefined) data.isFree = body.isFree;
    if (body.pricePerEp !== undefined) data.pricePerEp = body.pricePerEp;
    if (body.totalEpisodes !== undefined) data.totalEpisodes = body.totalEpisodes;

    const drama = await prisma.drama.create({ data, select: CARD_SELECT });
    success(res, toCard(drama), '已建立，等待審核');
  } catch (e) {
    console.error(e);
    error(res, 500, '建立劇集失敗');
  }
}

// PATCH /creators/me/dramas/:id
const EDITABLE_FIELDS = ['title', 'desc', 'cover', 'categoryId', 'isFree', 'pricePerEp', 'totalEpisodes', 'status'];

async function updateDrama(req, res) {
  try {
    const creator = await requireCreator(req, res);
    if (!creator) return;

    const drama = await requireOwnDrama(req, res, creator, req.params.id);
    if (!drama) return;

    const body = req.body || {};
    const data = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) data[field] = body[field];
    }
    // auditStatus / creatorId / views / rating 不在白名單裡 —— 創作者改不動審核狀態
    if (!Object.keys(data).length) return error(res, 400, '沒有可更新的欄位');

    const updated = await prisma.drama.update({ where: { id: drama.id }, data, select: CARD_SELECT });
    success(res, toCard(updated), '已更新');
  } catch (e) {
    console.error(e);
    error(res, 500, '更新劇集失敗');
  }
}

// POST /creators/me/dramas/:id/episodes
async function addEpisode(req, res) {
  try {
    const creator = await requireCreator(req, res);
    if (!creator) return;

    const drama = await requireOwnDrama(req, res, creator, req.params.id);
    if (!drama) return;

    const body = req.body || {};
    const videoUrl = body.videoUrl === undefined || body.videoUrl === null ? '' : String(body.videoUrl).trim();
    if (!videoUrl) return error(res, 400, '請提供影片網址');

    // 沒指定集數就接在最後一集後面（用 findFirst 取最大值，不是用 totalEpisodes，
    // 因為刪集之後 totalEpisodes 可能落後於實際的最大集數）
    let episodeNumber = body.episodeNumber;
    if (episodeNumber === undefined) {
      const last = await prisma.episode.findFirst({
        where: { dramaId: drama.id },
        orderBy: { episodeNumber: 'desc' },
        select: { episodeNumber: true },
      });
      episodeNumber = num(last && last.episodeNumber, 0) + 1;
    }

    // @@unique([dramaId, episodeNumber])；先查一次換成 409，而不是讓 P2002 變成 500
    const dup = await prisma.episode.findUnique({
      where: { dramaId_episodeNumber: { dramaId: drama.id, episodeNumber } },
      select: { id: true },
    });
    if (dup) return error(res, 409, `第 ${episodeNumber} 集已存在`);

    const data = { dramaId: drama.id, episodeNumber, videoUrl };
    if (body.title !== undefined) data.title = body.title;
    if (body.duration !== undefined) data.duration = body.duration;

    const episode = await prisma.episode.create({ data, select: EPISODE_SELECT });

    // 卡片上的「N 集」讀的是 Drama.totalEpisodes，新增後必須跟上
    const total = Math.max(num(drama.totalEpisodes, 0), episodeNumber);
    if (total !== num(drama.totalEpisodes, 0)) {
      await prisma.drama.update({ where: { id: drama.id }, data: { totalEpisodes: total } });
    }

    success(res, Object.assign({}, episode, { dramaId: drama.id, totalEpisodes: total }), '已新增集數');
  } catch (e) {
    console.error(e);
    error(res, 500, '新增集數失敗');
  }
}

// DELETE /creators/me/dramas/:dramaId/episodes/:episodeId
async function deleteEpisode(req, res) {
  try {
    const creator = await requireCreator(req, res);
    if (!creator) return;

    const drama = await requireOwnDrama(req, res, creator, req.params.dramaId);
    if (!drama) return;

    const episode = await prisma.episode.findUnique({
      where: { id: req.params.episodeId },
      select: { id: true, dramaId: true, episodeNumber: true },
    });
    // 路徑是 (dramaId, episodeId) 這一組；集數不屬於這部劇就當作不存在，
    // 不洩漏別人的集數 id
    if (!episode || episode.dramaId !== drama.id) return error(res, 404, '集數不存在');

    await prisma.episode.delete({ where: { id: episode.id } });

    const total = num(drama.totalEpisodes, 0);
    if (episode.episodeNumber <= total) {
      await prisma.drama.update({ where: { id: drama.id }, data: { totalEpisodes: Math.max(0, total - 1) } });
    }

    success(res, { deleted: true, dramaId: drama.id, episodeId: episode.id }, '已刪除集數');
  } catch (e) {
    console.error(e);
    error(res, 500, '刪除集數失敗');
  }
}

// GET /creators/me/dashboard
async function getDashboard(req, res) {
  try {
    const creator = await requireCreator(req, res);
    if (!creator) return;

    // 一次把全部作品（含未過審）抓回來，統計在 JS 裡算：
    // 少一次 aggregate，且 BigInt/Decimal 一定經過 num()
    const dramas = await prisma.drama.findMany({
      where: { creatorId: creator.id },
      orderBy: { createdAt: 'desc' },
      select: CARD_SELECT,
    });

    // CreatorFollow 沒有對 Creator 的關聯欄位，只能 count
    const totalFollowers = await prisma.creatorFollow.count({ where: { creatorId: creator.id } });

    // 收益有 createdAt，所以「本月收益」是真的算得出來的（views 沒有逐筆時間戳，
    // 因此不回 monthViews —— CreatorStats.monthViews 要靠統計管線，不在這裡編）
    const earnings = await prisma.creatorEarning.findMany({
      where: { creatorId: creator.id },
      select: { amount: true, createdAt: true },
    });
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const count = (s) => dramas.filter((d) => d.auditStatus === s).length;
    const ratingList = dramas.map((d) => num(d.rating)).filter((r) => r > 0);

    success(res, {
      creator: {
        id: creator.id,
        realName: creator.realName,
        avatar: creator.avatar,
        verified: !!creator.verified,
        status: creator.status,
      },
      totalDramas: dramas.length,
      approvedDramas: count('approved'),
      pendingDramas: count('pending'),
      rejectedDramas: count('rejected'),
      totalEpisodes: sumOf(dramas, (d) => d.totalEpisodes),
      totalViews: sumOf(dramas, (d) => d.views),
      totalLikes: sumOf(dramas, (d) => d.likes),
      avgRating: ratingList.length
        ? Math.round((ratingList.reduce((a, b) => a + b, 0) / ratingList.length) * 10) / 10
        : 0,
      totalFollowers: num(totalFollowers),
      totalEarnings: sumOf(earnings, (e) => e.amount),
      monthEarnings: sumOf(earnings.filter((e) => e.createdAt && new Date(e.createdAt) >= monthStart), (e) => e.amount),
      recentDramas: dramas.slice(0, 5).map(toCard),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取創作者看板失敗');
  }
}

// GET /creators/me/audit-logs
async function getAuditLogs(req, res) {
  try {
    const creator = await requireCreator(req, res);
    if (!creator) return;

    const where = { creatorId: creator.id };
    if (req.query && req.query.dramaId) where.dramaId = String(req.query.dramaId);

    const { take, page, skip } = pageArgs(req, 20, 100);
    const rows = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
      select: {
        id: true, dramaId: true, action: true, reason: true, createdAt: true,
        drama: { select: { id: true, title: true, cover: true } },
      },
    });

    success(res, {
      total: rows.length,
      page,
      limit: take,
      list: rows.map((l) => ({
        id: l.id,
        dramaId: l.dramaId,
        dramaTitle: l.drama ? l.drama.title : null,
        cover: l.drama ? l.drama.cover : null,
        action: l.action,
        reason: l.reason || null,
        createdAt: l.createdAt,
      })),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取審核紀錄失敗');
  }
}

// GET /creators/:id/profile（公開，無 auth）
async function getPublicProfile(req, res) {
  try {
    const creator = await prisma.creator.findUnique({
      where: { id: req.params.id },
      select: Object.assign({}, PUBLIC_CREATOR_SELECT, {
        user: { select: { id: true, nickname: true, avatar: true } },
      }),
    });
    if (!creator) return error(res, 404, '創作者不存在');

    // 公開頁只露出已上架 + 已過審的作品
    const dramas = await prisma.drama.findMany({
      where: { creatorId: creator.id, status: 1, auditStatus: 'approved' },
      orderBy: { views: 'desc' },
      take: 20,
      select: CARD_SELECT,
    });
    const totalFollowers = await prisma.creatorFollow.count({ where: { creatorId: creator.id } });
    const list = dramas.map(toCard);
    const user = creator.user || null;

    success(res, {
      id: creator.id,
      name: (user && user.nickname) || creator.realName,
      realName: creator.realName,
      nickname: (user && user.nickname) || null,
      bio: creator.bio,
      avatar: creator.avatar || (user && user.avatar) || null,
      verified: !!creator.verified,
      status: creator.status,
      createdAt: creator.createdAt,
      totalDramas: list.length,
      totalViews: sumOf(list, (d) => d.views),
      totalLikes: sumOf(list, (d) => d.likes),
      totalFollowers: num(totalFollowers),
      dramas: list,
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取創作者主頁失敗');
  }
}

// POST /creators/:id/follow（需登入）—— 形狀與 dramaController.toggleFollow 一致
async function toggleFollow(req, res) {
  try {
    const userId = (req.user && req.user.userId) || null;
    if (!userId) return error(res, 401, '未授權');

    const creatorId = req.params.id;
    const creator = await prisma.creator.findUnique({ where: { id: creatorId }, select: { id: true, userId: true } });
    if (!creator) return error(res, 404, '創作者不存在');
    if (creator.userId === userId) return error(res, 400, '不能追蹤自己');

    const existing = await prisma.creatorFollow.findUnique({
      where: { userId_creatorId: { userId, creatorId } },
      select: { id: true },
    });
    if (existing) {
      await prisma.creatorFollow.delete({ where: { id: existing.id } });
      return success(res, { following: false, creatorId });
    }
    await prisma.creatorFollow.create({ data: { userId, creatorId } });
    success(res, { following: true, creatorId });
  } catch (e) {
    console.error(e);
    error(res, 500, '追蹤創作者失敗');
  }
}

// ---------- routes/creators.js 需要的名字 ----------
// routes/index.js 目前把 /creators 掛在 routes/creator.js（單數），routes/creators.js
// 是沒被掛上的檔案，但它 require 這支 controller 並取用 `ctrl.apply` / `ctrl.withdraw`。
// 契約掃描看不到它們（變數不叫 `xxxController`），不過補上這兩個名字，那個路由檔才
// require 得起來（Express 對 undefined handler 會直接丟 TypeError）。
async function apply(req, res) {
  return register(req, res);
}

async function withdraw(req, res) {
  try {
    const creator = await requireCreator(req, res);
    if (!creator) return;
    // 沒有提現／餘額模型（CreatorEarning 只有入帳紀錄），不編假的餘額出來
    error(res, 501, '提現功能尚未實作（schema 缺少提現／餘額模型）');
  } catch (e) {
    console.error(e);
    error(res, 500, '提現失敗');
  }
}

module.exports = {
  // zod schema（validate 在路由定義時就要用）
  registerSchema,
  createDramaSchema,
  updateDramaSchema,
  addEpisodeSchema,
  // 端點
  register,
  getProfile,
  updateProfile,
  getMyDramas,
  createDrama,
  updateDrama,
  addEpisode,
  deleteEpisode,
  getDashboard,
  getAuditLogs,
  getPublicProfile,
  toggleFollow,
  // routes/creators.js（未掛載）用到的名字
  apply,
  withdraw,
  // 匯出給測試用（不是路由需要的）
  _num: num,
  _toCard: toCard,
};
