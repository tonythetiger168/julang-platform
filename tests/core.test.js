// ===== v7.2 單元測試：通用響應格式 + JWT 中介軟體 =====
const { success, error } = require('../api/utils/response');

function mockRes() {
  const res = {};
  res.statusCode = 200;
  res.body = null;
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  return res;
}

describe('utils/response', () => {
  test('success 回傳統一格式', () => {
    const res = mockRes();
    success(res, { coins: 100 }, 'ok');
    expect(res.body).toEqual({ code: 200, message: 'ok', data: { coins: 100 } });
  });

  test('error 帶 HTTP 狀態碼', () => {
    const res = mockRes();
    error(res, 402, '硬幣不足');
    expect(res.statusCode).toBe(402);
    expect(res.body).toEqual({ code: 402, message: '硬幣不足' });
  });
});

describe('middleware/auth', () => {
  const auth = require('../api/middleware/auth');

  test('缺少 token 回 401', () => {
    const req = { headers: {} };
    const res = mockRes();
    const next = jest.fn();
    auth(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('有效 token 放行', () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: 'u1' }, 'julang-dev-secret');
    const req = { headers: { authorization: 'Bearer ' + token } };
    const res = mockRes();
    const next = jest.fn();
    auth(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.user.userId).toBe('u1');
  });

  test('偽造 token 回 401', () => {
    const jwt = require('jsonwebtoken');
    const token = jwt.sign({ userId: 'u1' }, 'wrong-secret');
    const req = { headers: { authorization: 'Bearer ' + token } };
    const res = mockRes();
    const next = jest.fn();
    auth(req, res, next);
    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });
});
