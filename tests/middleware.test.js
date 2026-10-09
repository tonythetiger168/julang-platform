// ===== v7.2 單元測試：補回的中介軟體 =====
// rateLimit / validate / cache 在原始 repo 中整批缺失，
// 這個 suite 把「它們的行為」固定下來，避免之後又被刪掉而無人察覺。
// v7.3：middleware/apiKeyAuth.js 已隨 /openapi/* 移除，相關測試一併移除。

// Redis 不是硬依賴：注入「未連線」狀態，專門驗證降級到進程內快取的路徑
jest.mock('../api/config/redis', () => ({ isReady: false, get: jest.fn(), setEx: jest.fn() }));

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

describe('middleware/validate', () => {
  const { z } = require('zod');
  const validate = require('../api/middleware/validate');

  test('預設匯出與具名匯出是同一個函式（creator.js 用解構取用）', () => {
    expect(typeof validate).toBe('function');
    expect(validate.validate).toBe(validate);
  });

  test('合法 body 通過，並以解析後的結果覆蓋 req.body', () => {
    const mw = validate(z.object({ coins: z.coerce.number().int() }));
    const req = { body: { coins: '100' } };
    const next = jest.fn();
    mw(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
    expect(req.body.coins).toBe(100);
  });

  test('不合法 body 回 400 並指出欄位', () => {
    const mw = validate(z.object({ title: z.string().min(2) }));
    const res = mockRes();
    const next = jest.fn();
    mw({ body: { title: 'x' } }, res, next);
    expect(res.statusCode).toBe(400);
    expect(res.body.code).toBe(400);
    expect(res.body.errors[0].path).toBe('title');
    expect(next).not.toHaveBeenCalled();
  });

  test('缺少 schema 時在建立中介軟體就丟錯（啟動期就發現）', () => {
    expect(() => validate(undefined)).toThrow(TypeError);
  });
});

describe('middleware/cache', () => {
  const cache = require('../api/middleware/cache');

  test('Redis 不可用時降級為進程內快取並回放', async () => {
    const mw = cache('test', 60);
    const req = { method: 'GET', originalUrl: '/categories' };
    const res1 = mockRes();
    const next = jest.fn(() => res1.json({ code: 200, data: 'fresh' }));
    await mw(req, res1, next);
    expect(next).toHaveBeenCalled();

    const res2 = mockRes();
    const next2 = jest.fn();
    await mw({ method: 'GET', originalUrl: '/categories' }, res2, next2);
    expect(next2).not.toHaveBeenCalled();
    expect(res2.body).toEqual({ code: 200, data: 'fresh' });
  });

  test('非 GET 直接放行，不進快取', async () => {
    const mw = cache('test-post', 60);
    const next = jest.fn();
    await mw({ method: 'POST', originalUrl: '/x' }, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('非 200 的回應不會被快取', async () => {
    const mw = cache('test-err', 60);
    const res = mockRes();
    const next = jest.fn(() => res.status(500).json({ code: 500 }));
    await mw({ method: 'GET', originalUrl: '/boom' }, res, next);

    const res2 = mockRes();
    const next2 = jest.fn();
    await mw({ method: 'GET', originalUrl: '/boom' }, res2, next2);
    expect(next2).toHaveBeenCalled(); // 沒有回放，代表沒被快取
  });
});

describe('middleware/rateLimit', () => {
  test('三個 limiter 都是中介軟體', () => {
    const rl = require('../api/middleware/rateLimit');
    expect(typeof rl.apiLimiter).toBe('function');
    expect(typeof rl.authLimiter).toBe('function');
    expect(typeof rl.aiLimiter).toBe('function');
  });
});

