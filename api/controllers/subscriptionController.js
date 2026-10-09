const prisma = require('../utils/prisma');const { success, error } = require('../utils/response');// 訂閱計劃配置
// 創作者工具方案（AI 生成額度／去浮水印／解析度／團隊協作）。這些原本被當成
// 「VIP 優惠」呈現給一般觀眾，但競品的觀眾產品是「每週無限看」訂閱——定位錯置。
const CREATOR_PLANS = {  free: { name: '免費版', price: 0, dailyAiLimit: 3, watermark: true, maxResolution: '720p', maxTeamMembers: 1, features: ['基礎短劇生成', '社區瀏覽', '本地素材庫'] },  weekly: { name: '週卡', price: 9.9, dailyAiLimit: -1, watermark: false, maxResolution: '1080p', maxTeamMembers: 1, bonusCoins: 100, features: ['無限 AI 生成', '去水印', '1080p 輸出', '雲端同步', '贈送 100 幣'] },  pro: { name: '專業版', price: 29, dailyAiLimit: -1, watermark: false, maxResolution: '4K', maxTeamMembers: 1, bonusCoins: 500, features: ['無限 AI 生成', '去水印', '4K 輸出', '雲端同步', '優先渲染隊列', '贈送 500 幣'] },  team: { name: '團隊版', price: 99, dailyAiLimit: -1, watermark: false, maxResolution: '4K', maxTeamMembers: 5, bonusCoins: 2000, features: ['多人協作畫布', '品牌定制', 'API 訪問', '專屬客服', '數據分析面板', '贈送 2000 幣'] },};

// 觀眾訂閱（產業標準是「每週無限看」）。price 沿用原本的 9.9 作為**暫定值**：
// 真實定價要由產品決定（競品基準 US$19.99/週）。provisional 旗標讓 UI 與文件
// 能明確說出「這還沒定案」，而不是假裝它已定案。
const AUDIENCE_PLANS = {
  viewer_weekly: { name: '每週無限看', price: 9.9, provisional: true, unlimited: true, adFree: true, maxResolution: '1080p', features: ['全站劇集無限看', '免廣告打斷', '1080p 畫質', '每週固定更新檔期'] },
};

// 兩組合併查表（getSubscription / upgrade 用）
const PLANS = Object.assign({}, AUDIENCE_PLANS, CREATOR_PLANS);

// GET /subscription - 獲取當前訂閱
async function getSubscription(req, res) {  try {    const sub = await prisma.subscription.findUnique({ where: { userId: req.user.userId } });    const plan = PLANS[sub?.plan || 'free'];    const isActive = sub?.status === 'active' && (!sub.expiresAt || sub.expiresAt > new Date());    success(res, {      plan: sub?.plan || 'free',      status: isActive ? 'active' : 'expired',      expiresAt: sub?.expiresAt,      autoRenew: sub?.autoRenew ?? true,      limits: {        dailyAiLimit: plan.dailyAiLimit,        watermark: plan.watermark,        maxResolution: plan.maxResolution,        maxTeamMembers: plan.maxTeamMembers,      },      features: plan.features,    });  } catch (e) { console.error(e); error(res, 500, '獲取訂閱失敗'); }}// POST /subscription/upgrade - 升級訂閱
async function upgrade(req, res) {  try {    const { plan, paymentMethod, duration = 1 } = req.body; // duration: 月數
if (!PLANS[plan]) return error(res, 400, '無效的訂閱計劃');    if (plan === 'free') return error(res, 400, '請使用 downgrade 降級到免費版');    const planConfig = PLANS[plan];    const amount = planConfig.price * duration;    // TODO: 接入支付網關（微信支付 / 支付寶 / Stripe）
const paymentId = `mock_payment_${Date.now()}`;    const now = new Date();    const expiresAt = new Date(now.getFullYear(), now.getMonth() + duration, now.getDate());    const sub = await prisma.subscription.upsert({      where: { userId: req.user.userId },      update: { plan, status: 'active', expiresAt, autoRenew: true, paymentId, updatedAt: now },      create: { userId: req.user.userId, plan, status: 'active', expiresAt, autoRenew: true, paymentId },    });    // 更新用戶 VIP 等級
await prisma.user.update({ where: { id: req.user.userId }, data: { vipLevel: plan === 'team' ? 2 : 1, vipExpireAt: expiresAt } });    success(res, { plan, expiresAt, amount, paymentId }, '升級成功');  } catch (e) { console.error(e); error(res, 500, '升級失敗'); }}// POST /subscription/downgrade - 降級到免費版
async function downgrade(req, res) {  try {    await prisma.subscription.updateMany({      where: { userId: req.user.userId },      data: { plan: 'free', status: 'active', expiresAt: null, autoRenew: false, updatedAt: new Date() },    });    await prisma.user.update({ where: { id: req.user.userId }, data: { vipLevel: 0, vipExpireAt: null } });    success(res, null, '已降級到免費版');  } catch (e) { console.error(e); error(res, 500, '降級失敗'); }}// POST /subscription/cancel - 取消自動續費
async function cancelRenewal(req, res) {  try {    await prisma.subscription.updateMany({      where: { userId: req.user.userId },      data: { autoRenew: false, updatedAt: new Date() },    });    success(res, null, '已取消自動續費');  } catch (e) { console.error(e); error(res, 500, '取消失敗'); }}// GET /subscription/plans - 獲取所有計劃
async function getPlans(req, res) {
  // 兩組分開回傳並標上 group，讓前端（VIP 角標／超值優惠卡）只取觀眾方案，
  // 不會再把創作者工具的價格當成觀眾優惠。
  const out = [];
  for (const [id, plan] of Object.entries(AUDIENCE_PLANS)) out.push({ id, group: 'audience', ...plan });
  for (const [id, plan] of Object.entries(CREATOR_PLANS)) out.push({ id, group: 'creator', ...plan });
  success(res, out);
}module.exports = { getSubscription, upgrade, downgrade, cancelRenewal, getPlans, AUDIENCE_PLANS };