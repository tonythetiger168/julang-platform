// ===== v7.2 單元測試：訂閱方案 =====
// getPlans 是純靜態資料（不需要資料庫、不需要連線），所以它可以真的跑測試——
// 這也是 VIP 角標「真實數字」的來源。三個測試把它的對外契約固定下來：
// 方案清單、價格、以及「後端沒有任何折扣欄位」這件事（UI 不該編造 %）。
jest.mock('../api/utils/prisma', () => ({}));
const ctrl = require('../api/controllers/subscriptionController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}

describe('subscriptionController.getPlans', () => {
  test('回傳兩組方案（觀眾／創作者），且不碰資料庫', () => {
    const res = mockRes();
    ctrl.getPlans({}, res);
    expect(res.body.code).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.map((p) => p.id).sort()).toEqual(['free', 'pro', 'team', 'viewer_weekly', 'weekly']);
    expect([...new Set(res.body.data.map((p) => p.group))].sort()).toEqual(['audience', 'creator']);
  });

  test('每個方案都有 UI 需要的名稱與價格', () => {
    const res = mockRes();
    ctrl.getPlans({}, res);
    const by = Object.fromEntries(res.body.data.map((p) => [p.id, p]));
    expect(by.free.price).toBe(0);
    expect(by.weekly.price).toBe(9.9);
    expect(by.pro.price).toBe(29);
    expect(by.team.price).toBe(99);
    expect(by.weekly.name).toBe('週卡');
    expect(by.weekly.bonusCoins).toBe(100);
    expect(Array.isArray(by.pro.features)).toBe(true);
  });

  test('後端沒有任何折扣欄位（所以 UI 只能顯示真實價格，不能編 %）', () => {
    const res = mockRes();
    ctrl.getPlans({}, res);
    for (const p of res.body.data) {
      expect(p.percentOff).toBeUndefined();
      expect(p.originalPrice).toBeUndefined();
      expect(p.discount).toBeUndefined();
    }
  });

  test('觀眾組只有「每週無限看」，價格標為暫定（競品基準 US$19.99/週）', () => {
    const res = mockRes();
    ctrl.getPlans({}, res);
    const audience = res.body.data.filter((p) => p.group === 'audience');
    expect(audience.map((p) => p.id)).toEqual(['viewer_weekly']);
    expect(audience[0].name).toBe('每週無限看');
    expect(audience[0].price).toBe(9.9);
    expect(audience[0].provisional).toBe(true);
    expect(audience[0].unlimited).toBe(true);
  });

  test('創作者工具方案自成一组，不會被當成觀眾優惠', () => {
    const res = mockRes();
    ctrl.getPlans({}, res);
    const creator = res.body.data.filter((p) => p.group === 'creator').map((p) => p.id).sort();
    expect(creator).toEqual(['free', 'pro', 'team', 'weekly']);
  });
});
