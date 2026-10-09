/* ===== 追劇（收藏）狀態層：render.js 與 player-rail.js 共用同一份真相 =====
 * @ts-check
 *
 * 問題（使用者回報的順手修）：index.html 的相容 shim 把 window.toggleFollow 設成
 * **空的 stub**（`= function () {}`），於是首頁／排行榜卡片上的愛心按下去完全沒反應 ——
 * 沒有請求、沒有狀態、沒有提示。同一時間 player-rail.js 的「收藏」已經接了真正的
 * 後端契約（POST /dramas/:id/follow ＋ GET /user/follows），變成兩套行為不一致。
 *
 * 這一支把「追劇」收斂成一個地方：
 *   · toggleFollow(dramaId)  —— 切換追劇（樂觀更新 + 失敗回滾），伺服器為準
 *   · loadFollowStates(ids)  —— 批次讀 GET /user/follows，記下「這齣劇追了沒」
 *   · isFollowingKnown(id) / isFollowing(id) / followButtonTone(id)
 *
 * 為什麼要 loadFollowStates：/user/follows 只回「已追」的清單，所以沒被回傳的劇
 * 就是「未追」。但「還沒查之前」和「查過確定沒追」是兩件事 —— 不知道就不畫紅心，
 * 也不編造任何數字（沒有真實收藏數欄位就只顯示狀態）。
 *
 * 載入順序：index.html 把它排在 render.js 之前（render.js 產生的愛心 onclick 呼叫
 * 的就是這裡的 window.toggleFollow），player-rail.js 的「收藏」也改成轉呼叫它，
 * 所以兩邊永遠同步。它自己包在 IIFE 裡，Node DOM harness 載入時不會丟錯。
 */
(function () {
  'use strict';

  var followed = {};    // dramaId -> true（只放「已追」的，未追＝不存在）
  var known = {};       // dramaId -> true（這個 id 已經問過伺服器）
  var inflight = {};    // dramaId -> Promise（同一個 id 不重複打）
  var revision = 0;     // 每次狀態變動 +1，rail 可以用來決定要不要重畫

  function byId(id) {
    try {
      return document.getElementById(id);
    } catch (e) {
      return null;
    }
  }

  function loggedIn() {
    return !!(window.api && typeof window.api.isLoggedIn === 'function' && window.api.isLoggedIn());
  }

  function toast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
  }

  // ---------- 讀 ----------
  function isFollowing(id) {
    return !!followed[String(id)];
  }

  function isFollowingKnown(id) {
    return !!known[String(id)];
  }

  /* 「這齣劇」在 id 清單裡的比對法：後端 GET /user/follows 每列有 dramaId（也給了
     render.js 讀的 id），兩種鍵都認，與 player-rail.js 原本的比對一致。 */
  function rowMatches(row, id) {
    return !!row && (String(row.dramaId) === String(id) || String(row.id) === String(id));
  }

  function applyFollows(ids, list) {
    var wanted = Array.isArray(ids) ? ids.map(String) : [];
    var rows = Array.isArray(list) ? list : [];
    var hit = {};
    rows.forEach(function (row) {
      if (row && row.dramaId) hit[String(row.dramaId)] = true;
      if (row && row.id) hit[String(row.id)] = true;
    });
    wanted.forEach(function (id) {
      if (hit[id]) followed[id] = true; else delete followed[id];
      known[id] = true;
    });
    revision += 1;
  }

  /* 批次載入追劇狀態。未登入時**不編造**：一律視為「未追」且已確定（known），
     這樣愛心是空心，點下去會走「請先登入」那條路。 */
  async function loadFollowStates(ids) {
    var wanted = (Array.isArray(ids) ? ids : []).filter(Boolean).map(String);
    if (!wanted.length) return false;
    if (!loggedIn()) {
      wanted.forEach(function (id) { delete followed[id]; known[id] = true; });
      revision += 1;
      return false;
    }
    var res = await window.api.get('/user/follows');
    if (res && res.code === 200 && Array.isArray(res.data)) {
      applyFollows(wanted, res.data);
      return true;
    }
    // 讀不到就維持「未知」，不把已追的劇畫成沒追
    return false;
  }

  // ---------- 寫 ----------
  async function toggleFollow(dramaId) {
    var id = String(dramaId == null ? '' : dramaId);
    if (!id) return false;
    if (!loggedIn()) {
      toast('請先登入才能收藏');
      if (typeof window.showLogin === 'function') window.showLogin();   // 既有登入流程
      return false;
    }
    if (inflight[id]) return inflight[id];
    var before = isFollowing(id);
    // 樂觀更新：愛心立刻有反應，伺服器回來再對帳
    followed[id] = !before;
    known[id] = true;
    revision += 1;
    var p = (async function () {
      var res = await window.api.post('/dramas/' + id + '/follow');
      if (!res || res.code !== 200) {
        followed[id] = before;      // 回滾
        revision += 1;
        toast('❌ 收藏失敗：' + ((res && res.message) || '請稍後再試'));
        return before;
      }
      var data = res.data || {};
      /* 後端 dramaController.toggleFollow 回 { following: boolean, dramaId }；
         舊 demo 回 { followed }；兩種都認，都沒有才用樂觀值。 */
      var next = typeof data.following === 'boolean' ? data.following
        : (typeof data.followed === 'boolean' ? data.followed : !before);
      followed[id] = !!next;
      known[id] = true;
      revision += 1;
      toast(next ? '❤️ 已加入追劇' : '已取消追劇');
      return !!next;
    })();
    inflight[id] = p;
    try {
      return await p;
    } finally {
      delete inflight[id];
    }
  }

  // ---------- 給 UI 用的小工具 ----------
  /* 愛心鈕的色調：已追＝紅、確定沒追＝暗、還沒查＝不要假裝是紅的 */
  function followButtonTone(id) {
    if (isFollowing(id)) return 'on';
    if (isFollowingKnown(id)) return 'off';
    return 'unknown';
  }

  window.toggleFollow = toggleFollow;
  window.loadFollowStates = loadFollowStates;
  window.isFollowing = isFollowing;
  window.isFollowingKnown = isFollowingKnown;
  window.followButtonTone = followButtonTone;
  window.followStateRevision = function () { return revision; };
})();
