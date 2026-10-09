/* ===== 編劇草稿控制器 (v7.2) =====
 *
 * 契約來自 api/routes/drafts.js（掛在 /drafts 底下，四個端點全部需要 auth）：
 *   GET    /        list
 *   POST   /        create
 *   PUT    /:id     update
 *   DELETE /:id     remove
 *
 * 路由**沒有**用 validate()，所以這個檔不 export zod schema（export 了也不會被呼叫）；
 * body 檢查在 handler 內用 zod `.safeParse` 自己做，失敗一律 400。
 *
 * `Draft` 在 schema.prisma 的欄位：id / userId / title（預設「未命名草稿」）/
 * content（String @db.Text，**required，沒有預設值**）/ outline（String?）/
 * tags（String[]，預設 []）/ createdAt / updatedAt —— 沒有 type / payload 這種欄位。
 * 因為 content 是 required，create 沒帶 content 時補空字串（否則 Prisma 直接拒絕）。
 *
 * 擁有權：**只能動自己的草稿**。別人的草稿一律 403（而且不會先讀出內容再擋）；
 * 找不到一律 404（update 與 remove 都是，remove 的 404 是明確要求）。
 *
 * 列表形狀：`data` 是**陣列**（與 userController.getFollows / getHistory 同慣例），
 * 依 updatedAt 由新到舊，`?limit=` 夾在 1..100（預設 50），可選 `?q=` 同時搜標題與正文。
 */
const { z } = require('zod');
const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');

const MAX_CONTENT = 200000; // 劇本正文上限（Text 欄位，給個寬鬆但存在的界線）

const createSchema = z.object({
  title: z.string().trim().min(1, '標題不可為空').max(120, '標題過長').optional(),
  content: z.string().max(MAX_CONTENT, '內容過長').optional(),
  outline: z.string().max(MAX_CONTENT, '大綱過長').optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(20, '標籤最多 20 個').optional(),
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1, '標題不可為空').max(120, '標題過長').optional(),
    content: z.string().max(MAX_CONTENT, '內容過長').optional(),
    outline: z.string().max(MAX_CONTENT, '大綱過長').optional(),
    tags: z.array(z.string().trim().min(1).max(30)).max(20, '標籤最多 20 個').optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: '沒有可更新的欄位' });

const DRAFT_SELECT = {
  id: true, title: true, content: true, outline: true, tags: true,
  createdAt: true, updatedAt: true,
};

function requesterId(req) {
  return (req.user && req.user.userId) || null;
}

function pageLimit(req, def = 50, max = 100) {
  const n = parseInt(req.query && req.query.limit, 10);
  return Math.min(Math.max(Number.isNaN(n) ? def : n, 1), max);
}

function toDraft(d) {
  return {
    id: d.id,
    title: d.title,
    content: d.content,
    outline: d.outline,
    tags: Array.isArray(d.tags) ? d.tags : [],
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

// ---------- 端點 ----------
// POST /drafts
async function create(req, res) {
  try {
    const userId = requesterId(req);
    if (!userId) return error(res, 401, '未授權');

    const parsed = createSchema.safeParse(req.body === undefined ? {} : req.body);
    if (!parsed.success) return error(res, 400, '請求參數不合法');
    const { title, content, outline, tags } = parsed.data;

    const data = {
      userId,
      title: title || '未命名草稿',
      content: content === undefined ? '' : content, // content 是 required，不能留 undefined
    };
    if (outline !== undefined) data.outline = outline;
    if (tags !== undefined) data.tags = tags;

    const draft = await prisma.draft.create({ data, select: DRAFT_SELECT });
    success(res, toDraft(draft), '草稿已建立');
  } catch (e) {
    console.error(e);
    error(res, 500, '建立草稿失敗');
  }
}

// GET /drafts
async function list(req, res) {
  try {
    const userId = requesterId(req);
    if (!userId) return error(res, 401, '未授權');

    const q = String((req.query && req.query.q) || '').trim();
    const where = { userId };
    if (q) {
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { content: { contains: q, mode: 'insensitive' } },
      ];
    }

    const rows = await prisma.draft.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: pageLimit(req),
      select: DRAFT_SELECT,
    });
    success(res, rows.map(toDraft));
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取草稿失敗');
  }
}

// PUT /drafts/:id
async function update(req, res) {
  try {
    const userId = requesterId(req);
    if (!userId) return error(res, 401, '未授權');

    const parsed = updateSchema.safeParse(req.body === undefined ? {} : req.body);
    if (!parsed.success) return error(res, 400, '請求參數不合法');

    // 先確認存在與擁有權，再更新（別人的草稿不會被寫到）
    const existing = await prisma.draft.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true },
    });
    if (!existing) return error(res, 404, '草稿不存在');
    if (existing.userId !== userId) return error(res, 403, '無權修改此草稿');

    const updated = await prisma.draft.update({
      where: { id: existing.id },
      data: parsed.data,
      select: DRAFT_SELECT,
    });
    success(res, toDraft(updated), '草稿已更新');
  } catch (e) {
    console.error(e);
    error(res, 500, '更新草稿失敗');
  }
}

// DELETE /drafts/:id
async function remove(req, res) {
  try {
    const userId = requesterId(req);
    if (!userId) return error(res, 401, '未授權');

    const existing = await prisma.draft.findUnique({
      where: { id: req.params.id },
      select: { id: true, userId: true },
    });
    if (!existing) return error(res, 404, '草稿不存在');
    if (existing.userId !== userId) return error(res, 403, '無權刪除此草稿');

    await prisma.draft.delete({ where: { id: existing.id } });
    success(res, { id: existing.id, deleted: true }, '草稿已刪除');
  } catch (e) {
    console.error(e);
    error(res, 500, '刪除草稿失敗');
  }
}

module.exports = { create, list, update, remove };
