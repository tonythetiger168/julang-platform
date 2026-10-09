/* ===== v7.6 測試：贈送影片（會員送給好友免費看）=====
 *
 * 契約（api/controllers/giftController.js 檔頭有完整說明）：
 *   POST /gifts           會員（**觀眾方案**）才能產生贈送碼；整齣免費或沒有付費集的劇
 *                         不發券（400）；每人每日上限 5 組（超過 429）
 *   GET  /gifts/mine      我送出的碼與狀態
 *   GET  /gifts/:code     領取前預覽（不改狀態）
 *   POST /gifts/:code/claim
 *                         領取 → 寫入 **UnlockedEpisode(cost:0)**（同一條付費牆）＋
 *                         把碼標成已領取；單次領取靠**條件式 updateMany**（不是先查再寫）；
 *                         自己送的自不能領（400）／已領（409）／過期（410）
 *
 * 一樣用 mocked Prisma 驗「邏輯、回應形狀、真的傳給 Prisma 的參數」；SQL 與真併發
 * 由 _julang-analysis/pg/gift-verify.js（真 Postgres）負責。
 */
jest.mock('../api/utils/prisma', () => ({
  subscription: { findUnique: jest.fn() },
  drama: { findUnique: jest.fn() },
  dramaGift: { count: jest.fn(), create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn() },
  unlockedEpisode: { createMany: jest.fn() },
  $transaction: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const prisma = require('../api/utils/prisma');
const ctrl = require('../api/controllers/giftController');
const auth = require('../api/middleware/auth');

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

// 10 集：1–5 免費、6–10 需要解鎖（與 dramaController 的 FREE_EPISODES = 5 一致）
const DRAMA = {
  id: 'd1',
  title: '我在盛唐写天下',
  isFree: false,
  episodes: Array.from({ length: 10 }, (_, i) => ({ id: 'e' + (i + 1), episodeNumber: i + 1 })),
};
const PAID_IDS = ['e6', 'e7', 'e8', 'e9', 'e10'];

let tx;
beforeEach(() => {
  jest.clearAllMocks();
  prisma.drama.findUnique.mockResolvedValue(DRAMA);
  prisma.dramaGift.count.mockResolvedValue(0);
  prisma.dramaGift.create.mockImplementation(({ data }) =>
    Promise.resolve(Object.assign({ id: 'g1', claimedAt: null }, data)));
  tx = {
    dramaGift: { updateMany: jest.fn().mockResolvedValue({ count: 1 }), update: jest.fn().mockResolvedValue({}) },
    unlockedEpisode: { createMany: jest.fn().mockResolvedValue({ count: 5 }) },
  };
  prisma.$transaction.mockImplementation((fn) => {
    if (typeof fn !== 'function') throw new Error('claimGift 必須使用互動式 $transaction');
    return fn(tx);
  });
});

const setMember = (plan = 'viewer_weekly') =>
  prisma.subscription.findUnique.mockResolvedValue({ plan, status: 'active', expiresAt: null });
const setNoSub = () => prisma.subscription.findUnique.mockResolvedValue(null);
const setExpired = (plan = 'viewer_weekly') =>
  prisma.subscription.findUnique.mockResolvedValue({ plan, status: 'expired', expiresAt: null });

// ---------------------------------------------------------------------------
describe('routes/gifts — 掛載與未登入 401', () => {
  const layerOf = (method, path) => {
    const router = require('../api/routes/gifts');
    const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
    expect(layer).toBeTruthy();
    return layer.route.stack.map((s) => s.handle);
  };

  test('POST / 是 [auth, ctrl.createGift]', () => {
    const h = layerOf('post', '/');
    expect(h).toHaveLength(2);
    expect(h[0]).toBe(auth);
    expect(h[1]).toBe(ctrl.createGift);
  });

  test('GET /mine 是 [auth, ctrl.myGifts]', () => {
    const h = layerOf('get', '/mine');
    expect(h[0]).toBe(auth);
    expect(h[1]).toBe(ctrl.myGifts);
  });

  test('GET /:code 是 [auth, ctrl.previewGift]', () => {
    const h = layerOf('get', '/:code');
    expect(h[0]).toBe(auth);
    expect(h[1]).toBe(ctrl.previewGift);
  });

  test('POST /:code/claim 是 [auth, ctrl.claimGift]', () => {
    const h = layerOf('post', '/:code/claim');
    expect(h[0]).toBe(auth);
    expect(h[1]).toBe(ctrl.claimGift);
  });

  test('/mine 掛在 /:code 之前（否則會被當成一個 code）', () => {
    const paths = require('../api/routes/gifts').stack.filter((l) => l.route).map((l) => l.route.path);
    expect(paths.indexOf('/mine')).toBeLessThan(paths.indexOf('/:code'));
  });

  test('未登入（沒有 token）→ 401，且完全不碰資料庫', () => {
    const res = mockRes();
    const next = jest.fn();
    layerOf('post', '/')[0](req({ body: { dramaId: 'd1' } }), res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(prisma.dramaGift.create).not.toHaveBeenCalled();
  });

  test('有效 token → auth 放行並把 userId 放進 req.user', () => {
    const token = jwt.sign({ userId: 'u1' }, JWT_SECRET);
    const r = req({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = jest.fn();
    layerOf('post', '/')[0](r, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(r.user.userId).toBe('u1');
  });
});

// ---------------------------------------------------------------------------
describe('createGift — 會員產生贈送碼', () => {
  test('非會員 → 403，且不建立任何碼', async () => {
    setNoSub();
    const res = mockRes();
    await ctrl.createGift(loggedIn({ body: { dramaId: 'd1' } }), res);
    expect(res.statusCode).toBe(403);
    expect(prisma.dramaGift.create).not.toHaveBeenCalled();
  });

  test('訂閱過期 → 403', async () => {
    setExpired();
    const res = mockRes();
    await ctrl.createGift(loggedIn({ body: { dramaId: 'd1' } }), res);
    expect(res.statusCode).toBe(403);
  });

  test('只有創作者工具方案（weekly）不算會員 → 403（只認觀眾方案）', async () => {
    setMember('weekly');
    const res = mockRes();
    await ctrl.createGift(loggedIn({ body: { dramaId: 'd1' } }), res);
    expect(res.statusCode).toBe(403);
    expect(prisma.dramaGift.create).not.toHaveBeenCalled();
  });

  test('缺 dramaId → 400', async () => {
    setMember();
    const res = mockRes();
    await ctrl.createGift(loggedIn({ body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  test('找不到劇 → 404', async () => {
    setMember();
    prisma.drama.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await ctrl.createGift(loggedIn({ body: { dramaId: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
  });

  test('整齣免費的劇 → 400（不發一張什麼都解不開的空券）', async () => {
    setMember();
    prisma.drama.findUnique.mockResolvedValue(Object.assign({}, DRAMA, { isFree: true }));
    const res = mockRes();
    await ctrl.createGift(loggedIn({ body: { dramaId: 'd1' } }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.dramaGift.create).not.toHaveBeenCalled();
  });

  test('全部集數都在免費額度內 → 400', async () => {
    setMember();
    prisma.drama.findUnique.mockResolvedValue(Object.assign({}, DRAMA, {
      episodes: [{ id: 'e1', episodeNumber: 1 }, { id: 'e5', episodeNumber: 5 }],
    }));
    const res = mockRes();
    await ctrl.createGift(loggedIn({ body: { dramaId: 'd1' } }), res);
    expect(res.statusCode).toBe(400);
  });

  test('成功 → 200，回傳真實的付費集數與分享路徑', async () => {
    setMember();
    const res = mockRes();
    await ctrl.createGift(loggedIn({ body: { dramaId: 'd1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.dramaId).toBe('d1');
    expect(res.body.data.episodes).toBe(5);                       // 6–10 集
    expect(res.body.data.sharePath).toBe('/#gift=' + res.body.data.code);
    expect(res.body.data.expiresAt instanceof Date).toBe(true);
  });

  test('傳給 Prisma 的參數：senderId 是登入者，且帶 expiresAt', async () => {
    setMember();
    await ctrl.createGift(loggedIn({ body: { dramaId: 'd1' } }), mockRes());
    const data = prisma.dramaGift.create.mock.calls[0][0].data;
    expect(data.senderId).toBe('u1');
    expect(data.dramaId).toBe('d1');
    expect(data.expiresAt instanceof Date).toBe(true);
    expect(data.code).toMatch(new RegExp('^[' + ctrl.CODE_ALPHABET + ']{' + ctrl.CODE_LENGTH + '}$'));
  });

  test('每次產生的碼不同（crypto 隨機，不是固定字串）', async () => {
    setMember();
    const seen = new Set();
    for (let i = 0; i < 30; i++) {
      const res = mockRes();
      await ctrl.createGift(loggedIn({ body: { dramaId: 'd1' } }), res);
      seen.add(res.body.data.code);
    }
    expect(seen.size).toBeGreaterThan(25);   // 允許極少數碰撞，但不可以是常數
  });

  test('每日上限 → 429', async () => {
    setMember();
    prisma.dramaGift.count.mockResolvedValue(ctrl.MAX_GIFTS_PER_DAY);
    const res = mockRes();
    await ctrl.createGift(loggedIn({ body: { dramaId: 'd1' } }), res);
    expect(res.statusCode).toBe(429);
    expect(prisma.dramaGift.create).not.toHaveBeenCalled();
  });

  test('碼撞唯一鍵（P2002）會重試，不會變成 500', async () => {
    setMember();
    const dup = Object.assign(new Error('unique'), { code: 'P2002' });
    prisma.dramaGift.create
      .mockRejectedValueOnce(dup)
      .mockImplementationOnce(({ data }) => Promise.resolve(Object.assign({ id: 'g2' }, data)));
    const res = mockRes();
    await ctrl.createGift(loggedIn({ body: { dramaId: 'd1' } }), res);
    expect(res.statusCode).toBe(200);
    expect(prisma.dramaGift.create).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
describe('claimGift — 領取（單次、原子）', () => {
  const giftRow = (over = {}) => Object.assign({
    id: 'g1', senderId: 'u2', claimedById: null,
    expiresAt: new Date(Date.now() + 86400000), dramaId: 'd1',
  }, over);

  test('格式不正確 → 400（連查都不查）', async () => {
    const res = mockRes();
    await ctrl.claimGift(loggedIn({ params: { code: 'a!' } }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.dramaGift.findUnique).not.toHaveBeenCalled();
  });

  test('找不到 → 404', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await ctrl.claimGift(loggedIn({ params: { code: 'ZZZZ9999' } }), res);
    expect(res.statusCode).toBe(404);
  });

  test('不能領自己送出的 → 400', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue(giftRow({ senderId: 'u1' }));
    const res = mockRes();
    await ctrl.claimGift(loggedIn({ params: { code: 'ABCD2345' } }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('已被領取 → 409', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue(giftRow({ claimedById: 'u9' }));
    const res = mockRes();
    await ctrl.claimGift(loggedIn({ params: { code: 'ABCD2345' } }), res);
    expect(res.statusCode).toBe(409);
  });

  test('已過期 → 410', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue(giftRow({ expiresAt: new Date(Date.now() - 1000) }));
    const res = mockRes();
    await ctrl.claimGift(loggedIn({ params: { code: 'ABCD2345' } }), res);
    expect(res.statusCode).toBe(410);
  });

  test('成功 → 解鎖付費集（cost:0、skipDuplicates）並回報集數', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue(giftRow());
    const res = mockRes();
    await ctrl.claimGift(loggedIn({ params: { code: 'abcd2345' } }), res);   // 小寫也要能領
    expect(res.statusCode).toBe(200);
    expect(res.body.data.episodesGranted).toBe(5);
    expect(res.body.data.episodesTotal).toBe(5);
  });

  test('寫入的解鎖紀錄只包含「需要解鎖」的集數，且 cost 為 0', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue(giftRow());
    await ctrl.claimGift(loggedIn({ params: { code: 'ABCD2345' } }), mockRes());
    const arg = tx.unlockedEpisode.createMany.mock.calls[0][0];
    expect(arg.skipDuplicates).toBe(true);
    expect(arg.data.map((d) => d.episodeId)).toEqual(PAID_IDS);
    expect(arg.data.every((d) => d.cost === 0)).toBe(true);
    expect(arg.data.every((d) => d.userId === 'u1' && d.dramaId === 'd1')).toBe(true);
  });

  test('單次領取是條件式 updateMany（claimedById:null + 未過期），不是先查再寫', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue(giftRow());
    await ctrl.claimGift(loggedIn({ params: { code: 'ABCD2345' } }), mockRes());
    const arg = tx.dramaGift.updateMany.mock.calls[0][0];
    expect(arg.where.code).toBe('ABCD2345');
    expect(arg.where.claimedById).toBe(null);
    expect(arg.where.expiresAt.gt instanceof Date).toBe(true);
    expect(arg.data.claimedById).toBe('u1');
    expect(arg.data.claimedAt instanceof Date).toBe(true);
  });

  test('並發下輸掉的那個請求 → 409，而且不寫任何解鎖紀錄', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue(giftRow());
    tx.dramaGift.updateMany.mockResolvedValue({ count: 0 });
    const res = mockRes();
    await ctrl.claimGift(loggedIn({ params: { code: 'ABCD2345' } }), res);
    expect(res.statusCode).toBe(409);
    expect(tx.unlockedEpisode.createMany).not.toHaveBeenCalled();
  });

  test('領取與寫入解鎖紀錄包在同一個互動式 $transaction 內', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue(giftRow());
    await ctrl.claimGift(loggedIn({ params: { code: 'ABCD2345' } }), mockRes());
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof prisma.$transaction.mock.calls[0][0]).toBe('function');
    expect(prisma.unlockedEpisode.createMany).not.toHaveBeenCalled();   // 走 tx，不繞過交易
  });

  test('把實際解鎖集數寫回 gift.episodesGranted', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue(giftRow());
    tx.unlockedEpisode.createMany.mockResolvedValue({ count: 3 });   // 其中 2 集本來就解鎖過
    await ctrl.claimGift(loggedIn({ params: { code: 'ABCD2345' } }), mockRes());
    expect(tx.dramaGift.update).toHaveBeenCalledWith({ where: { id: 'g1' }, data: { episodesGranted: 3 } });
  });
});

// ---------------------------------------------------------------------------
describe('previewGift / myGifts', () => {
  test('預覽：已領取 → claimable:false、claimed:true', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue({
      code: 'ABCD2345', expiresAt: new Date(Date.now() + 1000), claimedAt: new Date(),
      sender: { nickname: '小明' }, drama: { id: 'd1', title: 'T', cover: 'c', totalEpisodes: 10 },
    });
    const res = mockRes();
    await ctrl.previewGift(loggedIn({ params: { code: 'ABCD2345' } }), res);
    expect(res.body.data.claimable).toBe(false);
    expect(res.body.data.claimed).toBe(true);
    expect(res.body.data.from).toBe('小明');
  });

  test('預覽：過期 → expired:true、claimable:false', async () => {
    prisma.dramaGift.findUnique.mockResolvedValue({
      code: 'ABCD2345', expiresAt: new Date(Date.now() - 1000), claimedAt: null,
      sender: { nickname: '小明' }, drama: { id: 'd1', title: 'T', cover: 'c', totalEpisodes: 10 },
    });
    const res = mockRes();
    await ctrl.previewGift(loggedIn({ params: { code: 'ABCD2345' } }), res);
    expect(res.body.data.expired).toBe(true);
    expect(res.body.data.claimable).toBe(false);
  });

  test('myGifts：claimed/expired 由 DB 的值算出來', async () => {
    const future = new Date(Date.now() + 86400000);
    const past = new Date(Date.now() - 86400000);
    prisma.dramaGift.findMany.mockResolvedValue([
      { code: 'AAA', createdAt: past, expiresAt: future, claimedAt: new Date(), episodesGranted: 5, drama: { id: 'd1', title: 'T' } },
      { code: 'BBB', createdAt: past, expiresAt: past, claimedAt: null, episodesGranted: 0, drama: { id: 'd2', title: 'U' } },
    ]);
    const res = mockRes();
    await ctrl.myGifts(loggedIn(), res);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0]).toMatchObject({ code: 'AAA', claimed: true, expired: false, dramaTitle: 'T' });
    expect(res.body.data[1]).toMatchObject({ code: 'BBB', claimed: false, expired: true });
    expect(prisma.dramaGift.findMany.mock.calls[0][0].where).toEqual({ senderId: 'u1' });
  });
});
