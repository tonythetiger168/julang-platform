/* ===== v7.3 付費牆：播放器入口整合（必須在 ui.js 之後載入）=====
 *
 * 實際的播放入口是 ui.js 的 openPlayer(id)：index.html 產生的每一張卡片都呼叫
 * openPlayer('<dramaId>')，而且 ui.js 的定義贏過 player.js 的同名函式（見 index.html
 * 的載入順序註解）。本檔不改 ui.js，只在外面包一層：
 *
 *   1. 等 ui.js 把 GET /dramas/:id 的回應（帶 free / unlocked / locked / cost /
 *      freeEpisodes）掛上 window.currentDrama，
 *   2. 立刻套用伺服器的鎖定狀態：重畫集數列，鎖住的集數顯示 🔒，
 *      而且點下去只會開解鎖彈窗，不會播放（locked 的集數 videoUrl 本來就是 null）。
 *
 * 這樣「重新整理後仍然解鎖」就是伺服器說了算，而不是靠任何本機旗標。
 *
 * 政策：這一層只「標記 / 顯示」鎖。它不會自動播任何廣告 —— 廣告只在使用者主動按下
 * 解鎖彈窗裡的「觀看廣告免費解鎖」之後才會出現（rewarded）。嚴禁在進入集數前自動
 * 彈全螢幕插頁廣告：Google Play 政策禁止在內容開始時插廣告。
 * 見 player.js 的 showRewardedAd() / nextEp()。
 */
(function () {
  var uiOpenPlayer = window.openPlayer;
  if (typeof uiOpenPlayer !== 'function') {
    console.warn('paywall(unlock.js): window.openPlayer 不存在，跳過包裝');
    return;
  }

  window.openPlayer = async function (id) {
    var result = await uiOpenPlayer.apply(this, arguments);
    try {
      if (typeof window.applyServerLockState === 'function') window.applyServerLockState();
      /* 補抓一次「本人」的鎖定狀態。
       * 為什麼需要：後端 GET /dramas/:id 掛了 cache('drama', 300)，而快取鍵只有 URL、
       * 不含使用者（api/middleware/cache.js），所以登入者可能拿到別人（或未登入時）
       * 的 unlocked —— 使用者明明解鎖過的集數會又變成鎖住的。
       * 只有在「這齣劇還有鎖住的集數」且已登入時才補抓（省一個請求），
       * 補抓會帶 cache-buster 直接穿過快取（見 player.js refreshDramaFromServer）。
       * 正解仍是後端把使用者納入快取鍵，這只是前端保險。 */
      if (window.api && window.api.isLoggedIn && window.api.isLoggedIn() &&
          typeof window.paywallHasLocked === 'function' && window.paywallHasLocked() &&
          typeof window.refreshDramaFromServer === 'function') {
        await window.refreshDramaFromServer();
        if (typeof window.applyServerLockState === 'function') window.applyServerLockState();
      }
    } catch (e) {
      // 付費牆標記失敗不該讓播放器打不開
      console.warn('paywall(unlock.js): 套用伺服器鎖定狀態失敗', e);
    }
    return result;
  };
})();
