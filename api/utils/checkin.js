// ===== v7.2 簽到純邏輯（抽出以便單元測試） =====

const CHECKIN_REWARDS = [
  { day: 1, coins: 5 }, { day: 2, coins: 5 }, { day: 3, coins: 10 },
  { day: 4, coins: 10 }, { day: 5, coins: 15 }, { day: 6, coins: 15 },
  { day: 7, coins: 50 },
];

// 統一以 UTC+8 計算「今日零點」，避免伺服器時區導致跨時區用戶多簽/少簽
const TZ_OFFSET_MS = 8 * 60 * 60 * 1000;

function todayStart(now = new Date()) {
  const shifted = new Date(now.getTime() + TZ_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - TZ_OFFSET_MS);
}

function dayStartOf(d) {
  const shifted = new Date(new Date(d).getTime() + TZ_OFFSET_MS);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - TZ_OFFSET_MS);
}

// 依最後一次簽到日期計算本次狀態
// 回傳 { canCheckin, streak, nextReward }
function computeCheckinState(lastDate, now = new Date()) {
  const today = todayStart(now);
  if (!lastDate) {
    return { canCheckin: true, streak: 0, nextReward: CHECKIN_REWARDS[0].coins, today };
  }
  const diffDays = Math.round((today - dayStartOf(lastDate)) / 86400000);
  if (diffDays === 0) {
    return { canCheckin: false, streak: null, nextReward: null, today }; // streak 由調用方補
  }
  const streak = diffDays === 1 ? null : 0; // null = 延續（lastStreak + 1）
  const base = diffDays === 1 ? null : 0;
  return { canCheckin: true, streak: base, diffDays, today };
}

function rewardFor(streak) {
  const r = CHECKIN_REWARDS.find((x) => x.day === streak);
  return r || CHECKIN_REWARDS[0];
}

module.exports = { CHECKIN_REWARDS, todayStart, dayStartOf, computeCheckinState, rewardFor };
