// ===== v7.2 單元測試：creatorController（缺失的第 4 個 vertical slice）=====
// creatorController.js 在原始 repo 中不存在，`require('../controllers/creatorController')`
// 會直接讓整個 route group 掛掉。這裡用 mocked Prisma 驗「邏輯」——回應形狀、型別轉換、
// 權限路徑（403 / 404）、zod schema 契約、以及真的傳給 Prisma 的查詢參數。
// **不驗證 SQL 正確性**（那需要真的資料庫），與 tests/controllers.test.js 同樣的取捨。
jest.mock('../api/utils/prisma', () => ({
  creator: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  creatorFollow: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn(), count: jest.fn() },
  creatorEarning: { findMany: jest.fn() },
  creatorStats: { findUnique: jest.fn() },
  drama: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  episode: { findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  auditLog: { findMany: jest.fn() },
  user: { findUnique: jest.fn(), update: jest.fn() },
}));

const prisma = require('../api/utils/prisma');
const validate = require('../api/middleware/validate');
const creatorCtrl = require('../api/controllers/creatorController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const req = (extra = {}) => Object.assign(
  { query: {}, params: {}, body: {}, user: { userId: 'u1' } },
  extra,
);

const CREATOR_ROW = {
  id: 'cr1', userId: 'u1', realName: '林晚', idCard: 'A123456789', bio: '專拍甜寵',
  avatar: null, verified: false, status: 0,
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
};

const DRAMA_ROW = {
  id: 'd1', title: '霸道總裁愛上我', desc: 'x', cover: 'c.jpg',
  totalEpisodes: 3, status: 1, auditStatus: 'approved', rejectReason: null,
  isFree: true, pricePerEp: 0,
  views: 230000000n,                          // BigInt：直接 JSON 會爆
  likes: 5, rating: { toNumber: () => 9.2 },  // Decimal
  createdAt: new Date('2026-01-01'), publishedAt: new Date('2026-01-02'),
  category: { id: 'c1', name: '甜寵' },
};

beforeEach(() => { jest.clearAllMocks(); });

// ---------------------------------------------------------------------------
describe('creatorController — schema 契約（路由定義時就會用到 .safeParse）', () => {
  test('4 個 schema 都是真的 zod object', () => {
    for (const name of ['registerSchema', 'createDramaSchema', 'updateDramaSchema', 'addEpisodeSchema']) {
      expect(creatorCtrl[name]).toBeTruthy();
      expect(typeof creatorCtrl[name].safeParse).toBe('function');
      // validate() 還需要它是 zod object（PATCH 會呼叫 .partial()）
      expect(typeof creatorCtrl[name].partial).toBe('function');
    }
  });

  test('validate(...) 對這 4 個 schema 都不會丟 TypeError', () => {
    expect(() => validate(creatorCtrl.registerSchema)).not.toThrow();
    expect(() => validate(creatorCtrl.registerSchema.partial())).not.toThrow(); // PATCH /me/profile
    expect(() => validate(creatorCtrl.createDramaSchema)).not.toThrow();
    expect(() => validate(creatorCtrl.updateDramaSchema)).not.toThrow();
    expect(() => validate(creatorCtrl.addEpisodeSchema)).not.toThrow();
  });

  test('registerSchema：realName 必填，partial() 之後可只帶一個欄位', () => {
    const S = creatorCtrl.registerSchema;
    expect(S.safeParse({ realName: '林晚' }).success).toBe(true);
    expect(S.safeParse({}).success).toBe(false);
    expect(S.safeParse({ realName: '   ' }).success).toBe(false);
    expect(S.partial().safeParse({ nickname: '晚晚' }).success).toBe(true);
    expect(S.partial().safeParse({}).success).toBe(true);
  });

  test('createDramaSchema：title 必填、pricePerEp 由字串轉整數', () => {
    const S = creatorCtrl.createDramaSchema;
    expect(S.safeParse({ title: '新劇' }).success).toBe(true);
    expect(S.safeParse({}).success).toBe(false);
    expect(S.safeParse({ title: '新劇', pricePerEp: '9' }).data.pricePerEp).toBe(9);
    expect(S.safeParse({ title: '新劇', pricePerEp: -1 }).success).toBe(false);
    expect(S.safeParse({ title: '新劇', pricePerEp: 1.5 }).success).toBe(false);
  });

  test('createDramaSchema 會剔掉 auditStatus / creatorId / views 等不該由創作者決定的欄位', () => {
    const mw = validate(creatorCtrl.createDramaSchema);
    const r = { body: { title: '新劇', auditStatus: 'approved', creatorId: 'cr999', views: 99, rating: 5 } };
    const next = jest.fn();
    mw(r, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(r.body).toEqual({ title: '新劇' });
  });

  test('updateDramaSchema 全部 optional（路由沒有用 .partial()）', () => {
    const S = creatorCtrl.updateDramaSchema;
    expect(S.safeParse({}).success).toBe(true);
    expect(S.safeParse({ status: 0 }).success).toBe(true);
    expect(S.safeParse({ title: '' }).success).toBe(false);
    expect(S.safeParse({ status: 2 }).success).toBe(false);
  });

  test('addEpisodeSchema：videoUrl 必填，episodeNumber 由字串轉整數', () => {
    const S = creatorCtrl.addEpisodeSchema;
    expect(S.safeParse({}).success).toBe(false);
    expect(S.safeParse({ videoUrl: 'v.m3u8' }).success).toBe(true);
    expect(S.safeParse({ videoUrl: 'v.m3u8', episodeNumber: '2' }).data.episodeNumber).toBe(2);
    expect(S.safeParse({ videoUrl: 'v.m3u8', episodeNumber: 0 }).success).toBe(false);
  });

  test('兩個 route 檔都載得起來（undefined handler 會讓 Express 直接丟 TypeError）', () => {
    expect(() => require('../api/routes/creator')).not.toThrow();
    expect(() => require('../api/routes/creators')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe('creatorController — register（user 升級成創作者）', () => {
  test('未登入回 401', async () => {
    const res = mockRes();
    await creatorCtrl.register(req({ user: {} }), res);
    expect(res.statusCode).toBe(401);
    expect(prisma.creator.create).not.toHaveBeenCalled();
  });

  test('用戶不存在回 404', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await creatorCtrl.register(req({ body: { realName: '林晚' } }), res);
    expect(res.statusCode).toBe(404);
  });

  test('已經是創作者回 409，且不重複建立', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', nickname: '劇迷', avatar: null });
    prisma.creator.findUnique.mockResolvedValue({ id: 'cr1' });
    const res = mockRes();
    await creatorCtrl.register(req({ body: { realName: '林晚' } }), res);
    expect(res.statusCode).toBe(409);
    expect(prisma.creator.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('成功：建立 Creator、同步 User.isCreator，並回 creator + user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', nickname: '劇迷', avatar: 'a.jpg' });
    prisma.creator.findUnique.mockResolvedValue(null);
    prisma.creator.create.mockImplementation(({ data }) => Promise.resolve(Object.assign({}, CREATOR_ROW, data)));
    prisma.user.update.mockResolvedValue({ id: 'u1', nickname: '劇迷', isCreator: true });

    const res = mockRes();
    await creatorCtrl.register(req({ body: { realName: ' 林晚 ', bio: '專拍甜寵', idCard: 'A123456789' } }), res);

    const data = prisma.creator.create.mock.calls[0][0].data;
    expect(data.userId).toBe('u1');                        // 掛在登入者身上，不是 body 亂傳的
    expect(data.realName).toBe('林晚');                     // 已 trim
    expect(data.idCard).toBe('A123456789');
    expect(data.avatar).toBe('a.jpg');                     // body 沒給就沿用 user 頭像
    expect(prisma.creator.findUnique.mock.calls[0][0].where).toEqual({ userId: 'u1' });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'u1' }, data: { isCreator: true },
    }));
    expect(res.body.code).toBe(200);
    expect(res.body.data.creator.id).toBe('cr1');
    expect(res.body.data.user.isCreator).toBe(true);
  });

  test('body 沒有 realName 時擋在 400（apply 這條路沒有 validate 中介軟體）', async () => {
    const res = mockRes();
    await creatorCtrl.apply(req({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.creator.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('creatorController — getProfile / updateProfile', () => {
  test('還不是創作者回 404（不是 403）', async () => {
    prisma.creator.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await creatorCtrl.getProfile(req(), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.creator.findUnique.mock.calls[0][0].where).toEqual({ userId: 'u1' });
    expect(prisma.user.findUnique).not.toHaveBeenCalled(); // 身分都沒有就不用查第二次
  });

  test('成功時用第二次查詢補 user 資料（nickname / coins）', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', nickname: '劇迷', avatar: 'a.jpg', coins: 8888, phone: '0912345678', isCreator: true });
    const res = mockRes();
    await creatorCtrl.getProfile(req(), res);
    expect(prisma.user.findUnique.mock.calls[0][0].where).toEqual({ id: 'u1' });
    expect(res.body.data.nickname).toBe('劇迷');
    expect(res.body.data.coins).toBe(8888);
    expect(res.body.data.avatar).toBe('a.jpg');       // creator.avatar 是 null → fallback
    expect(res.body.data.isCreator).toBe(true);
  });

  test('updateProfile：空 body 回 400，不做任何更新', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    const res = mockRes();
    await creatorCtrl.updateProfile(req({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.creator.update).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('updateProfile：只更新 Creator 的白名單欄位', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.creator.update.mockResolvedValue(Object.assign({}, CREATOR_ROW, { realName: '林晚晚' }));
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', nickname: '劇迷', coins: 1 });
    const res = mockRes();
    await creatorCtrl.updateProfile(req({
      body: { realName: '林晚晚', verified: true, status: 1, id: 'cr999' },
    }), res);

    expect(prisma.creator.update).toHaveBeenCalledWith({
      where: { id: 'cr1' },
      data: { realName: '林晚晚' },   // verified / status / id 不在白名單
      select: expect.anything(),
    });
    expect(res.body.data.realName).toBe('林晚晚');
  });

  test('updateProfile：nickname 存在 User 上，只改 nickname 時不動 Creator', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.user.update.mockResolvedValue({ id: 'u1' });
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', nickname: '新暱稱', coins: 1 });
    const res = mockRes();
    await creatorCtrl.updateProfile(req({ body: { nickname: '新暱稱' } }), res);
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { nickname: '新暱稱' } });
    expect(prisma.creator.update).not.toHaveBeenCalled();
    expect(res.body.data.nickname).toBe('新暱稱');
  });
});

// ---------------------------------------------------------------------------
describe('creatorController — getMyDramas', () => {
  test('還不是創作者回 404，且不查劇', async () => {
    prisma.creator.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await creatorCtrl.getMyDramas(req(), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.drama.findMany).not.toHaveBeenCalled();
  });

  test('成功：只查自己的劇、新到舊、BigInt/Decimal 轉 number', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findMany.mockResolvedValue([DRAMA_ROW]);
    const res = mockRes();
    await creatorCtrl.getMyDramas(req(), res);

    const arg = prisma.drama.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ creatorId: 'cr1' });       // 不是 body/query 給的 id
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.take).toBe(20);
    expect(arg.skip).toBe(0);

    expect(res.body.data.total).toBe(1);
    const card = res.body.data.list[0];
    expect(card.views).toBe(230000000);
    expect(typeof card.views).toBe('number');
    expect(card.rating).toBe(9.2);
    expect(typeof card.episodes).toBe('number');           // 前端印 `${episodes}集`
    expect(card.auditStatus).toBe('approved');
    expect(card.category).toBe('甜寵');
  });

  test('status / auditStatus 查詢參數才進 where，limit 夾在 1..50、page 換算 skip', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findMany.mockResolvedValue([]);
    await creatorCtrl.getMyDramas(req({ query: { status: '0', auditStatus: 'pending', limit: '999', page: '3' } }), mockRes());
    const arg = prisma.drama.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ creatorId: 'cr1', status: 0, auditStatus: 'pending' });
    expect(arg.take).toBe(50);
    expect(arg.skip).toBe(100);

    await creatorCtrl.getMyDramas(req({ query: { limit: '-5', status: 'bogus' } }), mockRes());
    const arg2 = prisma.drama.findMany.mock.calls[1][0];
    expect(arg2.take).toBe(1);
    expect(arg2.where).toEqual({ creatorId: 'cr1' });
  });

  test('Prisma 丟錯時回 500（錯誤路徑不會把例外噴出去）', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findMany.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await creatorCtrl.getMyDramas(req(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe(500);
    spy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
describe('creatorController — createDrama', () => {
  test('還不是創作者回 404，不建立', async () => {
    prisma.creator.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await creatorCtrl.createDrama(req({ body: { title: '新劇' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.drama.create).not.toHaveBeenCalled();
  });

  test('成功：掛在自己名下、auditStatus=pending、publishedAt=null', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.create.mockImplementation(({ data }) => Promise.resolve(Object.assign({}, DRAMA_ROW, data)));
    const res = mockRes();
    await creatorCtrl.createDrama(req({
      body: { title: ' 重生之復仇女王 ', desc: '前世被陷害', cover: 'c.jpg', isFree: false, pricePerEp: 30, totalEpisodes: 0 },
    }), res);

    const data = prisma.drama.create.mock.calls[0][0].data;
    expect(data.creatorId).toBe('cr1');
    expect(data.title).toBe('重生之復仇女王');
    expect(data.auditStatus).toBe('pending');
    expect(data.status).toBe(1);
    expect(data.publishedAt).toBeNull();
    expect(data.isFree).toBe(false);
    expect(data.pricePerEp).toBe(30);

    expect(res.body.code).toBe(200);
    expect(res.body.data.views).toBe(230000000);   // mock 回的 BigInt 已被轉型
    expect(typeof res.body.data.views).toBe('number');
  });

  test('沒有 title 回 400，不建立', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    const res = mockRes();
    await creatorCtrl.createDrama(req({ body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.drama.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('creatorController — updateDrama（只能動自己的劇）', () => {
  test('劇集不存在回 404', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await creatorCtrl.updateDrama(req({ params: { id: 'nope' }, body: { title: 'x' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.drama.update).not.toHaveBeenCalled();
  });

  test('不是自己的劇回 403，且不更新', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd9', creatorId: 'cr999', totalEpisodes: 1, auditStatus: 'approved' });
    const res = mockRes();
    await creatorCtrl.updateDrama(req({ params: { id: 'd9' }, body: { title: '偷改' } }), res);
    expect(res.statusCode).toBe(403);
    expect(prisma.drama.update).not.toHaveBeenCalled();
  });

  test('成功：只送白名單欄位，改不動 auditStatus / views / creatorId', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', creatorId: 'cr1', totalEpisodes: 3, auditStatus: 'approved' });
    prisma.drama.update.mockResolvedValue(DRAMA_ROW);
    const res = mockRes();
    await creatorCtrl.updateDrama(req({
      params: { id: 'd1' },
      body: { title: '新名字', auditStatus: 'approved', views: 999, creatorId: 'cr999', rating: 9.9 },
    }), res);

    expect(prisma.drama.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: { title: '新名字' },
      select: expect.anything(),
    });
    expect(res.body.data.views).toBe(230000000);
  });

  test('空 body 回 400，不做 no-op update', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', creatorId: 'cr1', totalEpisodes: 3, auditStatus: 'approved' });
    const res = mockRes();
    await creatorCtrl.updateDrama(req({ params: { id: 'd1' }, body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.drama.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('creatorController — addEpisode / deleteEpisode', () => {
  test('addEpisode：不是自己的劇回 403', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd9', creatorId: 'cr999', totalEpisodes: 0, auditStatus: 'pending' });
    const res = mockRes();
    await creatorCtrl.addEpisode(req({ params: { id: 'd9' }, body: { videoUrl: 'v.m3u8' } }), res);
    expect(res.statusCode).toBe(403);
    expect(prisma.episode.create).not.toHaveBeenCalled();
  });

  test('addEpisode：指定集數時建立，並把 Drama.totalEpisodes 往上調', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', creatorId: 'cr1', totalEpisodes: 3, auditStatus: 'approved' });
    prisma.episode.findUnique.mockResolvedValue(null);
    prisma.episode.create.mockImplementation(({ data }) => Promise.resolve(Object.assign({ id: 'e4' }, data)));
    prisma.drama.update.mockResolvedValue({});

    const res = mockRes();
    await creatorCtrl.addEpisode(req({ params: { id: 'd1' }, body: { episodeNumber: 4, title: '第4集', videoUrl: 'v.m3u8', duration: 90 } }), res);

    const data = prisma.episode.create.mock.calls[0][0].data;
    expect(data).toEqual({ dramaId: 'd1', episodeNumber: 4, videoUrl: 'v.m3u8', title: '第4集', duration: 90 });
    expect(prisma.drama.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { totalEpisodes: 4 } });
    expect(res.body.data.totalEpisodes).toBe(4);
    expect(res.body.data.id).toBe('e4');
  });

  test('addEpisode：沒給集數時接在最大集數後面（用 findFirst，不是 totalEpisodes）', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', creatorId: 'cr1', totalEpisodes: 2, auditStatus: 'approved' });
    prisma.episode.findFirst.mockResolvedValue({ episodeNumber: 7 });
    prisma.episode.findUnique.mockResolvedValue(null);
    prisma.episode.create.mockImplementation(({ data }) => Promise.resolve(Object.assign({ id: 'e8' }, data)));
    prisma.drama.update.mockResolvedValue({});

    await creatorCtrl.addEpisode(req({ params: { id: 'd1' }, body: { videoUrl: 'v.m3u8' } }), mockRes());

    expect(prisma.episode.findFirst.mock.calls[0][0].orderBy).toEqual({ episodeNumber: 'desc' });
    expect(prisma.episode.create.mock.calls[0][0].data.episodeNumber).toBe(8);
    expect(prisma.drama.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { totalEpisodes: 8 } });
  });

  test('addEpisode：集數重複回 409（不讓 P2002 變成 500）', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', creatorId: 'cr1', totalEpisodes: 3, auditStatus: 'approved' });
    prisma.episode.findUnique.mockResolvedValue({ id: 'e1' });
    const res = mockRes();
    await creatorCtrl.addEpisode(req({ params: { id: 'd1' }, body: { episodeNumber: 1, videoUrl: 'v.m3u8' } }), res);
    expect(res.statusCode).toBe(409);
    expect(prisma.episode.create).not.toHaveBeenCalled();
    expect(prisma.episode.findUnique.mock.calls[0][0].where).toEqual({
      dramaId_episodeNumber: { dramaId: 'd1', episodeNumber: 1 },
    });
  });

  test('addEpisode：集數沒有超過 totalEpisodes 時不重複更新（省一次寫入）', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', creatorId: 'cr1', totalEpisodes: 3, auditStatus: 'approved' });
    prisma.episode.findUnique.mockResolvedValue(null);
    prisma.episode.create.mockImplementation(({ data }) => Promise.resolve(Object.assign({ id: 'e2' }, data)));
    await creatorCtrl.addEpisode(req({ params: { id: 'd1' }, body: { episodeNumber: 2, videoUrl: 'v.m3u8' } }), mockRes());
    expect(prisma.drama.update).not.toHaveBeenCalled();
  });

  test('addEpisode：沒有 videoUrl 回 400（直接呼叫 controller 時也要擋）', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', creatorId: 'cr1', totalEpisodes: 0, auditStatus: 'pending' });
    const res = mockRes();
    await creatorCtrl.addEpisode(req({ params: { id: 'd1' }, body: {} }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.episode.create).not.toHaveBeenCalled();
  });

  test('deleteEpisode：不是自己的劇回 403', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd9', creatorId: 'cr999', totalEpisodes: 1, auditStatus: 'approved' });
    const res = mockRes();
    await creatorCtrl.deleteEpisode(req({ params: { dramaId: 'd9', episodeId: 'e1' } }), res);
    expect(res.statusCode).toBe(403);
    expect(prisma.episode.delete).not.toHaveBeenCalled();
  });

  test('deleteEpisode：集數不屬於這部劇 → 404，不刪', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', creatorId: 'cr1', totalEpisodes: 3, auditStatus: 'approved' });
    prisma.episode.findUnique.mockResolvedValue({ id: 'e1', dramaId: 'd2', episodeNumber: 1 });
    const res = mockRes();
    await creatorCtrl.deleteEpisode(req({ params: { dramaId: 'd1', episodeId: 'e1' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.episode.delete).not.toHaveBeenCalled();
  });

  test('deleteEpisode：成功刪除並把 totalEpisodes 遞減', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', creatorId: 'cr1', totalEpisodes: 3, auditStatus: 'approved' });
    prisma.episode.findUnique.mockResolvedValue({ id: 'e2', dramaId: 'd1', episodeNumber: 2 });
    prisma.episode.delete.mockResolvedValue({});
    prisma.drama.update.mockResolvedValue({});
    const res = mockRes();
    await creatorCtrl.deleteEpisode(req({ params: { dramaId: 'd1', episodeId: 'e2' } }), res);
    expect(prisma.episode.delete).toHaveBeenCalledWith({ where: { id: 'e2' } });
    expect(prisma.drama.update).toHaveBeenCalledWith({ where: { id: 'd1' }, data: { totalEpisodes: 2 } });
    expect(res.body.data.deleted).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('creatorController — getDashboard', () => {
  test('還不是創作者回 404', async () => {
    prisma.creator.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await creatorCtrl.getDashboard(req(), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.drama.findMany).not.toHaveBeenCalled();
  });

  test('成功：BigInt 加總轉 number、追蹤數用 count、本月收益只算本月', async () => {
    const now = new Date();
    const thisMonth = new Date(now.getFullYear(), now.getMonth(), 2);
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15);

    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findMany.mockResolvedValue([
      Object.assign({}, DRAMA_ROW, { id: 'd1', auditStatus: 'approved', totalEpisodes: 3, views: 230000000n, rating: { toNumber: () => 9.2 } }),
      Object.assign({}, DRAMA_ROW, { id: 'd2', auditStatus: 'pending', totalEpisodes: 2, views: 1000n, likes: 1, rating: { toNumber: () => 8.0 } }),
    ]);
    prisma.creatorFollow.count.mockResolvedValue(7);
    prisma.creatorEarning.findMany.mockResolvedValue([
      { amount: 100, createdAt: thisMonth },
      { amount: 50, createdAt: lastMonth },
    ]);

    const res = mockRes();
    await creatorCtrl.getDashboard(req(), res);

    const d = res.body.data;
    expect(d.totalDramas).toBe(2);
    expect(d.approvedDramas).toBe(1);
    expect(d.pendingDramas).toBe(1);
    expect(d.totalEpisodes).toBe(5);
    expect(d.totalViews).toBe(230001000);
    expect(typeof d.totalViews).toBe('number');
    expect(d.totalFollowers).toBe(7);
    expect(d.totalEarnings).toBe(150);
    expect(d.monthEarnings).toBe(100);
    expect(d.avgRating).toBe(8.6);
    expect(d.recentDramas).toHaveLength(2);
    expect(prisma.creatorFollow.count).toHaveBeenCalledWith({ where: { creatorId: 'cr1' } });
    expect(prisma.drama.findMany.mock.calls[0][0].where).toEqual({ creatorId: 'cr1' });
  });

  test('一部作品都沒有時統計是 0，不是 NaN', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.drama.findMany.mockResolvedValue([]);
    prisma.creatorFollow.count.mockResolvedValue(0);
    prisma.creatorEarning.findMany.mockResolvedValue([]);
    const res = mockRes();
    await creatorCtrl.getDashboard(req(), res);
    expect(res.body.data.totalViews).toBe(0);
    expect(res.body.data.avgRating).toBe(0);
    expect(res.body.data.recentDramas).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
describe('creatorController — getAuditLogs', () => {
  test('還不是創作者回 404', async () => {
    prisma.creator.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await creatorCtrl.getAuditLogs(req(), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.auditLog.findMany).not.toHaveBeenCalled();
  });

  test('成功：只查自己的審核紀錄，補上劇名', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.auditLog.findMany.mockResolvedValue([
      { id: 'a1', dramaId: 'd1', action: 'reject', reason: '封面不合規', createdAt: new Date(), drama: { id: 'd1', title: '霸道總裁愛上我', cover: 'c.jpg' } },
      { id: 'a2', dramaId: 'd1', action: 'submit', reason: null, createdAt: new Date(), drama: null },
    ]);
    const res = mockRes();
    await creatorCtrl.getAuditLogs(req(), res);

    const arg = prisma.auditLog.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ creatorId: 'cr1' });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(arg.take).toBe(20);
    expect(res.body.data.list[0].dramaTitle).toBe('霸道總裁愛上我');
    expect(res.body.data.list[1].dramaTitle).toBeNull();   // 劇被刪掉也不會爆
    expect(res.body.data.list[1].reason).toBeNull();
  });

  test('dramaId 查詢參數會進 where', async () => {
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    prisma.auditLog.findMany.mockResolvedValue([]);
    await creatorCtrl.getAuditLogs(req({ query: { dramaId: 'd1', limit: '5' } }), mockRes());
    const arg = prisma.auditLog.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ creatorId: 'cr1', dramaId: 'd1' });
    expect(arg.take).toBe(5);
  });
});

// ---------------------------------------------------------------------------
describe('creatorController — getPublicProfile（公開）', () => {
  test('創作者不存在回 404', async () => {
    prisma.creator.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await creatorCtrl.getPublicProfile(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.drama.findMany).not.toHaveBeenCalled();
  });

  test('成功：只列已上架且過審的劇，idCard 不外洩', async () => {
    prisma.creator.findUnique.mockResolvedValue(Object.assign({}, CREATOR_ROW, {
      user: { id: 'u1', nickname: '晚晚', avatar: 'a.jpg' },
    }));
    prisma.drama.findMany.mockResolvedValue([DRAMA_ROW]);
    prisma.creatorFollow.count.mockResolvedValue(12);

    const res = mockRes();
    await creatorCtrl.getPublicProfile(req({ params: { id: 'cr1' } }), res);

    const select = prisma.creator.findUnique.mock.calls[0][0].select;
    expect(select.idCard).toBeUndefined();
    expect(res.body.data.idCard).toBeUndefined();

    const arg = prisma.drama.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ creatorId: 'cr1', status: 1, auditStatus: 'approved' });
    expect(arg.orderBy).toEqual({ views: 'desc' });

    expect(res.body.data.name).toBe('晚晚');
    expect(res.body.data.totalDramas).toBe(1);
    expect(res.body.data.totalViews).toBe(230000000);
    expect(res.body.data.totalFollowers).toBe(12);
    expect(res.body.data.dramas[0].views).toBe(230000000);
  });

  test('沒有 user 關聯時 name 退回 realName', async () => {
    prisma.creator.findUnique.mockResolvedValue(Object.assign({}, CREATOR_ROW, { user: null }));
    prisma.drama.findMany.mockResolvedValue([]);
    prisma.creatorFollow.count.mockResolvedValue(0);
    const res = mockRes();
    await creatorCtrl.getPublicProfile(req({ params: { id: 'cr1' } }), res);
    expect(res.body.data.name).toBe('林晚');
  });
});

// ---------------------------------------------------------------------------
describe('creatorController — toggleFollow', () => {
  test('未登入回 401', async () => {
    const res = mockRes();
    await creatorCtrl.toggleFollow(req({ user: {}, params: { id: 'cr1' } }), res);
    expect(res.statusCode).toBe(401);
    expect(prisma.creatorFollow.create).not.toHaveBeenCalled();
  });

  test('創作者不存在回 404', async () => {
    prisma.creator.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await creatorCtrl.toggleFollow(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
  });

  test('不能追蹤自己回 400', async () => {
    prisma.creator.findUnique.mockResolvedValue({ id: 'cr1', userId: 'u1' });
    const res = mockRes();
    await creatorCtrl.toggleFollow(req({ params: { id: 'cr1' } }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.creatorFollow.create).not.toHaveBeenCalled();
  });

  test('未追蹤 → 建立；已追蹤 → 刪除（複合唯一鍵）', async () => {
    prisma.creator.findUnique.mockResolvedValue({ id: 'cr1', userId: 'u9' });
    prisma.creatorFollow.findUnique.mockResolvedValue(null);

    let res = mockRes();
    await creatorCtrl.toggleFollow(req({ params: { id: 'cr1' } }), res);
    expect(prisma.creatorFollow.findUnique.mock.calls[0][0].where).toEqual({
      userId_creatorId: { userId: 'u1', creatorId: 'cr1' },
    });
    expect(prisma.creatorFollow.create).toHaveBeenCalledWith({ data: { userId: 'u1', creatorId: 'cr1' } });
    expect(res.body.data).toEqual({ following: true, creatorId: 'cr1' });

    prisma.creatorFollow.findUnique.mockResolvedValue({ id: 'cf1' });
    res = mockRes();
    await creatorCtrl.toggleFollow(req({ params: { id: 'cr1' } }), res);
    expect(prisma.creatorFollow.delete).toHaveBeenCalledWith({ where: { id: 'cf1' } });
    expect(res.body.data).toEqual({ following: false, creatorId: 'cr1' });
  });
});

// ---------------------------------------------------------------------------
describe('creatorController — routes/creators.js 的 apply / withdraw', () => {
  test('withdraw 沒有提現模型 → 501（不編假的餘額）', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    prisma.creator.findUnique.mockResolvedValue(CREATOR_ROW);
    const res = mockRes();
    await creatorCtrl.withdraw(req(), res);
    expect(res.statusCode).toBe(501);
    spy.mockRestore();
  });
});
