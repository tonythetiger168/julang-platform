/* ===== v7.7 測試：劇集留言（/dramas/:id/comments、/comments/:commentId）=====
 *
 * 契約（前端已照此接線，凍結）：
 *   GET    /dramas/:id/comments?page=&limit=  optionalAuth；未登入可看；
 *          data = { total, page, limit, list: [{ id, content, createdAt, likes, mine,
 *                   user: { id, nickname, avatar } }] }
 *          `total` 是**該劇留言總數**（count），不是當頁長度；排序 createdAt desc；
 *          劇不存在 → 404。
 *   POST   /dramas/:id/comments  auth + validate(commentSchema)；
 *          body { content, episodeId? }；空內容 → 400（zod）；episodeId 不屬於該劇 → 400；
 *          劇不存在 → 404；成功 → { code:200, message:'留言成功', data: <單則，mine:true> }。
 *   DELETE /comments/:commentId  auth；別人的 → 403、不存在 → 404、自己的 → 200 data:null。
 *
 * 用 mocked Prisma 驗「邏輯、回應形狀、middleware 鏈、以及真的傳給 Prisma 的參數」。
 * **不驗 SQL**（真 DB + 真 HTTP 在 _julang-analysis/pg/comments-verify.js）。
 */
// routes/drama.js 會 require middleware/cache -> config/redis；真 client 連不上時會無限
// 重試（open handle），Jest 永遠不退出，所以這裡注入「未連線」狀態（同 paywall.test.js）。
jest.mock('../api/config/redis', () => ({ isReady: false, get: jest.fn(), setEx: jest.fn() }));

jest.mock('../api/utils/prisma', () => ({
  drama: { findUnique: jest.fn() },
  episode: { findUnique: jest.fn() },
  userFollow: { count: jest.fn() },
  comment: {
    findMany: jest.fn(), count: jest.fn(), create: jest.fn(),
    findUnique: jest.fn(), delete: jest.fn(),
  },
}));

const jwt = require('jsonwebtoken');
const prisma = require('../api/utils/prisma');
const ctrl = require('../api/controllers/commentController');
const dramaCtrl = require('../api/controllers/dramaController');
const auth = require('../api/middleware/auth');
const optionalAuth = require('../api/middleware/optionalAuth');

const JWT_SECRET = process.env.JWT_SECRET || 'julang-dev-secret';

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const req = (extra = {}) => Object.assign({ query: {}, params: {}, body: {}, headers: {} }, extra);
const loggedIn = (extra = {}) => req(Object.assign({ user: { userId: 'u1' } }, extra));

const ROW_A = {
  id: 'c1', content: 'A 的留言', createdAt: new Date('2026-01-02T03:04:05Z'),
  likes: 3, userId: 'u1', user: { id: 'u1', nickname: '小A', avatar: 'a.png' },
};
const ROW_B = {
  id: 'c2', content: 'B 的留言', createdAt: new Date('2026-01-01T00:00:00Z'),
  likes: 0, userId: 'u2', user: { id: 'u2', nickname: '小B', avatar: null },
};
const EXPECT_A = {
  id: 'c1', content: 'A 的留言', createdAt: ROW_A.createdAt, likes: 3, mine: false,
  user: { id: 'u1', nickname: '小A', avatar: 'a.png' },
};

const dramaRouter = () => require('../api/routes/drama');
const commentsRouter = () => require('../api/routes/comments');
const handlesFor = (router, p, method) => {
  // 同一個 path 可能有 GET 與 POST 兩個 layer，一定要一起比對 method
  const layer = router.stack.find((l) => l.route && l.route.path === p
    && (!method || l.route.methods[method] === true));
  expect(layer).toBeTruthy();
  return layer.route.stack.map((s) => s.handle);
};

beforeEach(() => {
  jest.clearAllMocks();
  prisma.drama.findUnique.mockResolvedValue({ id: 'd1' });
  prisma.episode.findUnique.mockResolvedValue(null);
  prisma.userFollow.count.mockResolvedValue(0);
  prisma.comment.count.mockResolvedValue(0);
  prisma.comment.findMany.mockResolvedValue([]);
  prisma.comment.create.mockResolvedValue(ROW_A);
  prisma.comment.findUnique.mockResolvedValue(null);
  prisma.comment.delete.mockResolvedValue({});
});

// ===========================================================================
describe('routes — 掛載位置與 middleware 鏈', () => {
  test('GET /:id/comments 鏈上是 [optionalAuth, ctrl.listDramaComments]', () => {
    const h = handlesFor(dramaRouter(), '/:id/comments', 'get');
    expect(h).toHaveLength(2);
    expect(h[0]).toBe(optionalAuth);
    expect(h[1]).toBe(ctrl.listDramaComments);
    expect(h).not.toContain(auth); // 列表絕不能被硬 auth 擋掉
  });

  test('POST /:id/comments 鏈上是 [auth, validate(commentSchema), ctrl.addDramaComment]', () => {
    const h = handlesFor(dramaRouter(), '/:id/comments', 'post');
    expect(h).toHaveLength(3);
    expect(h[0]).toBe(auth);
    expect(typeof h[1]).toBe('function'); // validate() 每次回一個新閉包
    expect(h[1]).not.toBe(ctrl.addDramaComment);
    expect(h[2]).toBe(ctrl.addDramaComment);
  });

  test('DELETE /comments/:commentId 鏈上是 [auth, ctrl.removeDramaComment]', () => {
    const h = handlesFor(commentsRouter(), '/:commentId', 'delete');
    expect(h).toHaveLength(2);
    expect(h[0]).toBe(auth);
    expect(h[1]).toBe(ctrl.removeDramaComment);
  });

  test('POST 的 validate 真的會擋空內容：400、不呼叫 next、不碰 DB', () => {
    const h = handlesFor(dramaRouter(), '/:id/comments', 'post');
    const res = mockRes();
    const next = jest.fn();
    h[1]({ body: { content: '   ' } }, res, next);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
    expect(next).not.toHaveBeenCalled();
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  test('POST 的 validate 保留 episodeId（zod 預設會剝除未宣告的鍵，這裡釘住）', () => {
    const h = handlesFor(dramaRouter(), '/:id/comments', 'post');
    const r = { body: { content: '  好看  ', episodeId: 'e1' } };
    const res = mockRes();
    const next = jest.fn();
    h[1](r, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(r.body).toEqual({ content: '好看', episodeId: 'e1' });
  });

  test('未登入 POST → auth 直接 401，且完全不碰資料庫', () => {
    const h = handlesFor(dramaRouter(), '/:id/comments', 'post');
    const res = mockRes();
    const next = jest.fn();
    h[0](req({ params: { id: 'd1' }, body: { content: 'hi' } }), res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(prisma.comment.create).not.toHaveBeenCalled();
    expect(prisma.drama.findUnique).not.toHaveBeenCalled();
  });

  test('未登入 DELETE → auth 直接 401', () => {
    const h = handlesFor(commentsRouter(), '/:commentId', 'delete');
    const res = mockRes();
    const next = jest.fn();
    h[0](req({ params: { commentId: 'c1' } }), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(prisma.comment.delete).not.toHaveBeenCalled();
  });

  test('有效 token → auth 放行並把 userId 放進 req.user', () => {
    const token = jwt.sign({ userId: 'u1' }, JWT_SECRET);
    const r = req({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = jest.fn();
    handlesFor(commentsRouter(), '/:commentId', 'delete')[0](r, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(r.user.userId).toBe('u1');
    expect(res.statusCode).toBe(200);
  });
});

// ===========================================================================
describe('commentController.listDramaComments — GET /dramas/:id/comments', () => {
  test('劇不存在 → 404，且不查留言', async () => {
    prisma.drama.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await ctrl.listDramaComments(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe(404);
    expect(prisma.comment.findMany).not.toHaveBeenCalled();
    expect(prisma.comment.count).not.toHaveBeenCalled();
  });

  test('未登入可看：200，且所有 mine 都是 false', async () => {
    prisma.comment.findMany.mockResolvedValue([ROW_A, ROW_B]);
    prisma.comment.count.mockResolvedValue(2);
    const res = mockRes();
    await ctrl.listDramaComments(req({ params: { id: 'd1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data.list.map((x) => x.mine)).toEqual([false, false]);
    expect(res.body.data.list[0]).toEqual(EXPECT_A);
  });

  test('mine：登入者 u1 對自己的留言 true、對別人的 false（回應不含 userId）', async () => {
    prisma.comment.findMany.mockResolvedValue([ROW_A, ROW_B]);
    prisma.comment.count.mockResolvedValue(2);
    const res = mockRes();
    await ctrl.listDramaComments(loggedIn({ params: { id: 'd1' } }), res);
    const [a, b] = res.body.data.list;
    expect(a.mine).toBe(true);
    expect(b.mine).toBe(false);
    expect(a.userId).toBeUndefined();
    expect(a.user).toEqual({ id: 'u1', nickname: '小A', avatar: 'a.png' });
  });

  test('total 是 count（該劇總數），不是當頁長度', async () => {
    prisma.comment.findMany.mockResolvedValue([ROW_A, ROW_B]); // 當頁 2 筆
    prisma.comment.count.mockResolvedValue(57);                // 全部 57 筆
    const res = mockRes();
    await ctrl.listDramaComments(req({ params: { id: 'd1' } }), res);
    expect(res.body.data.total).toBe(57);
    expect(res.body.data.list).toHaveLength(2);
    expect(prisma.comment.count).toHaveBeenCalledWith({ where: { dramaId: 'd1' } });
  });

  test('真的傳給 Prisma 的參數：where 只有 dramaId、createdAt desc、skip/take 依分頁', async () => {
    await ctrl.listDramaComments(req({ params: { id: 'd1' }, query: { page: '3', limit: '10' } }), mockRes());
    const arg = prisma.comment.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ dramaId: 'd1' });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.skip).toBe(20);
    expect(arg.take).toBe(10);
    expect(arg.select.user.select).toEqual({ id: true, nickname: true, avatar: true });
    expect(arg.select).toMatchObject({ id: true, content: true, createdAt: true, likes: true, userId: true });
  });

  test('預設 limit 30；上限夾在 50、下限 1；壞 page 回 1', async () => {
    await ctrl.listDramaComments(req({ params: { id: 'd1' } }), mockRes());
    expect(prisma.comment.findMany.mock.calls[0][0].take).toBe(30);
    expect(prisma.comment.findMany.mock.calls[0][0].skip).toBe(0);

    await ctrl.listDramaComments(req({ params: { id: 'd1' }, query: { limit: '999' } }), mockRes());
    expect(prisma.comment.findMany.mock.calls[1][0].take).toBe(50);

    await ctrl.listDramaComments(req({ params: { id: 'd1' }, query: { limit: '0' } }), mockRes());
    expect(prisma.comment.findMany.mock.calls[2][0].take).toBe(1);

    await ctrl.listDramaComments(req({ params: { id: 'd1' }, query: { page: '-2', limit: 'x' } }), mockRes());
    expect(prisma.comment.findMany.mock.calls[3][0].skip).toBe(0);
    expect(prisma.comment.findMany.mock.calls[3][0].take).toBe(30);
  });

  test('查詢失敗 → 500，不洩漏內部訊息', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    prisma.comment.findMany.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await ctrl.listDramaComments(req({ params: { id: 'd1' } }), res);
    spy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ code: 500, message: '獲取留言失敗' });
  });
});

// ===========================================================================
describe('commentController.addDramaComment — POST /dramas/:id/comments', () => {
  test('成功建立：回單則留言（mine:true）、message 留言成功、真的是 create 出來的', async () => {
    prisma.comment.create.mockResolvedValue(ROW_A);
    const res = mockRes();
    await ctrl.addDramaComment(loggedIn({ params: { id: 'd1' }, body: { content: '好看' } }), res);

    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.message).toBe('留言成功');
    expect(res.body.data).toEqual(Object.assign({}, EXPECT_A, { mine: true }));

    const arg = prisma.comment.create.mock.calls[0][0];
    expect(arg.data).toEqual({ dramaId: 'd1', userId: 'u1', content: '好看', episodeId: null });
    expect(arg.select.user.select).toEqual({ id: true, nickname: true, avatar: true });
  });

  test('content 前後空白被 trim 後才寫入；只留空白 → 400 且不建', async () => {
    await ctrl.addDramaComment(loggedIn({ params: { id: 'd1' }, body: { content: '  好看  ' } }), mockRes());
    expect(prisma.comment.create.mock.calls[0][0].data.content).toBe('好看');

    const res = mockRes();
    await ctrl.addDramaComment(loggedIn({ params: { id: 'd1' }, body: { content: '   ' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
    expect(prisma.comment.create).toHaveBeenCalledTimes(1); // 只有上一句那次
  });

  test('超過 500 字 → 400，且不建（直接呼叫 controller 也擋得住）', async () => {
    const res = mockRes();
    await ctrl.addDramaComment(loggedIn({ params: { id: 'd1' }, body: { content: 'x'.repeat(501) } }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  test('沒有 req.user（未登入直呼 controller）→ 401，不碰資料庫', async () => {
    const res = mockRes();
    await ctrl.addDramaComment(req({ params: { id: 'd1' }, body: { content: 'hi' } }), res);
    expect(res.statusCode).toBe(401);
    expect(prisma.drama.findUnique).not.toHaveBeenCalled();
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  test('劇不存在 → 404，且不建留言', async () => {
    prisma.drama.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await ctrl.addDramaComment(loggedIn({ params: { id: 'nope' }, body: { content: 'hi' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  test('episodeId 屬於該劇 → 寫進 Comment.episodeId', async () => {
    prisma.episode.findUnique.mockResolvedValue({ id: 'e1', dramaId: 'd1' });
    await ctrl.addDramaComment(loggedIn({ params: { id: 'd1' }, body: { content: '好看', episodeId: 'e1' } }), mockRes());
    expect(prisma.episode.findUnique).toHaveBeenCalledWith({
      where: { id: 'e1' },
      select: { id: true, dramaId: true },
    });
    expect(prisma.comment.create.mock.calls[0][0].data.episodeId).toBe('e1');
  });

  test('episodeId 屬於別的劇 → 400，且不建留言', async () => {
    prisma.episode.findUnique.mockResolvedValue({ id: 'e9', dramaId: 'OTHER' });
    const res = mockRes();
    await ctrl.addDramaComment(loggedIn({ params: { id: 'd1' }, body: { content: '好看', episodeId: 'e9' } }), res);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  test('episodeId 不存在 → 400，且不建留言', async () => {
    prisma.episode.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await ctrl.addDramaComment(loggedIn({ params: { id: 'd1' }, body: { content: '好看', episodeId: 'ghost' } }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.comment.create).not.toHaveBeenCalled();
  });

  test('沒帶 episodeId / 帶 null → 都不查 episode，episodeId 存 null', async () => {
    await ctrl.addDramaComment(loggedIn({ params: { id: 'd1' }, body: { content: '好看' } }), mockRes());
    await ctrl.addDramaComment(loggedIn({ params: { id: 'd1' }, body: { content: '好看', episodeId: null } }), mockRes());
    expect(prisma.episode.findUnique).not.toHaveBeenCalled();
    expect(prisma.comment.create.mock.calls[0][0].data.episodeId).toBeNull();
    expect(prisma.comment.create.mock.calls[1][0].data.episodeId).toBeNull();
  });

  test('寫入失敗 → 500，不洩漏內部訊息', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    prisma.comment.create.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await ctrl.addDramaComment(loggedIn({ params: { id: 'd1' }, body: { content: 'hi' } }), res);
    spy.mockRestore();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ code: 500, message: '發表留言失敗' });
  });
});

// ===========================================================================
describe('commentController.removeDramaComment — DELETE /comments/:commentId', () => {
  test('不存在 → 404，不刪', async () => {
    prisma.comment.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await ctrl.removeDramaComment(loggedIn({ params: { commentId: 'ghost' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.comment.delete).not.toHaveBeenCalled();
  });

  test('別人的留言 → 403，不刪', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'c2', userId: 'uB' });
    const res = mockRes();
    await ctrl.removeDramaComment(loggedIn({ params: { commentId: 'c2' } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe(403);
    expect(prisma.comment.delete).not.toHaveBeenCalled();
  });

  test('自己的留言 → 200、data 為 null、message 已刪除，且真的 delete 那一筆', async () => {
    prisma.comment.findUnique.mockResolvedValue({ id: 'c1', userId: 'u1' });
    const res = mockRes();
    await ctrl.removeDramaComment(loggedIn({ params: { commentId: 'c1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.message).toBe('已刪除');
    expect(res.body.data).toBeNull();
    expect(prisma.comment.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
  });

  test('沒有 req.user → 401，不查也不刪', async () => {
    const res = mockRes();
    await ctrl.removeDramaComment(req({ params: { commentId: 'c1' } }), res);
    expect(res.statusCode).toBe(401);
    expect(prisma.comment.findUnique).not.toHaveBeenCalled();
    expect(prisma.comment.delete).not.toHaveBeenCalled();
  });
});

// ===========================================================================
describe('dramaController.getDrama — 真實的 commentCount / followCount', () => {
  const DRAMA = {
    id: 'd1', title: '劇', desc: null, cover: null, totalEpisodes: 1, isFree: true, pricePerEp: 0,
    views: 10n, likes: 0, rating: { toNumber: () => 8 }, createdAt: new Date('2026-01-01'),
    category: null,
    episodes: [{ id: 'e1', episodeNumber: 1, title: '第1集', videoUrl: 'v.m3u8', duration: 60 }],
  };

  test('兩個數字都是真的 count，查詢參數就是 { where: { dramaId } }', async () => {
    prisma.drama.findUnique.mockResolvedValue(DRAMA);
    prisma.comment.count.mockResolvedValue(7);
    prisma.userFollow.count.mockResolvedValue(12);
    const res = mockRes();
    await dramaCtrl.getDrama(req({ params: { id: 'd1' } }), res);

    expect(res.body.data.commentCount).toBe(7);
    expect(res.body.data.followCount).toBe(12);
    expect(prisma.comment.count).toHaveBeenCalledWith({ where: { dramaId: 'd1' } });
    expect(prisma.userFollow.count).toHaveBeenCalledWith({ where: { dramaId: 'd1' } });
    // 付費牆契約不受影響
    expect(res.body.data.freeEpisodes).toBe(5);
  });

  test('count 查詢失敗 → 降級為 0，端點仍 200、付費牆欄位完好（不可 500）', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    prisma.drama.findUnique.mockResolvedValue(DRAMA);
    prisma.comment.count.mockRejectedValue(new Error('db down'));
    prisma.userFollow.count.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await dramaCtrl.getDrama(req({ params: { id: 'd1' } }), res);
    spy.mockRestore();

    expect(res.statusCode).toBe(200);
    expect(res.body.data.commentCount).toBe(0);
    expect(res.body.data.followCount).toBe(0);
    expect(res.body.data.freeEpisodes).toBe(5);
    expect(res.body.data.episodes[0]).toMatchObject({
      free: true, unlocked: true, locked: false, videoUrl: 'v.m3u8',
    });
  });

  test('劇不存在 → 404，且完全不去查這兩個 count', async () => {
    prisma.drama.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await dramaCtrl.getDrama(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.comment.count).not.toHaveBeenCalled();
    expect(prisma.userFollow.count).not.toHaveBeenCalled();
  });
});

// ===========================================================================
describe('commentController.commentSchema — zod 契約', () => {
  test('是真的 zod schema，且 content 會 trim', () => {
    expect(typeof ctrl.commentSchema.safeParse).toBe('function');
    const r = ctrl.commentSchema.safeParse({ content: '  好看  ' });
    expect(r.success).toBe(true);
    expect(r.data.content).toBe('好看');
  });

  test('空字串 / 只有空白 / 缺少 content → 失敗', () => {
    expect(ctrl.commentSchema.safeParse({ content: '' }).success).toBe(false);
    expect(ctrl.commentSchema.safeParse({ content: '   ' }).success).toBe(false);
    expect(ctrl.commentSchema.safeParse({}).success).toBe(false);
  });

  test('剛好 500 字過、501 字失敗', () => {
    expect(ctrl.commentSchema.safeParse({ content: 'x'.repeat(500) }).success).toBe(true);
    expect(ctrl.commentSchema.safeParse({ content: 'x'.repeat(501) }).success).toBe(false);
  });

  test('episodeId 可選、可為 null、非文字 → 失敗', () => {
    expect(ctrl.commentSchema.safeParse({ content: 'ok' }).data.episodeId).toBeUndefined();
    expect(ctrl.commentSchema.safeParse({ content: 'ok', episodeId: 'e1' }).data.episodeId).toBe('e1');
    expect(ctrl.commentSchema.safeParse({ content: 'ok', episodeId: null }).success).toBe(true);
    expect(ctrl.commentSchema.safeParse({ content: 'ok', episodeId: 123 }).success).toBe(false);
    expect(ctrl.commentSchema.safeParse({ content: 'ok', episodeId: '  ' }).success).toBe(false);
  });
});
