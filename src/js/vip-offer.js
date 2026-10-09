/* ===== VIP 優惠角標（真實方案資料）=====
 *
 * 這個角標以前是寫死的「👑 -23%」。repo 裡沒有任何折扣資料來源——用
 * discount / originalPrice / PercentOff / salePrice / 折 全庫搜過都沒有——所以那個
 * 數字是編的。現在改成讀真實資料：
 *
 *   GET /subscription/plans ← 後端 api/controllers/subscriptionController.js 的 PLANS
 *                             （純靜態、不需要資料庫）；demo 模式由 mock-api.js
 *                             提供同值資料，vipoffertest.js 會比對兩邊防漂移。
 *
 * 顯示規則（刻意不編造任何數字）：
 *   · 方案帶 percentOff / originalPrice → 「-XX%」（真的有折扣才顯示）
 *   · 否則                             → 「<最便宜付費方案價> 起」
 *   · 取不到資料                        → 保留「優惠」字樣（角標仍能點進會員頁）
 *
 * 同一份資料也驅動「超值優惠」浮動卡，避免兩個地方各講一套優惠。
 */
(function () {
  function paidPlans(plans) {
    return (plans || []).filter(function (p) {
      return p && typeof p.price === 'number' && p.price > 0;
    }).sort(function (a, b) { return a.price - b.price; });
  }

  // 只採用後端真的提供的折扣欄位；沒有就回 null（不猜、不預設）
  function percentOffOf(plans) {
    var list = plans || [];
    for (var i = 0; i < list.length; i++) {
      var p = list[i] || {};
      if (typeof p.percentOff === 'number' && p.percentOff > 0) return Math.round(p.percentOff);
      if (typeof p.originalPrice === 'number' && p.originalPrice > p.price && p.price > 0) {
        return Math.round((1 - p.price / p.originalPrice) * 100);
      }
    }
    return null;
  }

  function planLabel(plan) {
    if (!plan) return '';
    var s = plan.name + ' ' + plan.price;
    if (plan.bonusCoins) s += '／贈 ' + plan.bonusCoins + ' 幣';
    if (plan.provisional) s += '（價格暫定）';
    return s;
  }

  // 只挑「觀眾」方案：後端已把方案分成 audience / creator 兩組，創作者工具
  // （AI 額度／去浮水印／4K）的價格不該出現在觀眾的 VIP 角標上——那正是先前
  // 的定位錯置。若後端尚未分組（舊回應）則沿用全部，保持向後相容。
  function audiencePlans(plans) {
    var list = plans || [];
    var grouped = list.some(function (p) { return p && (p.group === 'audience' || p.group === 'creator'); });
    if (!grouped) return list;
    return list.filter(function (p) { return p && p.group === 'audience'; });
  }

  function render(plans) {
    var list = Array.isArray(plans) ? plans : [];
    var audience = audiencePlans(list);
    var cheapest = paidPlans(audience)[0];
    var pct = percentOffOf(audience);
    window.__vipOffer = { plans: list, audience: audience, cheapest: cheapest || null, percentOff: pct };

    var badge = document.getElementById('vip-badge');
    if (badge) {
      if (pct) badge.textContent = '👑 -' + pct + '%';
      else if (cheapest) badge.textContent = '👑 ' + cheapest.price + ' 起';
      else badge.textContent = '👑 優惠'; // 沒有可用資料時就不顯示數字
      if (cheapest) badge.setAttribute('title', 'VIP 優惠：' + planLabel(cheapest));
    }

    // 「超值優惠」卡吃同一份資料（原本寫死「新人首儲 5 折／限時 24 小時」，都是編的）
    var body = document.getElementById('promo-body');
    if (body) {
      body.textContent = cheapest ? planLabel(cheapest) + '，立即升級' : '目前沒有可用的訂閱方案';
    }

    return !!(cheapest || pct);
  }

  async function load() {
    if (!window.api || !api.get) return false;
    try {
      var res = await api.get('/subscription/plans');
      var data = res && res.data;
      return render(Array.isArray(data) ? data : (data && data.list) || []);
    } catch (e) {
      return false; // 拿不到資料就維持「優惠」字樣，絕不退回假數字
    }
  }

  window.__renderVipOffer = render;
  window.__loadVipOffer = load;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
  else load();
})();
