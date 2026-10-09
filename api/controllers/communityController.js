/* ===== 靈感社區控制器 (v7.2) =====
 *
 * 契約來自 api/routes/community.js 與 api/routes/index.js：
 *   listWorks / getWorkDetail / listComments / toggleLike / toggleFavorite
 *   remix / addComment / deleteComment / myFavorites / searchAll / commentSchema
 *
 * 社群模組的「作品」是**漫劇 ComicDrama**（不是短劇 Drama）：
 *   · 前端 src/js/community.js 吃的欄位（artStyle / remixOfId / remixCount /
 *     episodes 數字 / characters / panels）只存在於 ComicDrama。
 *   · 互動資料表 ComicLike / ComicFavorite / ComicComment 都以 comicId 為鍵。
 *   · routes/index.js 的 /search/all 才會同時碰到短劇 Drama（dramas 區塊）。
 *
 * 型別陷阱（同 dramaController）：
 *   · ComicDrama.views 是 BigInt —— 直接 res.json() 會丟 TypeError。
 *   · ComicDrama.rating 是 Decimal —— 序列化會變字串，前端比較會壞。
 *   兩者出口一律走 num() 轉 number。
 *
 * 關聯陷阱：
 *   · ComicLike / ComicFavorite 在 schema.prisma 裡**沒有** relation 欄位（只有
 *     comicId 字串），所以「我的收藏」要用第二次查詢補作品資料。
 *   · ComicComment 有 user 關聯，可以直接 select，不必第二次查。
 *
 * 回應形狀（對齊 src/js/mock-api.js 的 demo 契約）：
 *   · listWorks      -> { total, page, limit, sort, style, list: [...] }
 *   · getWorkDetail  -> 單一作品（episodes / characters 是陣列，commentCount 是數字）
 *   · listComments   -> { total, page, limit, list: [{…, mine}] }
 *   · addComment     -> 單一評論（含 mine: true，mock 也是回單一物件）
 *   · deleteComment  -> { deleted: true }
 *   · toggleLike     -> { liked, comicId, likes }
 *   · toggleFavorite -> { favorited, comicId }
 *   · myFavorites    -> **data 直接是陣列**（pwa.js 讀 res.data.map；mock 亦同）
 *   · remix          -> { remixId, remixOfId, remixOf, remixCount, isPublic }
 *   · searchAll      -> { q, total, dramas: [], comics: [], creators: [] }
 */
const { z } = require('zod');
const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');

// BigInt / Decimal / string -> number（壞值回 fallback）
function num(v, fallback = 0) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'number') return v;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object' && typeof v.toNumber === 'function') return v.toNumber();
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function pageLimit(req, def = 20, max = 50) {
  const n = parseInt(req.query && req.query.limit, 10);
  return Math.min(Math.max(Number.isNaN(n) ? def : n, 1), max);
}

function pageNum(req) {
  const n = parseInt(req.query && req.query.page, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

// 只有短劇 Drama 有 auditStatus / status 這組「已上架」條件
const PUBLISHED_DRAMA = { status: 1, auditStatus: 'approved' };
// 社群可見的漫劇：上架 + 公開 + 過審
const PUBLIC_COMIC = { status: 1, isPublic: true, auditStatus: 'approved' };

// 當前登入者（auth / optionalAuth 兩種 middleware 都可能沒帶到 req.user）
function currentUserId(req) {
  return (req.user && req.user.userId) || null;
}

const WORK_CARD_SELECT = {
  id: true,
  title: true,
  desc: true,
  cover: true,
  categoryId: true,
  category: { select: { id: true, name: true } },
  creatorId: true,
  creator: { select: { id: true, realName: true, avatar: true } },
  artStyle: true,
  theme: true,
  totalEpisodes: true,
  views: true,
  likes: true,
  rating: true,
  remixOfId: true,
  remixCount: true,
  isPublic: true,
  createdAt: true,
  publishedAt: true,
};

// 短劇 Drama 的欄位（searchAll 的 dramas 區塊）—— 與漫劇 select 不通用
const DRAMA_HIT_SELECT = {
  id: true,
  title: true,
  cover: true,
  categoryId: true,
  category: { select: { id: true, name: true } },
  totalEpisodes: true,
  views: true,
  likes: true,
  rating: true,
};

const CHARACTER_SELECT = {
  id: true, name: true, role: true, persona: true, avatar: true, voiceId: true,
};

const PANEL_SELECT = {
  id: true, panelNumber: true, imageUrl: true, imagePrompt: true, shotType: true,
  transition: true, dialogue: true, speaker: true, voiceUrl: true, duration: true,
};

const DETAIL_SELECT = Object.assign({}, WORK_CARD_SELECT, {
  voiceId: true,
  prompt: true,
  status: true,
  updatedAt: true,
  characters: { orderBy: { createdAt: 'asc' }, select: CHARACTER_SELECT },
  episodes: {
    orderBy: { episodeNumber: 'asc' },
    select: {
      id: true, episodeNumber: true, title: true, duration: true, status: true,
      panels: { orderBy: { panelNumber: 'asc' }, select: PANEL_SELECT },
    },
  },
  // 一次查詢拿到評論數（前端詳情頁顯示「💬 評論（N）」）
  _count: { select: { comicComments: true } },
});

// ComicDrama -> 卡片（前端 community.js 逐欄消費）
function toWorkCard(c) {
  const row = c || {};
  return {
    id: row.id,
    title: row.title,
    desc: row.desc,
    cover: row.cover,
    category: row.category ? row.category.name : null,
    categoryId: row.categoryId || (row.category ? row.category.id : null),
    artStyle: row.artStyle,
    theme: row.theme,
    // 列表的 episodes 必須是數字（卡片印 `${w.episodes}集`），只有詳情才是陣列
    episodes: num(row.totalEpisodes),
    totalEpisodes: num(row.totalEpisodes),
    views: num(row.views),
    likes: num(row.likes),
    rating: num(row.rating),
    remixOfId: row.remixOfId || null,
    remixCount: num(row.remixCount),
    isPublic: row.isPublic !== false,
    creatorId: row.creatorId || null,
    creatorName: row.creator ? row.creator.realName : null,
    creatorAvatar: row.creator ? row.creator.avatar : null,
    // GET /community/works 沒有掛 auth/optionalAuth，拿不到登入者 —— 固定 false。
    // 前端只拿它決定愛心是否填色，按鈕本身仍會即時更新，所以可接受。
    _liked: false,
    createdAt: row.createdAt,
    publishedAt: row.publishedAt,
  };
}

function toComment(row, viewerId) {
  const r = row || {};
  const u = r.user || {};
  return {
    id: r.id,
    content: r.content,
    nickname: u.nickname || '劇迷',
    avatar: u.avatar || null,
    createdAt: r.createdAt,
    mine: !!viewerId && r.userId === viewerId,
  };
}

// ===== GET /community/works?sort=hot|new&style=&limit=&page= =====
async function listWorks(req, res) {
  try {
    const q = req.query || {};
    const sort = q.sort === 'new' ? 'new' : 'hot';
    const style = q.style ? String(q.style) : '';
    const page = pageNum(req);
    const limit = pageLimit(req, 20, 50);

    const where = Object.assign({}, PUBLIC_COMIC);
    if (style) where.artStyle = style;

    const orderBy = sort === 'new'
      ? [{ createdAt: 'desc' }]
      : [{ likes: 'desc' }, { views: 'desc' }];

    const list = await prisma.comicDrama.findMany({
      where,
      orderBy,
      skip: (page - 1) * limit,
      take: limit,
      select: WORK_CARD_SELECT,
    });

    success(res, {
      total: list.length, // 本頁筆數（與 dramaController 同慣例，省掉第二次 count）
      page,
      limit,
      sort,
      style,
      list: list.map(toWorkCard),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取社區作品失敗');
  }
}

// ===== GET /community/works/:id =====
async function getWorkDetail(req, res) {
  try {
    const d = await prisma.comicDrama.findUnique({
      where: { id: req.params.id },
      select: DETAIL_SELECT,
    });
    if (!d) return error(res, 404, '作品不存在');

    const card = toWorkCard(d);
    card.status = d.status;
    card.voiceId = d.voiceId;
    card.prompt = d.prompt;
    card.updatedAt = d.updatedAt;
    card.commentCount = (d._count && d._count.comicComments) || 0;
    card.characters = (d.characters || []).map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      persona: c.persona,
      avatar: c.avatar,
      voiceId: c.voiceId,
    }));
    // 詳情的 episodes 是**陣列**（前端印 `w.episodes.length`）
    card.episodes = (d.episodes || []).map((ep) => ({
      id: ep.id,
      episodeNumber: ep.episodeNumber,
      title: ep.title,
      duration: ep.duration,
      status: ep.status,
      panels: (ep.panels || []).map((p) => ({
        id: p.id,
        panelNumber: p.panelNumber,
        imageUrl: p.imageUrl,
        imagePrompt: p.imagePrompt,
        shotType: p.shotType,
        transition: p.transition,
        dialogue: p.dialogue,
        speaker: p.speaker,
        voiceUrl: p.voiceUrl,
        duration: p.duration,
      })),
    }));

    success(res, card);
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取作品詳情失敗');
  }
}

// ===== GET /search/all?q= （頂層聚合搜索：短劇 + 漫劇 + 創作者）=====
async function searchAll(req, res) {
  try {
    const q = String((req.query && req.query.q) || '').trim();
    if (!q) return success(res, { q: '', total: 0, dramas: [], comics: [], creators: [] });

    const limit = pageLimit(req, 10, 30);
    const contains = { contains: q, mode: 'insensitive' };

    const [dramas, comics, creators] = await Promise.all([
      prisma.drama.findMany({
        where: Object.assign({}, PUBLISHED_DRAMA, { OR: [{ title: contains }, { desc: contains }] }),
        orderBy: { views: 'desc' },
        take: limit,
        // Drama 沒有 artStyle/theme/remix*，不能共用漫劇的 select（Prisma 會直接報錯）
        select: DRAMA_HIT_SELECT,
      }),
      prisma.comicDrama.findMany({
        where: Object.assign({}, PUBLIC_COMIC, { OR: [{ title: contains }, { desc: contains }] }),
        orderBy: [{ likes: 'desc' }, { views: 'desc' }],
        take: limit,
        select: WORK_CARD_SELECT,
      }),
      prisma.creator.findMany({
        where: { status: 1, OR: [{ realName: contains }, { bio: contains }] },
        take: limit,
        select: { id: true, realName: true, avatar: true, bio: true },
      }),
    ]);

    success(res, {
      q,
      total: dramas.length + comics.length + creators.length,
      dramas: dramas.map((d) => ({
        id: d.id,
        title: d.title,
        cover: d.cover,
        category: d.category ? d.category.name : null,
        episodes: num(d.totalEpisodes),
        totalEpisodes: num(d.totalEpisodes),
        views: num(d.views),
        likes: num(d.likes),
        rating: num(d.rating),
        type: 'drama',
      })),
      comics: comics.map((c) => Object.assign(toWorkCard(c), { type: 'comic' })),
      creators: creators.map((c) => ({
        id: c.id,
        name: c.realName || '創作者',
        avatar: c.avatar || null,
        bio: c.bio || '',
        type: 'creator',
      })),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '搜索失敗');
  }
}

// ===== GET /community/works/:id/comments?limit=&page= =====
async function listComments(req, res) {
  try {
    const comic = await prisma.comicDrama.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!comic) return error(res, 404, '作品不存在');

    const page = pageNum(req);
    const limit = pageLimit(req, 30, 50);
    const viewerId = currentUserId(req);

    const rows = await prisma.comicComment.findMany({
      where: { comicId: comic.id },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: {
        id: true, content: true, createdAt: true, userId: true,
        user: { select: { id: true, nickname: true, avatar: true } },
      },
    });

    success(res, {
      total: rows.length,
      page,
      limit,
      list: rows.map((r) => toComment(r, viewerId)),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取評論失敗');
  }
}

// ===== POST /community/works/:id/comments（需登入，body 已過 commentSchema）=====
async function addComment(req, res) {
  try {
    const userId = currentUserId(req);
    if (!userId) return error(res, 401, '未授權');

    // 走過 validate() 的請求 content 已被 trim，這裡再防一次直接呼叫的情況
    const content = String((req.body && req.body.content) || '').trim();
    if (!content) return error(res, 400, '評論內容不能為空');

    const comic = await prisma.comicDrama.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!comic) return error(res, 404, '作品不存在');

    const row = await prisma.comicComment.create({
      data: { comicId: comic.id, userId, content },
      select: {
        id: true, content: true, createdAt: true, userId: true,
        user: { select: { id: true, nickname: true, avatar: true } },
      },
    });

    // 前端 cmPostComment 收到 200 後會重新拉列表；回單一評論與 mock 一致
    success(res, toComment(row, userId), '評論成功');
  } catch (e) {
    console.error(e);
    error(res, 500, '發表評論失敗');
  }
}

// ===== DELETE /community/comments/:commentId（需登入；只能刪自己的）=====
async function deleteComment(req, res) {
  try {
    const userId = currentUserId(req);
    if (!userId) return error(res, 401, '未授權');

    const row = await prisma.comicComment.findUnique({
      where: { id: req.params.commentId },
      select: { id: true, userId: true, comicId: true },
    });
    if (!row) return error(res, 404, '評論不存在');
    if (row.userId !== userId) return error(res, 403, '只能刪除自己的評論');

    await prisma.comicComment.delete({ where: { id: row.id } });
    success(res, { deleted: true, id: row.id, comicId: row.comicId }, '已刪除');
  } catch (e) {
    console.error(e);
    error(res, 500, '刪除評論失敗');
  }
}

// ===== POST /community/works/:id/like（需登入，切換語意）=====
async function toggleLike(req, res) {
  try {
    const userId = currentUserId(req);
    if (!userId) return error(res, 401, '未授權');

    const comicId = req.params.id;
    const comic = await prisma.comicDrama.findUnique({
      where: { id: comicId },
      select: { id: true, likes: true },
    });
    if (!comic) return error(res, 404, '作品不存在');

    const existing = await prisma.comicLike.findUnique({
      where: { userId_comicId: { userId, comicId } },
      select: { id: true },
    });

    if (existing) {
      await prisma.comicLike.delete({ where: { id: existing.id } });
      // 冗餘的 likes 計數器同步下調，但不讓它變負（資料可能被人工改過）
      let likes = num(comic.likes);
      if (likes > 0) {
        await prisma.comicDrama.update({ where: { id: comicId }, data: { likes: { decrement: 1 } } });
        likes -= 1;
      }
      return success(res, { liked: false, comicId, likes }, '已取消點讚');
    }

    await prisma.comicLike.create({ data: { userId, comicId } });
    await prisma.comicDrama.update({ where: { id: comicId }, data: { likes: { increment: 1 } } });
    success(res, { liked: true, comicId, likes: num(comic.likes) + 1 }, '已點讚');
  } catch (e) {
    console.error(e);
    error(res, 500, '點讚操作失敗');
  }
}

// ===== POST /community/works/:id/favorite（需登入，切換語意）=====
async function toggleFavorite(req, res) {
  try {
    const userId = currentUserId(req);
    if (!userId) return error(res, 401, '未授權');

    const comicId = req.params.id;
    const comic = await prisma.comicDrama.findUnique({
      where: { id: comicId },
      select: { id: true },
    });
    if (!comic) return error(res, 404, '作品不存在');

    // ComicFavorite 在 schema 裡只有 userId / comicId 兩個純量欄位（沒有 relation）
    const existing = await prisma.comicFavorite.findUnique({
      where: { userId_comicId: { userId, comicId } },
      select: { id: true },
    });

    if (existing) {
      await prisma.comicFavorite.delete({ where: { id: existing.id } });
      return success(res, { favorited: false, comicId }, '已取消收藏');
    }

    await prisma.comicFavorite.create({ data: { userId, comicId } });
    success(res, { favorited: true, comicId }, '已收藏');
  } catch (e) {
    console.error(e);
    error(res, 500, '收藏操作失敗');
  }
}

// ===== GET /community/favorites（需登入）=====
// pwa.js 直接吃 res.data 當陣列（res.data.map），所以這裡**不包** {total, list}
async function myFavorites(req, res) {
  try {
    const userId = currentUserId(req);
    if (!userId) return error(res, 401, '未授權');

    const rows = await prisma.comicFavorite.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { comicId: true, createdAt: true },
    });

    const ids = [...new Set(rows.map((r) => r.comicId))];
    // ComicFavorite 沒有 comic 關聯欄位 -> 第二次查詢補作品資料
    const comics = ids.length
      ? await prisma.comicDrama.findMany({
          where: { id: { in: ids } },
          select: {
            id: true, title: true, cover: true, artStyle: true, totalEpisodes: true,
            views: true, likes: true, remixOfId: true, remixCount: true, createdAt: true,
          },
        })
      : [];
    const byId = new Map(comics.map((c) => [c.id, c]));

    const list = rows
      .map((r) => {
        const c = byId.get(r.comicId);
        if (!c) return null; // 作品已被刪除 -> 略過，前端才不會拿到 undefined 標題
        return {
          id: c.id,
          title: c.title,
          cover: c.cover,
          artStyle: c.artStyle,
          episodes: num(c.totalEpisodes),
          totalEpisodes: num(c.totalEpisodes),
          views: num(c.views),
          likes: num(c.likes),
          remixOfId: c.remixOfId || null,
          remixCount: num(c.remixCount),
          favoritedAt: r.createdAt,
        };
      })
      .filter(Boolean);

    success(res, list);
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取收藏失敗');
  }
}

// ===== POST /community/works/:id/remix（需登入；以既有作品建立衍生作品）=====
async function remix(req, res) {
  try {
    const userId = currentUserId(req);
    if (!userId) return error(res, 401, '未授權');

    const source = await prisma.comicDrama.findUnique({
      where: { id: req.params.id },
      select: {
        id: true, title: true, desc: true, cover: true, categoryId: true, artStyle: true,
        voiceId: true, theme: true, prompt: true, remixCount: true,
      },
    });
    if (!source) return error(res, 404, '作品不存在');

    // 衍生作品掛在「復刻者」自己的創作者檔案下（沒有就留 null，不冒用原創作者）
    const myCreator = await prisma.creator.findUnique({
      where: { userId },
      select: { id: true },
    });

    const created = await prisma.comicDrama.create({
      data: {
        title: `${source.title} · 同款`,
        desc: source.desc,
        cover: source.cover,
        categoryId: source.categoryId,
        creatorId: myCreator ? myCreator.id : null,
        artStyle: source.artStyle,
        voiceId: source.voiceId,
        theme: source.theme,
        prompt: source.prompt,
        totalEpisodes: 0, // 尚未生成分鏡，之後由 AI 任務補上
        isPublic: false,  // 預設不發佈到社區，由使用者自行發佈
        remixOfId: source.id, // ← 來源作品
      },
      select: { id: true, title: true, remixOfId: true, isPublic: true, createdAt: true },
    });

    // 來源的 remixCount +1，並取回權威的新值
    const updated = await prisma.comicDrama.update({
      where: { id: source.id },
      data: { remixCount: { increment: 1 } },
      select: { remixCount: true },
    });

    success(res, {
      remixId: created.id,
      comicId: created.id,
      title: created.title,
      isPublic: created.isPublic,
      remixOfId: source.id,
      remixOf: source.title,
      remixCount: num(updated && updated.remixCount, num(source.remixCount) + 1),
    }, '復刻成功，已建立你的同款作品');
  } catch (e) {
    console.error(e);
    error(res, 500, '復刻失敗');
  }
}

// validate() 在路由定義時就會呼叫 .safeParse，這個必須是真的 zod schema
const commentSchema = z.object({
  content: z
    .string({ required_error: '評論內容不能為空', invalid_type_error: '評論內容必須是文字' })
    .trim()
    .min(1, '評論內容不能為空')
    .max(500, '評論最多 500 字'),
});

module.exports = {
  listWorks,
  getWorkDetail,
  searchAll,
  listComments,
  addComment,
  deleteComment,
  toggleLike,
  toggleFavorite,
  myFavorites,
  remix,
  commentSchema,
  // 匯出給測試用（不是路由需要的）
  _num: num,
  _toWorkCard: toWorkCard,
  _toComment: toComment,
};
