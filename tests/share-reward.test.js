/* ===== v7.3 測試：POST /api/v1/coins/share-reward（分享給第一位朋友，+10 金幣）=====
 *
 * 契約：
 *   首次呼叫 → 加 10 幣 + 寫一筆 CoinTransaction(type:'share', amount:10)，回
 *              { granted:true, coins:<更新後>, amount:10 }
 *   之後呼叫 → 不加幣、不寫交易，回 { granted:false, alreadyGranted:true, coins:<目前> }，
 *              **HTTP 200**（幂等，不是錯誤）
 *   未登入   → 401（auth 中介軟體）
 *
 * 一樣用 mocked Prisma 驗「邏輯、回應形狀、以及真的傳給 Prisma 的參數」。
 * **不驗 SQL、不驗真併發**：schema 對 CoinTransaction 只有 @@index([userId, type])，
 * 沒有 (userId, type) 唯一約束，極端同時併發仍可能重複發幣 —— 這是已知且刻意不修的
 * 取捨（見 api/controllers/coinController.js 的 shareReward 檔頭註解）。
 */
jest.mock('../api/utils/prisma', () => ({
  user: { findUnique: jest.fn(), update: jest.fn() },
  coinTransaction: { findFirst: jest.fn(), create: jest.fn() },
  $transaction: jest.fn(),
}));

const jwt = require('jsonwebtoken');
const prisma = require('../api/utils/prisma');
const ctrl = require('../api/controllers/coinController');
const auth = require('../api/middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'julang-dev-secret';
const DESC = '分享給第一位朋友，獲得 10 金幣';

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

// 交易內的 client 刻意跟 module 層的 prisma 分開：這樣才能證明 controller 是透過 tx
// 完成「查 + 加幣 + 寫交易」，而不是繞過交易直接打 prisma。
let tx;
beforeEach(() => {
  jest.clearAllMocks();
  tx = {
    user: { findUnique: jest.fn(), update: jest.fn() },
    coinTransaction: { findFirst: jest.fn(), create: jest.fn() },
  };
  tx.coinTransaction.findFirst.mockResolvedValue(null); // 預設：還沒領過
  tx.user.update.mockResolvedValue({ coins: 30 });
  tx.user.findUnique.mockResolvedValue({ coins: 30 });
  tx.coinTransaction.create.mockResolvedValue({});
  prisma.$transaction.mockImplementation((fn) => {
    if (typeof fn !== 'function') throw new Error('shareReward 必須使用互動式 $transaction');
    return fn(tx);
  });
});

// ---------------------------------------------------------------------------
describe('routes/coins — /share-reward 掛載與未登入 401', () => {
  const shareHandles = () => {
    const router = require('../api/routes/coins');
    const layer = router.stack.find((l) => l.route && l.route.path === '/share-reward');
    expect(layer).toBeTruthy();
    return layer.route.stack.map((s) => s.handle);
  };

  test('路由存在、是 POST、且鏈上是 [auth, ctrl.shareReward]', () => {
    const layer = require('../api/routes/coins').stack.find((l) => l.route && l.route.path === '/share-reward');
    expect(layer.route.methods.post).toBe(true);
    const handles = shareHandles();
    expect(handles).toHaveLength(2);
    expect(handles[0]).toBe(auth);
    expect(handles[1]).toBe(ctrl.shareReward);
  });

  test('未登入（沒有 token）→ 401，且完全不碰資料庫', () => {
    const res = mockRes();
    const next = jest.fn();
    shareHandles()[0](req(), res, next);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('有效 token → auth 放行並把 userId 放進 req.user', () => {
    const token = jwt.sign({ userId: 'u1' }, JWT_SECRET);
    const r = req({ headers: { authorization: `Bearer ${token}` } });
    const res = mockRes();
    const next = jest.fn();
    shareHandles()[0](r, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(r.user.userId).toBe('u1');
    expect(res.statusCode).toBe(200); // 沒有被 401 攔下
  });
});

// ---------------------------------------------------------------------------
describe('coinController.shareReward — 首次分享（第一位朋友）', () => {
  test('加 10 幣、寫一筆 type:share 的交易，回 {granted:true, coins, amount:10}', async () => {
    const res = mockRes();
    await ctrl.shareReward(loggedIn(), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.code).toBe(200);
    expect(res.body.data).toEqual({ granted: true, coins: 30, amount: 10 });
  });

  test('真的傳給 Prisma 的參數：findFirst / user.update / coinTransaction.create', async () => {
    await ctrl.shareReward(loggedIn(), mockRes());
    expect(tx.coinTransaction.findFirst).toHaveBeenCalledWith({ where: { userId: 'u1', type: 'share' } });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'u1' },
      data: { coins: { increment: 10 } },
      select: { coins: true },
    });
    expect(tx.coinTransaction.create).toHaveBeenCalledWith({
      data: { userId: 'u1', type: 'share', amount: 10, description: DESC },
    });
  });

  test('不顯式寫 status，交給 Prisma/DB 預設 completed', async () => {
    await ctrl.shareReward(loggedIn(), mockRes());
    const data = tx.coinTransaction.create.mock.calls[0][0].data;
    expect(data.status).toBeUndefined();
    expect(Object.keys(data).sort()).toEqual(['amount', 'description', 'type', 'userId']);
  });

  test('走的是交易 client（tx），不是 module 層的 prisma', async () => {
    await ctrl.shareReward(loggedIn(), mockRes());
    expect(prisma.coinTransaction.findFirst).not.toHaveBeenCalled();
    expect(prisma.coinTransaction.create).not.toHaveBeenCalled();
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  test('查 + 加幣 + 寫交易都包在同一個互動式 $transaction 內', async () => {
    await ctrl.shareReward(loggedIn(), mockRes());
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(typeof prisma.$transaction.mock.calls[0][0]).toBe('function');
    expect(tx.coinTransaction.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.user.update).toHaveBeenCalledTimes(1);
    expect(tx.coinTransaction.create).toHaveBeenCalledTimes(1);
  });

  test('回傳的 coins 是加幣後的餘額（採 update 的回傳值）', async () => {
    tx.user.update.mockResolvedValue({ coins: 1234 });
    const res = mockRes();
    await ctrl.shareReward(loggedIn(), res);
    expect(res.body.data.coins).toBe(1234);
  });
});

// ---------------------------------------------------------------------------
describe('coinController.shareReward — 幂等（第二位以後的朋友）', () => {
  test('第二次：不再加幣、不再寫交易，回 granted:false + alreadyGranted:true + 目前餘額，HTTP 200', async () => {
    tx.coinTransaction.findFirst.mockResolvedValue({ id: 'tx-share-1', type: 'share', amount: 10 });
    tx.user.findUnique.mockResolvedValue({ coins: 30 });
    const res = mockRes();
    await ctrl.shareReward(loggedIn(), res);
    expect(res.statusCode).toBe(200);          // 幂等是成功，不是 4xx/5xx
    expect(res.body.code).toBe(200);
    expect(res.body.data).toEqual({ granted: false, alreadyGranted: true, coins: 30 });
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.coinTransaction.create).not.toHaveBeenCalled();
  });

  test('連續呼叫兩次：只有第一次發幣，第二次同一條幂等路徑', async () => {
    const res1 = mockRes();
    await ctrl.shareReward(loggedIn(), res1);
    tx.coinTransaction.findFirst.mockResolvedValue({ id: 'tx-share-1', type: 'share', amount: 10 });
    const res2 = mockRes();
    await ctrl.shareReward(loggedIn(), res2);

    expect(res1.body.data.granted).toBe(true);
    expect(res2.body.data.granted).toBe(false);
    expect(res2.body.data.alreadyGranted).toBe(true);
    expect(tx.coinTransaction.create).toHaveBeenCalledTimes(1); // 總共只寫一筆
    expect(tx.user.update).toHaveBeenCalledTimes(1);            // 總共只加一次幣
  });

  test('幂等查詢條件就是 (userId, type:share)，沒有時間窗或 status 條件', async () => {
    tx.coinTransaction.findFirst.mockResolvedValue({ id: 'x' });
    await ctrl.shareReward(loggedIn(), mockRes());
    expect(tx.coinTransaction.findFirst.mock.calls[0][0]).toEqual({ where: { userId: 'u1', type: 'share' } });
  });

  test('幂等分支是看「已存在的 share 交易」而非 body，帶任何 body 都一樣', async () => {
    tx.coinTransaction.findFirst.mockResolvedValue({ id: 'x' });
    const res = mockRes();
    await ctrl.shareReward(loggedIn({ body: { force: true, amount: 999 } }), res);
    expect(res.body.data.granted).toBe(false);
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  test('查不到使用者時 coins 回 0，不爆也不發幣', async () => {
    tx.coinTransaction.findFirst.mockResolvedValue({ id: 'x' });
    tx.user.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await ctrl.shareReward(loggedIn(), res);
    expect(res.body.data).toEqual({ granted: false, alreadyGranted: true, coins: 0 });
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('coinController.shareReward — 401 與錯誤路徑', () => {
  test('沒有 req.user（未登入直呼 controller）→ 401，不碰資料庫', async () => {
    const res = mockRes();
    await ctrl.shareReward(req(), res);
    expect(res.statusCode).toBe(401);
    expect(res.body.code).toBe(401);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  test('交易失敗 → 500，且不洩漏內部訊息', async () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    prisma.$transaction.mockRejectedValue(new Error('db down'));
    const res = mockRes();
    await ctrl.shareReward(loggedIn(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ code: 500, message: '領取失敗' });
    spy.mockRestore();
  });
});
