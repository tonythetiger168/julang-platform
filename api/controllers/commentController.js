/* ===== 劇集留言控制器 (v7.7) =====
 *
 * 契約來自 api/routes/drama.js 與 api/routes/comments.js：
 *   listDramaComments / addDramaComment / removeDramaComment / commentSchema
 *
 * 這條線是**短劇 Drama 的留言**：表 `comments`、Prisma client `prisma.comment`
 * （`model Comment`，schema 早就有、但在此之前全專案沒有任何地方用它）。
 * 它與「漫劇社群留言」是**兩張不同的表**：
 *   · 這裡            -> prisma.comment      / comments            （userId + dramaId + episodeId?）
 *   · communityController -> prisma.comicComment / comic_comments （userId + comicId）
 * 兩者的回應形狀也不同（這裡的 user 是**巢狀物件**），所以刻意不互相 import。
 *
 * 回應形狀（前端已照此接線，別改）：
 *   GET    /dramas/:id/comments -> { total, page, limit, list: [{ id, content, createdAt,
 *                                   likes, mine, user: { id, nickname, avatar } }] }
 *          `total` 是**該劇留言總數**（prisma.comment.count），不是當頁長度。
 *   POST   /dramas/:id/comments -> 單則留言（形狀同上；自己的留言 mine 必為 true）
 *   DELETE /comments/:commentId -> data: null（只能刪自己的）
 *
 * 型別：Comment.likes 是 Int，沒有 BigInt/Decimal 陷阱；但出口仍走 num() 保險。
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

// 列表預設 30（契約 ?page=1&limit=30），上限 50（與社群留言一致，避免一次撈爆）
function pageLimit(req, def = 30, max = 50) {
  const n = parseInt(req.query && req.query.limit, 10);
  return Math.min(Math.max(Number.isNaN(n) ? def : n, 1), max);
}

function pageNum(req) {
  const n = parseInt(req.query && req.query.page, 10);
  return Number.isNaN(n) || n < 1 ? 1 : n;
}

// auth 與 optionalAuth 兩種 middleware 都可能沒帶到 req.user
function currentUserId(req) {
  return (req.user && req.user.userId) || null;
}

const COMMENT_SELECT = {
  id: true,
  content: true,
  createdAt: true,
  likes: true,
  userId: true, // mine 判斷用；不外流（toComment 只輸出 user 物件）
  user: { select: { id: true, nickname: true, avatar: true } },
};

// Comment row -> 對外單則留言
function toComment(row, viewerId) {
  const r = row || {};
  const u = r.user || {};
  return {
    id: r.id,
    content: r.content,
    createdAt: r.createdAt,
    likes: num(r.likes),
    // 未登入（viewerId 為 null）一律 false
    mine: !!viewerId && r.userId === viewerId,
    user: {
      id: u.id || r.userId || null,
      nickname: u.nickname || '劇迷',
      avatar: u.avatar || null,
    },
  };
}

// ===== GET /dramas/:id/comments?page=&limit=（optionalAuth，未登入可看）=====
async function listDramaComments(req, res) {
  try {
    const drama = await prisma.drama.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!drama) return error(res, 404, '劇集不存在');

    const page = pageNum(req);
    const limit = pageLimit(req);
    const viewerId = currentUserId(req);

    // total 一定要用 count（該劇總數），不能用 rows.length（那只是當頁）
    const [total, rows] = await Promise.all([
      prisma.comment.count({ where: { dramaId: drama.id } }),
      prisma.comment.findMany({
        where: { dramaId: drama.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: COMMENT_SELECT,
      }),
    ]);

    success(res, {
      total: num(total),
      page,
      limit,
      list: (rows || []).map((r) => toComment(r, viewerId)),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取留言失敗');
  }
}

// ===== POST /dramas/:id/comments（需登入，body 已過 commentSchema）=====
async function addDramaComment(req, res) {
  try {
    const userId = currentUserId(req);
    if (!userId) return error(res, 401, '未授權');

    // 走過 validate() 的請求 content 已被 trim，這裡再防一次直接呼叫 controller 的情況
    const body = req.body || {};
    const raw = body.content === undefined || body.content === null ? '' : body.content;
    const content = String(raw).trim();
    if (!content) return error(res, 400, '留言內容不能為空');
    if (content.length > 500) return error(res, 400, '留言最多 500 字');

    const drama = await prisma.drama.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!drama) return error(res, 404, '劇集不存在');

    // episodeId 可選。有給就必須真的屬於這齣劇 —— 否則會把 A 劇的集數掛到 B 劇的留言上。
    let episodeId = null;
    const wanted = body.episodeId === undefined || body.episodeId === null
      ? ''
      : String(body.episodeId).trim();
    if (wanted) {
      const episode = await prisma.episode.findUnique({
        where: { id: wanted },
        select: { id: true, dramaId: true },
      });
      if (!episode || episode.dramaId !== drama.id) return error(res, 400, '集數不屬於此劇');
      episodeId = episode.id;
    }

    const row = await prisma.comment.create({
      data: { dramaId: drama.id, userId, content, episodeId },
      select: COMMENT_SELECT,
    });

    success(res, toComment(row, userId), '留言成功');
  } catch (e) {
    console.error(e);
    error(res, 500, '發表留言失敗');
  }
}

// ===== DELETE /comments/:commentId（需登入；只能刪自己的）=====
async function removeDramaComment(req, res) {
  try {
    const userId = currentUserId(req);
    if (!userId) return error(res, 401, '未授權');

    const row = await prisma.comment.findUnique({
      where: { id: req.params.commentId },
      select: { id: true, userId: true },
    });
    if (!row) return error(res, 404, '留言不存在');
    if (row.userId !== userId) return error(res, 403, '只能刪除自己的留言');

    await prisma.comment.delete({ where: { id: row.id } });
    success(res, null, '已刪除');
  } catch (e) {
    console.error(e);
    error(res, 500, '刪除留言失敗');
  }
}

/* validate() 在路由定義時就會呼叫 .safeParse，這個必須是真的 zod schema。
 * ⚠️ `episodeId` **一定要宣告在這裡**：zod 的物件預設會剝除未宣告的鍵，而
 * validate() 會把 req.body 換成解析後的結果 —— 漏宣告就等於默默丟掉 episodeId。
 * nullish()：允許 `episodeId: null`（前端對「整齣劇的留言」可能就是送 null）。 */
const commentSchema = z.object({
  content: z
    .string({ required_error: '留言內容不能為空', invalid_type_error: '留言內容必須是文字' })
    .trim()
    .min(1, '留言內容不能為空')
    .max(500, '留言最多 500 字'),
  episodeId: z
    .string({ invalid_type_error: 'episodeId 必須是文字' })
    .trim()
    .min(1, 'episodeId 不合法')
    .nullish(),
});

module.exports = {
  listDramaComments,
  addDramaComment,
  removeDramaComment,
  commentSchema,
  // 匯出給測試用（不是路由需要的）
  _toComment: toComment,
  _num: num,
};
