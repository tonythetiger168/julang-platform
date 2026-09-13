// ===== v7.2 單元測試：簽到純邏輯 =====
const { CHECKIN_REWARDS, todayStart, dayStartOf, rewardFor } = require('../api/utils/checkin');

describe('checkin 工具函數', () => {
  test('連續 7 天獎勵表正確', () => {
    expect(CHECKIN_REWARDS).toHaveLength(7);
    expect(rewardFor(1).coins).toBe(5);
    expect(rewardFor(7).coins).toBe(50);
    expect(rewardFor(99).coins).toBe(5); // 超出回退第 1 天
  });

  test('todayStart 以 UTC+8 取零點', () => {
    // 2026-08-24 16:30 UTC = 2026-08-25 00:30 UTC+8 → 今日應為 25 號
    const now = new Date('2026-08-24T16:30:00Z');
    const t = todayStart(now);
    expect(t.toISOString()).toBe('2026-08-24T16:00:00.000Z'); // UTC+8 的 25 號零點
  });

  test('dayStartOf 與 todayStart 一致可比較', () => {
    const now = new Date('2026-08-24T03:00:00Z'); // UTC+8 11:00（24 號）
    const diff = Math.round((todayStart(now) - dayStartOf(new Date('2026-08-22T20:00:00Z'))) / 86400000);
    expect(diff).toBe(1); // 2026-08-22T20:00Z = UTC+8 23 號 04:00 → 昨天簽到，連續
  });
});
