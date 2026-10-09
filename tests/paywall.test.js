/* ===== v7.3 測試：付費牆（免費集判定 / 解鎖狀態 / 廣告解鎖 / optionalAuth）=====
 *
 * 契約（前端 player.js 已按此實作，凍結）：
 *   GET /dramas/:id            每集帶 free / unlocked / locked / cost，locked 時 videoUrl=null，頂層 freeEpisodes
 *   GET /dramas/:id/episodes   同上 + optionalAuth
 *   POST /ads/watch            body 可選 { dramaId, episodeId }：不帶=領幣（行為不變），帶了=解鎖不發幣
 *
 * 一樣用 mocked Prisma 驗「邏輯與查詢參數」，不驗 SQL（真 DB 驗證在專案外的腳本跑）。
 */
// routes/drama.js 會 require middleware/cache -> config/redis。真 client 連不上時會
// 無限重試（open handle），Jest 永遠不退出，所以這裡一定要注入「未連線」狀態
// （跟 middleware.test.js 一樣的形狀）。
jest.mock('../api/config/redis', () => ({ isReady: false, get: jest.fn(), setEx: jest.fn() }));

jest.mock('../api/utils/prisma', () => ({
  drama: { findUnique: jest.fn() },
  episode: { findUnique: jest.fn(), findMany: jest.fn() },
  unlockedEpisode: { findUnique: jest.fn(), findMany: jest.fn(), upsert: jest.fn() },
  adWatchLog: { count: jest.fn(), findFirst: jest.fn(), create: jest.fn() },
  user: { findUnique: jest.fn(), update: jest.fn() },
  coinTransaction: { create: jest.fn() },
  $transaction: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const prisma = require('../api/utils/prisma');
const dramaCtrl = require('../api/controllers/dramaController');
const adCtrl = require('../api/controllers/adController');
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
// 注意：預設**未登入**（沒有 user），跟 controllers.test.js 的預設相反 —— 付費牆最該驗的就是未登入
const req = (extra = {}) => Object.assign({ query: {}, params: {}, body: {}, headers: {} }, extra);
const loggedIn = (extra = {}) => req(Object.assign({ user: { userId: 'u1' } }, extra));

const ep = (n, dramaId = 'd1') => ({
  id: `e${n}`, episodeNumber: n, title: `第${n}集`,
  videoUrl: `https://cdn.example/${n}.m3u8`, duration: 60, dramaId,
});

const PAID_DRAMA = {
  id: 'd1', title: '付費劇', desc: null, cover: null, totalEpisodes: 8,
  isFree: false, pricePerEp: 8,
  views: 10n, likes: 0, rating: { toNumber: () => 8.5 }, createdAt: new Date('2026-01-01'),
  category: null,
  episodes: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ep(n)),
};
const FREE_DRAMA = Object.assign({}, PAID_DRAMA, {
  id: 'd2', title: '免費劇', isFree: true, pricePerEp: 0, episodes: [1, 2, 3].map((n) => ep(n, 'd2')),
});

beforeEach(() => {
  jest.clearAllMocks();
  prisma.unlockedEpisode.findMany.mockResolvedValue([]);
  prisma.unlockedEpisode.findUnique.mockResolvedValue(null);
  prisma.unlockedEpisode.upsert.mockResolvedValue({});
  prisma.adWatchLog.count.mockResolvedValue(0);
  prisma.adWatchLog.findFirst.mockResolvedValue(null);
  prisma.adWatchLog.create.mockResolvedValue({});
  prisma.user.update.mockResolvedValue({});
  prisma.coinTransaction.create.mockResolvedValue({});
  prisma.$transaction.mockResolvedValue([]);
});

// ===========================================================================
describe('FREE_EPISODES — 只能有一份定義', () => {
  test('dramaController 匯出 5，且判定邏輯就用這一份', () => {
    expect(dramaCtrl.FREE_EPISODES).toBe(5);
    expect(dramaCtrl._isFreeEpisode(false, { episodeNumber: 5 })).toBe(true);
    expect(dramaCtrl._isFreeEpisode(false, { episodeNumber: 6 })).toBe(false);
    expect(dramaCtrl._isFreeEpisode(true, { episodeNumber: 999 })).toBe(true);
  });
});

// ===========================================================================
describe('GET /dramas/:id — 付費牆欄位', () => {
  test('付費劇 + 未登入：前 5 集免費，第 6 集 locked 且 videoUrl 為 null', async () => {
    prisma.drama.findUnique.mockResolvedValue(PAID_DRAMA);
    const res = mockRes();
    await dramaCtrl.getDrama(req({ params: { id: 'd1' } }), res);

    expect(res.body.code).toBe(200);
    expect(res.body.data.freeEpisodes).toBe(5);
    const eps = res.body.data.episodes;
    expect(eps).toHaveLength(8);

    // 免費集
    expect(eps[0]).toMatchObject({ free: true, unlocked: true, locked: false, cost: 0 });
    expect(eps[4]).toMatchObject({ episodeNumber: 5, free: true, unlocked: true, locked: false, cost: 0 });
    expect(eps[4].videoUrl).toBe('https://cdn.example/5.m3u8');

    // 鎖住的集數：不交出播放位址
    for (const e of eps.slice(5)) {
      expect(e.free).toBe(false);
      expect(e.unlocked).toBe(false);
      expect(e.locked).toBe(true);
      expect(e.cost).toBe(8);
      expect(e.videoUrl).toBeNull();
    }

    // 未登入時不該去查解鎖記錄
    expect(prisma.unlockedEpisode.findMany).not.toHaveBeenCalled();
  });

  test('付費劇 + 已登入且 DB 有解鎖記錄：該集變 unlocked 並拿回 videoUrl', async () => {
    prisma.drama.findUnique.mockResolvedValue(PAID_DRAMA);
    prisma.unlockedEpisode.findMany.mockResolvedValue([{ episodeId: 'e6' }]);
    const res = mockRes();
    await dramaCtrl.getDrama(loggedIn({ params: { id: 'd1' } }), res);

    const arg = prisma.unlockedEpisode.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 'u1', dramaId: 'd1' });

    const e6 = res.body.data.episodes[5];
    expect(e6).toMatchObject({ id: 'e6', free: false, unlocked: true, locked: false, cost: 8 });
    expect(e6.videoUrl).toBe('https://cdn.example/6.m3u8');
    // 沒解鎖的還是鎖著
    expect(res.body.data.episodes[6].locked).toBe(true);
    expect(res.body.data.episodes[6].videoUrl).toBeNull();
  });

  test('整齣免費（isFree）時全部解鎖，且不必查 UnlockedEpisode', async () => {
    prisma.drama.findUnique.mockResolvedValue(FREE_DRAMA);
    const res = mockRes();
    await dramaCtrl.getDrama(loggedIn({ params: { id: 'd2' } }), res);

    for (const e of res.body.data.episodes) {
      expect(e).toMatchObject({ free: true, unlocked: true, locked: false, cost: 0 });
      expect(e.videoUrl).not.toBeNull();
    }
    expect(prisma.unlockedEpisode.findMany).not.toHaveBeenCalled();
  });

  test('不存在的劇回 404，不查集數', async () => {
    prisma.drama.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await dramaCtrl.getDrama(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.unlockedEpisode.findMany).not.toHaveBeenCalled();
  });

  test('解鎖查詢失敗時 fail-closed（回 locked，不會 500 也不會誤放行）', async () => {
    prisma.drama.findUnique.mockResolvedValue(PAID_DRAMA);
    prisma.unlockedEpisode.findMany.mockRejectedValue(new Error('db down'));
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = mockRes();
    await dramaCtrl.getDrama(loggedIn({ params: { id: 'd1' } }), res);
    spy.mockRestore();

    expect(res.body.code).toBe(200);
    expect(res.body.data.episodes[5].locked).toBe(true);
    expect(res.body.data.episodes[5].videoUrl).toBeNull();
  });
});

// ===========================================================================
describe('GET /dramas/:id/episodes — 同樣的每集欄位', () => {
  test('未登入：回 freeEpisodes，鎖住的集數沒有 videoUrl', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', isFree: false, pricePerEp: 8, totalEpisodes: 8 });
    prisma.episode.findMany.mockResolvedValue(PAID_DRAMA.episodes);
    const res = mockRes();
    await dramaCtrl.getEpisodes(req({ params: { id: 'd1' } }), res);

    expect(res.body.data.freeEpisodes).toBe(5);
    expect(res.body.data.dramaId).toBe('d1');
    expect(res.body.data.total).toBe(8);
    expect(res.body.data.list[4]).toMatchObject({ free: true, unlocked: true, locked: false, cost: 0 });
    expect(res.body.data.list[5]).toMatchObject({ locked: true, cost: 8, videoUrl: null });
    expect(prisma.unlockedEpisode.findMany).not.toHaveBeenCalled();
  });

  test('已登入：DB 有記錄的集數變 unlocked 且帶回 videoUrl', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', isFree: false, pricePerEp: 8, totalEpisodes: 8 });
    prisma.episode.findMany.mockResolvedValue(PAID_DRAMA.episodes);
    prisma.unlockedEpisode.findMany.mockResolvedValue([{ episodeId: 'e7' }]);
    const res = mockRes();
    await dramaCtrl.getEpisodes(loggedIn({ params: { id: 'd1' } }), res);

    const e7 = res.body.data.list[6];
    expect(e7).toMatchObject({ unlocked: true, locked: false });
    expect(e7.videoUrl).toBe('https://cdn.example/7.m3u8');
    expect(res.body.data.list[5].locked).toBe(true);
  });

  test('劇不存在回 404', async () => {
    prisma.drama.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await dramaCtrl.getEpisodes(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.episode.findMany).not.toHaveBeenCalled();
  });
});

// ===========================================================================
describe('POST /ads/watch — 領幣模式（不帶 dramaId/episodeId，行為必須不變）', () => {
  test('寫 AdWatchLog(reward=2) + 加幣 + CoinTransaction(type=ad)，回 {coins, remaining}', async () => {
    prisma.adWatchLog.count.mockResolvedValue(3);
    const res = mockRes();
    await adCtrl.watchAd(loggedIn(), res);

    expect(res.body.code).toBe(200);
    expect(res.body.data).toEqual({ coins: 2, remaining: 11 });
    expect(prisma.adWatchLog.create).toHaveBeenCalledWith({ data: { userId: 'u1', reward: 2 } });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { coins: { increment: 2 } } });
    expect(prisma.coinTransaction.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'ad', amount: 2, description: '觀看激勵廣告' },
    });
    // 領幣模式的 transaction 是 3 個操作
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(3);
    expect(prisma.unlockedEpisode.upsert).not.toHaveBeenCalled();
  });
});

// ===========================================================================
describe('POST /ads/watch — 廣告解鎖模式', () => {
  const paidEpisode = { id: 'e6', dramaId: 'd1', episodeNumber: 6 };

  test('寫 AdWatchLog(reward=0) + upsert UnlockedEpisode(cost=0)，且不發幣', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', isFree: false });
    prisma.episode.findUnique.mockResolvedValue(paidEpisode);
    const res = mockRes();
    await adCtrl.watchAd(loggedIn({ body: { dramaId: 'd1', episodeId: 'e6' } }), res);

    expect(res.body.data).toEqual({ unlocked: true, episodeId: 'e6', method: 'ad', remaining: 14 });
    expect(prisma.adWatchLog.create).toHaveBeenCalledWith({ data: { userId: 'u1', reward: 0 } });
    expect(prisma.unlockedEpisode.upsert).toHaveBeenCalledWith({
      where: { userId_dramaId_episodeId: { userId: 'u1', dramaId: 'd1', episodeId: 'e6' } },
      update: { cost: 0 },
      create: { userId: 'u1', dramaId: 'd1', episodeId: 'e6', cost: 0 },
    });
    // 關鍵：不給 coins
    expect(prisma.user.update).not.toHaveBeenCalled();
    expect(prisma.coinTransaction.create).not.toHaveBeenCalled();
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
  });

  test('免費集（<= 5）→ {unlocked:true, free:true}，不寫紀錄、不佔次數', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', isFree: false });
    prisma.episode.findUnique.mockResolvedValue({ id: 'e3', dramaId: 'd1', episodeNumber: 3 });
    const res = mockRes();
    await adCtrl.watchAd(loggedIn({ body: { dramaId: 'd1', episodeId: 'e3' } }), res);

    expect(res.body.data).toEqual({ unlocked: true, free: true });
    expect(prisma.adWatchLog.create).not.toHaveBeenCalled();
    expect(prisma.adWatchLog.count).not.toHaveBeenCalled();
    expect(prisma.unlockedEpisode.upsert).not.toHaveBeenCalled();
  });

  test('整齣 isFree 的劇也算免費集', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd2', isFree: true });
    prisma.episode.findUnique.mockResolvedValue({ id: 'e99', dramaId: 'd2', episodeNumber: 99 });
    const res = mockRes();
    await adCtrl.watchAd(loggedIn({ body: { dramaId: 'd2', episodeId: 'e99' } }), res);
    expect(res.body.data).toEqual({ unlocked: true, free: true });
    expect(prisma.adWatchLog.create).not.toHaveBeenCalled();
  });

  test('重複解鎖 → alreadyUnlocked，且不重複計廣告次數、不寫第二筆', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', isFree: false });
    prisma.episode.findUnique.mockResolvedValue(paidEpisode);
    prisma.unlockedEpisode.findUnique.mockResolvedValue({ id: 'ue1' });
    const res = mockRes();
    await adCtrl.watchAd(loggedIn({ body: { dramaId: 'd1', episodeId: 'e6' } }), res);

    expect(res.body.data).toEqual({ unlocked: true, alreadyUnlocked: true });
    expect(prisma.adWatchLog.create).not.toHaveBeenCalled();
    expect(prisma.adWatchLog.count).not.toHaveBeenCalled(); // 沒被計次
    expect(prisma.unlockedEpisode.upsert).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('episode 不屬於該 drama → 404，不寫任何紀錄', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', isFree: false });
    prisma.episode.findUnique.mockResolvedValue({ id: 'e9', dramaId: 'OTHER', episodeNumber: 9 });
    const res = mockRes();
    await adCtrl.watchAd(loggedIn({ body: { dramaId: 'd1', episodeId: 'e9' } }), res);

    expect(res.statusCode).toBe(404);
    expect(prisma.adWatchLog.create).not.toHaveBeenCalled();
    expect(prisma.unlockedEpisode.upsert).not.toHaveBeenCalled();
  });

  test('episode 不存在 → 404', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', isFree: false });
    prisma.episode.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await adCtrl.watchAd(loggedIn({ body: { dramaId: 'd1', episodeId: 'ghost' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('只帶一半參數 → 400（不可默默發幣）', async () => {
    let res = mockRes();
    await adCtrl.watchAd(loggedIn({ body: { episodeId: 'e6' } }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();

    res = mockRes();
    await adCtrl.watchAd(loggedIn({ body: { dramaId: 'd1' } }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ===========================================================================
describe('POST /ads/watch — 反濫用對兩種模式都生效', () => {
  test('每日上限：領幣模式 429', async () => {
    prisma.adWatchLog.count.mockResolvedValue(15);
    const res = mockRes();
    await adCtrl.watchAd(loggedIn(), res);
    expect(res.statusCode).toBe(429);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('每日上限：解鎖模式一樣 429（且未解鎖）', async () => {
    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', isFree: false });
    prisma.episode.findUnique.mockResolvedValue({ id: 'e6', dramaId: 'd1', episodeNumber: 6 });
    prisma.adWatchLog.count.mockResolvedValue(15);
    const res = mockRes();
    await adCtrl.watchAd(loggedIn({ body: { dramaId: 'd1', episodeId: 'e6' } }), res);

    expect(res.statusCode).toBe(429);
    expect(prisma.unlockedEpisode.upsert).not.toHaveBeenCalled();
    expect(prisma.adWatchLog.create).not.toHaveBeenCalled();
  });

  test('最短間隔：剛看完就再要一次 → 429（兩種模式皆然）', async () => {
    prisma.adWatchLog.findFirst.mockResolvedValue({ createdAt: new Date() });
    let res = mockRes();
    await adCtrl.watchAd(loggedIn(), res);
    expect(res.statusCode).toBe(429);

    prisma.drama.findUnique.mockResolvedValue({ id: 'd1', isFree: false });
    prisma.episode.findUnique.mockResolvedValue({ id: 'e6', dramaId: 'd1', episodeNumber: 6 });
    res = mockRes();
    await adCtrl.watchAd(loggedIn({ body: { dramaId: 'd1', episodeId: 'e6' } }), res);
    expect(res.statusCode).toBe(429);
    expect(prisma.unlockedEpisode.upsert).not.toHaveBeenCalled();
  });

  test('間隔已過 → 放行（回歸保護：不要連正常觀看都擋）', async () => {
    prisma.adWatchLog.findFirst.mockResolvedValue({ createdAt: new Date(Date.now() - 60 * 1000) });
    const res = mockRes();
    await adCtrl.watchAd(loggedIn(), res);
    expect(res.body.code).toBe(200);
    expect(res.body.data.coins).toBe(2);
  });
});

// ===========================================================================
describe('middleware/optionalAuth', () => {
  const call = (headers) => {
    const r = req({ headers });
    const res = mockRes();
    const next = jest.fn();
    optionalAuth(r, res, next);
    return { r, res, next };
  };

  test('預設匯出與具名匯出是同一個函式', () => {
    expect(typeof optionalAuth).toBe('function');
    expect(optionalAuth.optionalAuth).toBe(optionalAuth);
  });

  test('合法 token → req.user 恰好是 { userId }（不多帶 iat/exp）', () => {
    const token = jwt.sign({ userId: 'u1' }, JWT_SECRET, { expiresIn: '1h' });
    const { r, next } = call({ authorization: `Bearer ${token}` });
    expect(r.user).toEqual({ userId: 'u1' });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0]).toHaveLength(0); // 沒有傳錯誤下去
  });

  test('沒有 Authorization → 放行，req.user 保持 undefined', () => {
    const { r, res, next } = call({});
    expect(r.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
  });

  test('無效 / 過期 / 格式不對的 token → 一律放行，不回 401', () => {
    for (const authorization of [
      'Bearer not-a-jwt',
      `Bearer ${jwt.sign({ userId: 'u1' }, 'wrong-secret')}`,
      `Bearer ${jwt.sign({ userId: 'u1' }, JWT_SECRET, { expiresIn: -10 })}`,
      'Token abc.def.ghi',
      'Bearer ',
    ]) {
      const { r, res, next } = call({ authorization });
      expect(r.user).toBeUndefined();
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(200);
    }
  });

  test('payload 裡沒有 userId 的合法 token 不會硬塞 req.user', () => {
    const token = jwt.sign({ sub: 'someone' }, JWT_SECRET);
    const { r, next } = call({ authorization: `Bearer ${token}` });
    expect(r.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('router 真的掛上去了：/:id 與 /:id/episodes 都經過 optionalAuth', () => {
    const router = require('../api/routes/drama');
    const handlesFor = (path) => {
      const layer = router.stack.find((l) => l.route && l.route.path === path);
      expect(layer).toBeTruthy();
      return layer.route.stack.map((s) => s.handle);
    };
    expect(handlesFor('/:id')).toContain(optionalAuth);
    expect(handlesFor('/:id/episodes')).toContain(optionalAuth);
    // 寫入端點仍然必須是硬性 auth（不能被 optionalAuth 換掉）
    expect(handlesFor('/:id/watch')).not.toContain(optionalAuth);
  });
});
