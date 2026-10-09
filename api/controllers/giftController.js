/* ===== v7.6 贈送影片（會員送給好友免費看）=====
 *
 * 使用者需求（畫面文案）：「會員可贈送短劇給好友免費觀看」。
 * 在這之前那句是**假的**：後端沒有贈送碼、也沒有領取端點，所以 UI 只能顯示
 * 「尚未開通」。這一輪把它做成真的。
 *
 * 設計（刻意與既有付費牆同一條路，不另開第二套）：
 *   · 一組贈送碼綁**一齣劇**（不是單集）—— 文案說的是「短劇」。
 *   · 領取 = 替領取者寫入 **UnlockedEpisode(cost:0)**，覆蓋該劇所有「需要解鎖」的集數
 *     （`episodeNumber > FREE_EPISODES`，且整齣劇不是免費）。判斷免費集的規則直接
 *     取用 dramaController 匯出的 FREE_EPISODES，避免兩邊漂移；
 *     解鎖之後 dramaController.toEpisode 自然就會回 unlocked/videoUrl，
 *     前端不需要知道「這集是靠贈送解鎖的」。
 *   · **只能被領一次**：用 `updateMany({ where: { code, claimedById: null, expiresAt: { gt: now } } })`
 *     的條件式更新，而不是「先查再寫」—— 並發下只有一個請求會 count=1。
 *     領取與寫入解鎖紀錄包在同一個互動式 $transaction，任一步失敗整批回滾。
 *   · 會員資格只認**觀眾方案**（AUDIENCE_PLANS，例如 viewer_weekly「每週無限看」）；
 *     創作者工具方案（週卡/專業版/團隊版）不是「看劇吃到飽」，不能拿來送片。
 *   · 防濫用：每人每日最多 MAX_GIFTS_PER_DAY 組（會員送出的每一組都等於解鎖一整齣劇，
 *     沒有上限就等於把付費牆整片送掉）；贈送碼 7 天後過期。
 *
 * 誠實邊界：
 *   · 贈送碼本身即憑證 —— 拿到碼的人（登入後）就能領。這是「送給好友」的常見做法，
 *     但**不是**指定收件人；要指定得再加邀請/綁定流程。
 *   · 沒有金幣成本（會員權益），所以也沒有退款/收回流程。
 *   · 前端只做到「產生碼 → 分享連結（#gift=CODE）→ 對方開啟後領取」。
 */

const crypto = require('crypto');
const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');
const { todayStart } = require('../utils/checkin');
// 單一來源：免費集數的規則在 dramaController（前 FREE_EPISODES 集免費）
const { FREE_EPISODES } = require('./dramaController');
// 單一來源：觀眾方案表在 subscriptionController
const { AUDIENCE_PLANS } = require('./subscriptionController');

const GIFT_TTL_DAYS = 7;
const MAX_GIFTS_PER_DAY = 5;
// 去掉 I/O/0/1 這種容易看錯的字元；32 個字元 × 8 碼 ≈ 40 bits，且 256 % 32 === 0
// 所以 `byte % 32` 沒有模除偏差
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;
const CODE_RE = /^[A-Z0-9]{4,16}$/;

function makeCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let out = '';
  for (let i = 0; i < CODE_LENGTH; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function normalizeCode(raw) {
  return String(raw == null ? '' : raw).trim().toUpperCase();
}

// 有效中的觀眾方案（不是免費版、狀態 active、沒過期）→ 回 planId，否則 null
async function activeAudiencePlan(userId) {
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub || sub.status !== 'active') return null;
  if (sub.expiresAt && sub.expiresAt <= new Date()) return null;
  if (!AUDIENCE_PLANS[sub.plan]) return null;
  return sub.plan;
}

// 該劇「需要解鎖」的集數（新到舊都算；已解鎖與否是**領取者**的事，這裡只看劇本身）
function paidEpisodesOf(drama) {
  if (!drama || drama.isFree) return [];
  return (drama.episodes || [])
    .filter((e) => Number(e.episodeNumber) > FREE_EPISODES)
    .sort((a, b) => a.episodeNumber - b.episodeNumber);
}

const DRAMA_SELECT = {
  id: true,
  title: true,
  isFree: true,
  episodes: { select: { id: true, episodeNumber: true } },
};

// POST /api/v1/gifts  { dramaId }  → 產生一組贈送碼（會員限）
async function createGift(req, res) {
  try {
    if (!req.user || !req.user.userId) return error(res, 401, '未授權');
    const dramaId = req.body && req.body.dramaId;
    if (typeof dramaId !== 'string' || !dramaId) return error(res, 400, '缺少 dramaId');

    const plan = await activeAudiencePlan(req.user.userId);
    if (!plan) return error(res, 403, '贈送影片是會員功能，請先開通「每週無限看」');

    const drama = await prisma.drama.findUnique({ where: { id: dramaId }, select: DRAMA_SELECT });
    if (!drama) return error(res, 404, '劇集不存在');

    const paid = paidEpisodesOf(drama);
    // 整齣免費（或付費集只有 0 集）→ 這張券什麼都解不開，明確拒絕而不是發一張空券
    if (!paid.length) return error(res, 400, '這齣劇沒有需要解鎖的集數，不需要贈送');

    const sentToday = await prisma.dramaGift.count({
      where: { senderId: req.user.userId, createdAt: { gte: todayStart() } },
    });
    if (sentToday >= MAX_GIFTS_PER_DAY) {
      return error(res, 429, `每日最多贈送 ${MAX_GIFTS_PER_DAY} 次，請明天再試`);
    }

    const expiresAt = new Date(Date.now() + GIFT_TTL_DAYS * 24 * 60 * 60 * 1000);
    let gift = null;
    // code 是 @unique：撞號（天文數字般的低機率）就重試，不讓它變成 500
    for (let attempt = 0; attempt < 5 && !gift; attempt++) {
      try {
        gift = await prisma.dramaGift.create({
          data: { code: makeCode(), dramaId: drama.id, senderId: req.user.userId, expiresAt },
        });
      } catch (e) {
        if (e.code !== 'P2002') throw e;
      }
    }
    if (!gift) return error(res, 500, '產生贈送碼失敗，請再試一次');

    return success(res, {
      code: gift.code,
      dramaId: drama.id,
      dramaTitle: drama.title,
      // 好友領取後會拿到幾集（真實數字，不是行銷話術）
      episodes: paid.length,
      expiresAt: gift.expiresAt,
      // 前端用它組分享連結（前端自己補 origin，見 player-rail.js）
      sharePath: '/#gift=' + gift.code,
    }, '贈送碼已產生，傳給好友就能免費看');
  } catch (e) {
    console.error(e);
    return error(res, 500, '產生贈送碼失敗');
  }
}

// GET /api/v1/gifts/mine → 我送出的贈送碼與狀態
async function myGifts(req, res) {
  try {
    if (!req.user || !req.user.userId) return error(res, 401, '未授權');
    const rows = await prisma.dramaGift.findMany({
      where: { senderId: req.user.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        code: true, createdAt: true, expiresAt: true, claimedAt: true, episodesGranted: true,
        drama: { select: { id: true, title: true } },
      },
    });
    const now = new Date();
    return success(res, rows.map((g) => ({
      code: g.code,
      dramaId: g.drama ? g.drama.id : null,
      dramaTitle: g.drama ? g.drama.title : null,
      createdAt: g.createdAt,
      expiresAt: g.expiresAt,
      claimed: !!g.claimedAt,
      expired: g.expiresAt <= now,
      episodesGranted: g.episodesGranted,
    })));
  } catch (e) {
    console.error(e);
    return error(res, 500, '查詢贈送紀錄失敗');
  }
}

// GET /api/v1/gifts/:code → 領取前預覽（不改變狀態、不洩漏寄件人隱私）
async function previewGift(req, res) {
  try {
    const code = normalizeCode(req.params.code);
    if (!CODE_RE.test(code)) return error(res, 400, '贈送碼格式不正確');
    const gift = await prisma.dramaGift.findUnique({
      where: { code },
      select: {
        code: true, expiresAt: true, claimedAt: true,
        sender: { select: { nickname: true } },
        drama: { select: { id: true, title: true, cover: true, totalEpisodes: true } },
      },
    });
    if (!gift) return error(res, 404, '找不到這個贈送碼');
    const expired = gift.expiresAt <= new Date();
    return success(res, {
      code: gift.code,
      drama: gift.drama,
      from: gift.sender ? gift.sender.nickname : null,
      claimed: !!gift.claimedAt,
      expired,
      claimable: !gift.claimedAt && !expired,
      expiresAt: gift.expiresAt,
    });
  } catch (e) {
    console.error(e);
    return error(res, 500, '查詢贈送碼失敗');
  }
}

// POST /api/v1/gifts/:code/claim → 領取（單次、原子）
async function claimGift(req, res) {
  try {
    if (!req.user || !req.user.userId) return error(res, 401, '未授權');
    const code = normalizeCode(req.params.code);
    if (!CODE_RE.test(code)) return error(res, 400, '贈送碼格式不正確');
    const userId = req.user.userId;

    const gift = await prisma.dramaGift.findUnique({
      where: { code },
      select: { id: true, senderId: true, claimedById: true, expiresAt: true, dramaId: true },
    });
    if (!gift) return error(res, 404, '找不到這個贈送碼');
    if (gift.senderId === userId) return error(res, 400, '不能領取自己送出的贈送碼');
    if (gift.claimedById) return error(res, 409, '這個贈送碼已經被領取了');
    if (gift.expiresAt <= new Date()) return error(res, 410, '這個贈送碼已過期');

    const drama = await prisma.drama.findUnique({ where: { id: gift.dramaId }, select: DRAMA_SELECT });
    if (!drama) return error(res, 404, '這齣劇已不存在');
    const targets = paidEpisodesOf(drama);

    const result = await prisma.$transaction(async (tx) => {
      // 條件式更新 = 單次領取的併發保護（不是先查再寫）
      const claimed = await tx.dramaGift.updateMany({
        where: { code, claimedById: null, expiresAt: { gt: new Date() } },
        data: { claimedById: userId, claimedAt: new Date() },
      });
      if (claimed.count === 0) return { won: false, granted: 0 };

      let granted = 0;
      if (targets.length) {
        const r = await tx.unlockedEpisode.createMany({
          data: targets.map((e) => ({ userId, dramaId: drama.id, episodeId: e.id, cost: 0 })),
          skipDuplicates: true,   // 已經解鎖過的不重複寫、也不報錯
        });
        granted = (r && Number(r.count)) || 0;
      }
      await tx.dramaGift.update({ where: { id: gift.id }, data: { episodesGranted: granted } });
      return { won: true, granted };
    });

    if (!result.won) return error(res, 409, '這個贈送碼已經被領取了');

    return success(res, {
      dramaId: drama.id,
      dramaTitle: drama.title,
      episodesGranted: result.granted,
      episodesTotal: targets.length,
    }, result.granted > 0
      ? `已解鎖 ${result.granted} 集，免費看《${drama.title}》`
      : `《${drama.title}》的付費集你已經全部解鎖過了`);
  } catch (e) {
    console.error(e);
    return error(res, 500, '領取贈送碼失敗');
  }
}

module.exports = {
  createGift, myGifts, previewGift, claimGift,
  GIFT_TTL_DAYS, MAX_GIFTS_PER_DAY, CODE_ALPHABET, CODE_LENGTH,
};
