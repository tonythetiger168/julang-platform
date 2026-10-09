// ===== v7.2 單元測試：vertical-slice controllers =====
// drama / auth / user 三個 controller 在原始 repo 中不存在（API 因此起不來）。
// 這裡用 mocked Prisma 驗「邏輯」——回應形狀、型別轉換、錯誤路徑、以及真的傳給
// Prisma 的查詢參數。**不驗證 SQL 正確性**（那需要真的資料庫），這是刻意的取捨。
jest.mock('../api/utils/prisma', () => ({
  drama: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  category: { findMany: jest.fn() },
  episode: { findMany: jest.fn() },
  userFollow: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), findMany: jest.fn() },
  watchHistory: { upsert: jest.fn(), create: jest.fn(), findMany: jest.fn() },
  user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  checkinLog: { findFirst: jest.fn(), create: jest.fn() },
  coinTransaction: { create: jest.fn() },
}));

const prisma = require('../api/utils/prisma');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const dramaCtrl = require('../api/controllers/dramaController');
const authCtrl = require('../api/controllers/authController');
const userCtrl = require('../api/controllers/userController');
const checkinCtrl = require('../api/controllers/checkinController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const req = (extra = {}) => Object.assign({ query: {}, params: {}, body: {}, user: { userId: 'u1' } }, extra);

const DRAMA_ROW = {
  id: 'd1', title: '霸道總裁愛上我', desc: 'x', cover: 'c.jpg',
  totalEpisodes: 3, isFree: true, pricePerEp: 0,
  views: 230000000n,               // BigInt：直接 JSON 會爆
  likes: 5, rating: { toNumber: () => 9.2 },  // Decimal
  createdAt: new Date('2026-01-01'),
  category: { id: 'c1', name: '甜寵' },
};

beforeEach(() => { jest.clearAllMocks(); });

// ---------------------------------------------------------------------------
describe('dramaController — 型別與卡片形狀', () => {
  test('BigInt/Decimal 轉成 number，列表的 episodes 保持數字', () => {
    const card = dramaCtrl._toCard(DRAMA_ROW);
    expect(typeof card.views).toBe('number');
    expect(card.views).toBe(230000000);
    expect(card.rating).toBe(9.2);
    expect(typeof card.episodes).toBe('number');   // 前端印 `${episodes}集`
    expect(card.episodes).toBe(3);
    expect(card.category).toBe('甜寵');
  });

  test('_num 對 BigInt / Decimal / 壞值都安全', () => {
    expect(dramaCtrl._num(10n)).toBe(10);
    expect(dramaCtrl._num({ toNumber: () => 1.5 })).toBe(1.5);
    expect(dramaCtrl._num('7')).toBe(7);
    expect(dramaCtrl._num(undefined)).toBe(0);
    expect(dramaCtrl._num('abc')).toBe(0);
  });

  test('BigInt 真的會讓 JSON.stringify 爆掉（證明轉型是必要的）', () => {
    expect(() => JSON.stringify({ v: 1n })).toThrow(TypeError);
  });
});

describe('dramaController — 端點邏輯', () => {
  test('getRecommendations 只查已上架且審核通過，並回 {total,list}', async () => {
    prisma.drama.findMany.mockResolvedValue([DRAMA_ROW]);
    const res = mockRes();
    await dramaCtrl.getRecommendations(req(), res);
    expect(res.body.code).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.list).toHaveLength(1);
    const arg = prisma.drama.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ status: 1, auditStatus: 'approved' });
    expect(arg.take).toBe(20);
  });

  test('limit 會被夾在 1..50', async () => {
    prisma.drama.findMany.mockResolvedValue([]);
    await dramaCtrl.getRecommendations(req({ query: { limit: '999' } }), mockRes());
    expect(prisma.drama.findMany.mock.calls[0][0].take).toBe(50);
    await dramaCtrl.getRecommendations(req({ query: { limit: '-5' } }), mockRes());
    expect(prisma.drama.findMany.mock.calls[1][0].take).toBe(1);
  });

  test('search 空字串直接回空，不查資料庫', async () => {
    const res = mockRes();
    await dramaCtrl.search(req({ query: { q: '   ' } }), res);
    expect(res.body.data.total).toBe(0);
    expect(prisma.drama.findMany).not.toHaveBeenCalled();
  });

  test('search 會查 title 與 desc', async () => {
    prisma.drama.findMany.mockResolvedValue([]);
    await dramaCtrl.search(req({ query: { q: '總裁' } }), mockRes());
    const where = prisma.drama.findMany.mock.calls[0][0].where;
    expect(where.OR[0].title.contains).toBe('總裁');
    expect(where.OR[1].desc.contains).toBe('總裁');
  });

  test('getDrama 找不到回 404', async () => {
    prisma.drama.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await dramaCtrl.getDrama(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe(404);
  });

  test('getDrama 成功時 episodes 是陣列（唯一帶陣列的端點）', async () => {
    prisma.drama.findUnique.mockResolvedValue(Object.assign({}, DRAMA_ROW, {
      episodes: [{ id: 'e1', episodeNumber: 1, title: '第1集', videoUrl: 'v.m3u8', duration: 60 }],
    }));
    const res = mockRes();
    await dramaCtrl.getDrama(req({ params: { id: 'd1' } }), res);
    expect(Array.isArray(res.body.data.episodes)).toBe(true);
    expect(res.body.data.episodes[0].videoUrl).toBe('v.m3u8');
  });

  test('getCategories 把 _count.dramas 轉成 dramaCount，且回陣列', async () => {
    prisma.category.findMany.mockResolvedValue([{ id: 'c1', name: '甜寵', icon: '💕', _count: { dramas: 7 } }]);
    const res = mockRes();
    await dramaCtrl.getCategories(req(), res);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0].dramaCount).toBe(7);
  });

  test('getRankings 依類型排序，無效類型回 400', async () => {
    prisma.drama.findMany.mockResolvedValue([]);
    await dramaCtrl.getRankings(req({ params: { type: 'hot' } }), mockRes());
    expect(prisma.drama.findMany.mock.calls[0][0].orderBy).toEqual([{ views: 'desc' }]);
    await dramaCtrl.getRankings(req({ params: { type: 'new' } }), mockRes());
    expect(prisma.drama.findMany.mock.calls[1][0].orderBy).toEqual([{ createdAt: 'desc' }]);
    const res = mockRes();
    await dramaCtrl.getRankings(req({ params: { type: 'bogus' } }), res);
    expect(res.statusCode).toBe(400);
  });

  test('toggleFollow 不存在 → 建立；已存在 → 刪除', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.userFollow.findUnique.mockResolvedValue(null);
    let res = mockRes();
    await dramaCtrl.toggleFollow(req({ params: { id: 'd1' } }), res);
    expect(prisma.userFollow.create).toHaveBeenCalledWith({ data: { userId: 'u1', dramaId: 'd1' } });
    expect(res.body.data.following).toBe(true);

    prisma.userFollow.findUnique.mockResolvedValue({ id: 'f1' });
    res = mockRes();
    await dramaCtrl.toggleFollow(req({ params: { id: 'd1' } }), res);
    expect(prisma.userFollow.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    expect(res.body.data.following).toBe(false);
  });

  test('toggleFollow 劇集不存在回 404', async () => {
    prisma.drama.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await dramaCtrl.toggleFollow(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.userFollow.create).not.toHaveBeenCalled();
  });

  test('recordWatch 有 episodeId → upsert 複合鍵，並把 views +1', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.watchHistory.upsert.mockResolvedValue({});
    prisma.drama.update.mockResolvedValue({});
    const res = mockRes();
    await dramaCtrl.recordWatch(req({ params: { id: 'd1' }, body: { episodeId: 'e1', progressSeconds: 30 } }), res);
    expect(prisma.watchHistory.upsert).toHaveBeenCalled();
    expect(prisma.watchHistory.upsert.mock.calls[0][0].where).toEqual({
      userId_dramaId_episodeId: { userId: 'u1', dramaId: 'd1', episodeId: 'e1' },
    });
    expect(prisma.drama.update).toHaveBeenCalledWith({
      where: { id: 'd1' }, data: { views: { increment: 1 } },
    });
    expect(res.body.data.recorded).toBe(true);
  });

  test('recordWatch 沒有 episodeId → 用 create（NULL 在 unique index 不相等）', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1' });
    prisma.watchHistory.create.mockResolvedValue({});
    prisma.drama.update.mockResolvedValue({});
    await dramaCtrl.recordWatch(req({ params: { id: 'd1' }, body: {} }), mockRes());
    expect(prisma.watchHistory.create).toHaveBeenCalled();
    expect(prisma.watchHistory.upsert).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('authController — schema 契約與登入流程', () => {
  test('registerSchema / loginSchema 是真正的 zod schema（否則 server 起不來）', () => {
    expect(typeof authCtrl.registerSchema.safeParse).toBe('function');
    expect(typeof authCtrl.loginSchema.safeParse).toBe('function');
    expect(authCtrl.registerSchema.safeParse({ phone: '0912345678', password: 'secret1' }).success).toBe(true);
    expect(authCtrl.registerSchema.safeParse({ phone: '0912345678', password: '123' }).success).toBe(false);
  });

  test('註冊：手機號已存在 → 409，且不建立', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1' });
    const res = mockRes();
    await authCtrl.register(req({ body: { phone: '0912345678', password: 'secret1' } }), res);
    expect(res.statusCode).toBe(409);
    expect(prisma.user.create).not.toHaveBeenCalled();
  });

  test('註冊：成功時雜湊密碼、發出 token、且不外洩 passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.user.create.mockImplementation(({ data }) => Promise.resolve(Object.assign({ id: 'u9', nickname: '劇迷' }, data)));
    const res = mockRes();
    await authCtrl.register(req({ body: { phone: '0912345678', password: 'secret1' } }), res);

    const created = prisma.user.create.mock.calls[0][0].data;
    expect(created.passwordHash).toMatch(/^\$2/);                 // bcrypt
    expect(created.passwordHash).not.toBe('secret1');             // 不是明文
    expect(created.inviteCode).toMatch(/^JL[0-9A-F]{8}$/);        // required+unique，必須自己產
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(jwt.verify(res.body.data.token, process.env.JWT_SECRET || 'julang-dev-secret').userId).toBe('u9');
  });

  test('登入：帳號不存在與密碼錯誤都回 401（不洩漏帳號是否存在）', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    let res = mockRes();
    await authCtrl.login(req({ body: { phone: '0999', password: 'x' } }), res);
    expect(res.statusCode).toBe(401);

    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 1, passwordHash: await bcrypt.hash('right', 10) });
    res = mockRes();
    await authCtrl.login(req({ body: { phone: '0999', password: 'wrong' } }), res);
    expect(res.statusCode).toBe(401);
  });

  test('登入：成功會更新 lastLoginAt 並回 token', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', phone: '0912345678', status: 1, coins: 10, passwordHash: await bcrypt.hash('right', 10) });
    prisma.user.update.mockResolvedValue({});
    const res = mockRes();
    await authCtrl.login(req({ body: { phone: '0912345678', password: 'right' } }), res);
    expect(res.body.code).toBe(200);
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
    expect(res.body.data.token).toBeTruthy();
  });

  test('登入：停用帳號回 403', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 0, passwordHash: 'x' });
    const res = mockRes();
    await authCtrl.login(req({ body: { phone: '0912345678', password: 'right' } }), res);
    expect(res.statusCode).toBe(403);
  });

  test('refresh：沒有 userId 回 401；正常帳號換新 token', async () => {
    let res = mockRes();
    await authCtrl.refresh(req({ user: {} }), res);
    expect(res.statusCode).toBe(401);

    prisma.user.findUnique.mockResolvedValue({ id: 'u1', status: 1 });
    res = mockRes();
    await authCtrl.refresh(req(), res);
    expect(jwt.verify(res.body.data.token, process.env.JWT_SECRET || 'julang-dev-secret').userId).toBe('u1');
  });
});

// ---------------------------------------------------------------------------
describe('userController — 委派與合併查詢', () => {
  test('getProfile 找不到回 404，且 select 不含 passwordHash', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    let res = mockRes();
    await userCtrl.getProfile(req(), res);
    expect(res.statusCode).toBe(404);
    const select = prisma.user.findUnique.mock.calls[0][0].select;
    expect(select.passwordHash).toBeUndefined();
  });

  test('getCoins 回 {coins}（前端 loadUserCoins 讀 res.data.coins）', async () => {
    prisma.user.findUnique.mockResolvedValue({ coins: 8888 });
    const res = mockRes();
    await userCtrl.getCoins(req(), res);
    expect(res.body.data).toEqual({ coins: 8888 });
  });

  test('checkin 委派給 checkinController.dailyCheckin（不重寫簽到邏輯）', () => {
    const spy = jest.spyOn(checkinCtrl, 'dailyCheckin').mockImplementation(() => 'delegated');
    const out = userCtrl.checkin(req(), mockRes());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(out).toBe('delegated');
    spy.mockRestore();
  });

  test('getFollows 用第二次查詢補劇名（UserFollow 沒有 drama 關聯）', async () => {
    prisma.userFollow.findMany.mockResolvedValue([{ dramaId: 'd1', lastEpisode: 2, progressSeconds: 90, createdAt: new Date() }]);
    prisma.drama.findMany.mockResolvedValue([{ id: 'd1', title: '霸道總裁愛上我', cover: 'c.jpg', totalEpisodes: 3 }]);
    const res = mockRes();
    await userCtrl.getFollows(req(), res);
    expect(res.body.data[0].title).toBe('霸道總裁愛上我');
    expect(prisma.drama.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['d1'] } });
  });

  test('getFollows 對已刪除的劇集給 null，不會爆', async () => {
    prisma.userFollow.findMany.mockResolvedValue([{ dramaId: 'gone', lastEpisode: 0, progressSeconds: 0, createdAt: new Date() }]);
    prisma.drama.findMany.mockResolvedValue([]);
    const res = mockRes();
    await userCtrl.getFollows(req(), res);
    expect(res.body.data[0].title).toBeNull();
  });

  test('getHistory 依 watchedAt 排序並補劇名', async () => {
    prisma.watchHistory.findMany.mockResolvedValue([{ dramaId: 'd1', episodeId: 'e1', progressSeconds: 12, watchedAt: new Date() }]);
    prisma.drama.findMany.mockResolvedValue([{ id: 'd1', title: 'T', cover: 'c', totalEpisodes: 3 }]);
    const res = mockRes();
    await userCtrl.getHistory(req(), res);
    expect(prisma.watchHistory.findMany.mock.calls[0][0].orderBy).toEqual({ watchedAt: 'desc' });
    expect(res.body.data[0].title).toBe('T');
  });

  test('沒有追劇時不會發出第二次查詢', async () => {
    prisma.userFollow.findMany.mockResolvedValue([]);
    await userCtrl.getFollows(req(), mockRes());
    expect(prisma.drama.findMany).not.toHaveBeenCalled();
  });
});
