/* ===== v7.5 播放器外框（DramaBox 對齊）：右側操作列 / 頂列 / 底部列 / bottom sheet =====
 * @ts-check
 *
 * 使用者需求原話（v7.4 → v7.5 的規格變更）：
 *   「收藏、留言、選集、分享到右邊螢幕，**預設就要顯示**；點畫面只是 toggle
 *     （點一次隱藏、再點又顯示）；不要 6 秒自動收起。」
 *   另外照參考 App（DramaBox）：
 *     · 選集 → **由下往上滑入的 bottom sheet**（封面＋片名＋真實觀看數 → 簡介│選集 →
 *       每 30 集一區段 → 6 欄集數格：鎖住右上角 🔒 灰底、目前播放那格高亮＋「播放中」）
 *     · 分享 → 另一張 bottom sheet（分享│贈送影片；分享成功才呼叫
 *       POST /api/v1/coins/share-reward，只有 granted:true 才顯示 +10）
 *     · 底部列：左「✓ 開通會員」、右「⤓ 下載」（下載從右側列移過來，不再重複）
 *     · 頂列：‹ 返回 ＋ 第 N 集 ＋ 倍速（真的改 playbackRate）＋ ⋮
 *     · 全螢幕時操作列也要跟著進去（fullscreenchange 時把節點搬進 Artplayer 的容器）
 *
 * 這支檔案的職責：
 *   1. #player-rail 是貼在畫面右緣的垂直浮動列：收藏（狀態）／留言／選集／分享。
 *      **預設可見**（HTML 不帶 hidden，syncRail 也不再收回）；唯一的顯示開關是
 *      「使用者點畫面」這個 toggle，以及 #player-rail.hidden 這個 class。
 *   2. 手勢：在影片區（#player-video-home）掛 **capture 階段**的 click 監聽，只做
 *      toggle，**不呼叫 stopPropagation、不 preventDefault、不改播放狀態**，所以不可能
 *      吃掉或改變 Artplayer 自己的點擊行為（單擊顯示控制列、雙擊播放/全螢幕、mask 上的
 *      播放鈕、進度條拖曳…全部照舊）。反過來，Artplayer 也擋不到我們：我們只「加」行為。
 *      點在操作列／頂列／底部列／已打開的 sheet 上不會 toggle（那是「操作」不是「點畫面」）。
 *   3. **沒有任何自動彈出的覆蓋層**：sheet 只在使用者點「選集／分享」之後才出現
 *      （Google Play 禁止內容開始時插全屏／插頁式覆蓋），也沒有任何計時器。
 *
 * 付費牆（硬性）：
 *   · 契約規定 locked 的集數 videoUrl === null。分享／下載的唯一條件是
 *     `railPlayable()`＝「沒被 isEpisodeLocked 判成鎖住」**且**「伺服器真的給了 url」，
 *     兩個條件都成立才會有 href／才會真的分享／才會呼叫 share-reward。鎖住時 <a> 連
 *     href 都沒有（不可能下載），點下去只跳「請先解鎖」提示。這裡**沒有任何**組出
 *     鎖住集數網址、或對鎖住集數發獎勵的路徑。
 *   · 選集 sheet 的每一格都用既有的 selectEp(i)：鎖住的集數在 selectEp 裡只會開
 *     showUnlockModal，不會播放（同一條付費牆，沒有第二套判斷）。
 *
 * 不造假數字：
 *   · 「觀看數」只在 drama.views 真的有值時顯示，否則說「尚無觀看數資料」。
 *   · 收藏沒有真實收藏數欄位 → 只顯示「收藏／已收藏」狀態（沿用 follow.js 的真相）。
 *   · 留言沒有單劇留言數來源 → 只顯示「留言」，點擊給出可行動的說明。
 *   · 贈送影片：後端沒有這個模型 → 只做入口並明確標示尚未開通，不偽造流程。
 *
 * 這一層不改 ui.js / player.js 的既有行為，只在外面包一層（跟 unlock.js 同一個手法）：
 *   applyServerLockState → 換劇/換集後同步整個播放器外框
 *   selectEp             → 換集後同步集數標籤／高亮，真的換過集就把 sheet 收起來
 *   openPlayer           → 外框回到預設狀態（操作列顯示）
 *   closePlayer / restorePlayer → 收起操作列與所有 sheet（迷你播放器不會帶著它們）
 */
(function () {
  'use strict';

  var RAIL_EPISODE_LIMIT = 600;   // 集數方格的上限（遠大於 demo 的 12 集，只為防爆量）
  var RANGE_SIZE = 30;            // 每 30 集一區段（使用者指定）
  var SPEED_RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];
  var SHARE_PLATFORMS = [
    { id: 'facebook', name: 'Facebook', icon: 'f', bg: '#1877f2' },
    { id: 'whatsapp', name: 'WhatsApp', icon: '✆', bg: '#25d366' },
    { id: 'messenger', name: 'Messenger', icon: '➤', bg: '#0084ff' },
    { id: 'instagram', name: 'Instagram', icon: '◎', bg: 'linear-gradient(45deg,#f09433,#dc2743,#bc1888)' },
    { id: 'snapchat', name: 'Snapchat', icon: '👻', bg: '#fffc00' },
  ];

  // ---------- 狀態 ----------
  /* v7.6.2：使用者要求「全部預設隱藏、點畫面才出現」——
     頂列／右側操作列／底部列是**同一組**，railVisible 代表整組的顯示狀態，
     預設 false（HTML 三個節點也都帶 hidden）。 */
  var railVisible = false;
  var pickerOpen = false;
  var pickerTab = 'list';         // 'intro' | 'list'（選集為選中態）
  var pickerPage = 0;             // 第幾個 30 集區段
  var shareOpen = false;
  var shareTab = 'share';         // 'share' | 'gift'
  var speedOpen = false;
  var settingsOpen = false;       // v7.6.2：⋮ 的「播放設置」sheet
  var commentsOpen = false;       // v7.6.2：留言 sheet
  var commentsLoading = false;
  var commentsList = [];          // 目前畫面上的留言（後端回來的真實資料）
  var commentsError = '';
  var stageWired = false;
  var lastDramaId = null;
  var lastIndex = -1;
  var bodyLockCount = 0;           // sheet 的 body 捲動鎖（見 lockBody）
  var bodyLockOwners = {};         // owner('picker'/'share') -> true
  var lastBodyOverflow = '';
  var loggedInForShare = false;
  var shareRewardClaimed = false;  // 伺服器說 alreadyGranted（UI 就不再顯示 +10）
  var giftMember = false;          // 觀眾會員（GET /subscription 對照 /subscription/plans 的 audience 組）
  var giftCode = '';               // 這次 session 已產生的贈送碼（屬於 giftCodeDramaId）
  var giftCodeDramaId = '';        // 上面那組碼是哪一齣劇的（換劇要清掉，避免拿 A 劇的碼送 B 劇）
  var giftEpisodes = 0;            // 後端說好友領取後會拿到幾集（真實數字，不是行銷話術）
  var giftBusy = false;            // 正在產生贈送碼
  var giftError = '';              // 產生失敗的訊息（誠實顯示，不假裝成功）
  var pendingGiftCode = '';        // 從 #gift=CODE 進來但還沒登入 → 先記住，登入後自動領
  var giftClaimed = false;         // 這次 session 已經領過（避免重複打 API）
  var giftExpiresAt = '';          // 伺服器回的有效期限（畫面上顯示這個，不自己算 7 天）

  /* ---------- DOM 小工具 ----------
   * 這一層會被多個 Node DOM harness 載入（它們的 stub 彼此不同、有的
   * getElementById 一律回 null），所以每個存取都防禦性寫法：
   * 拿不到元素就當作「這個環境沒有這塊 UI」，不丟錯、不讓播放流程掛掉。 */
  function byId(id) {
    try {
      return document.getElementById(id);
    } catch (e) {
      return null;
    }
  }
  function showEl(el) {
    if (el && el.classList && typeof el.classList.remove === 'function') el.classList.remove('hidden');
  }
  function hideEl(el) {
    if (el && el.classList && typeof el.classList.add === 'function') el.classList.add('hidden');
  }
  function setText(el, text) {
    if (el) el.textContent = text;
  }
  function setHTML(el, html) {
    if (el) el.innerHTML = html;
  }
  function setAttr(el, name, value) {
    if (el && typeof el.setAttribute === 'function') el.setAttribute(name, value);
  }
  function removeAttr(el, name) {
    if (el && typeof el.removeAttribute === 'function') el.removeAttribute(name);
  }
  function toggleClass(el, cls, on) {
    if (el && el.classList && typeof el.classList.toggle === 'function') el.classList.toggle(cls, !!on);
  }
  function toast(message) {
    if (typeof window.showToast === 'function') window.showToast(message);
  }
  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  // ---------- 資料存取（一律以 window 上的現況為準，不自己存一份）----------
  function railDrama() {
    var d = window.currentDrama;
    return d && typeof d === 'object' ? d : null;
  }
  function railEpisodes() {
    var d = railDrama();
    var eps = d && d.episodes;
    return Array.isArray(eps) ? eps : [];
  }
  function railIndex() {
    var i = Number(window.currentEpIndex);
    return Number.isFinite(i) && i > 0 ? Math.floor(i) : 0;
  }
  function railEpisode() {
    var eps = railEpisodes();
    return eps[railIndex()] || null;
  }
  /* 鎖定判準只有一個：player.js 的 isEpisodeLocked（伺服器的 locked / free /
     freeEpisodes 都由它解釋）。拿不到時退回契約本身：沒有 videoUrl 就是鎖住。 */
  function railLocked(ep, index, drama) {
    if (typeof window.isEpisodeLocked === 'function') return !!window.isEpisodeLocked(ep, index, drama);
    return !ep || !ep.videoUrl;
  }
  /* 可分享／可下載＝沒鎖住 **而且** 伺服器真的給了網址。
     付費牆的契約是「locked 時 videoUrl 是 null」，所以鎖住的集數在這裡一定拿不到 url。 */
  function railPlayable(ep, index, drama) {
    return !!ep && !!ep.videoUrl && !railLocked(ep, index, drama);
  }
  function railLoggedIn() {
    return !!(window.api && typeof window.api.isLoggedIn === 'function' && window.api.isLoggedIn());
  }
  function episodeNumberOf(ep, index) {
    var n = Number(ep && ep.episodeNumber);
    return Number.isFinite(n) && n > 0 ? n : index + 1;
  }
  /* 觀看數字串：只在後端真的給了才回傳，沒有就回 null（UI 會說「尚無資料」）。 */
  function viewsText(drama) {
    var v = drama && drama.views;
    if (v === null || v === undefined) return null;
    var s = String(v).trim();
    return s ? s : null;
  }
  function currentRate() {
    var art = window.artPlayer;
    var r = Number(art && art.playbackRate);
    return Number.isFinite(r) && r > 0 ? r : 1;
  }

  // ---------- 右側操作列內容（v7.6.2：線性圖示 + 下方數字/文字）----------
  /* 兩個數字都是**後端回的真實值**（GET /dramas/:id 的 followCount = UserFollow 實際人數、
     commentCount = Comment 實際則數）。拿不到就整行隱藏 —— 不編一個假的 0。
     注意：**絕對不能用 setText 覆寫整顆按鈕**，那會把 HTML 裡的 SVG 圖示一起洗掉。 */
  var followCount = null;    // null = 還不知道（隱藏那行）
  var commentCount = null;

  function formatCount(n) {
    // 破千縮寫（DramaBox 用 7.2K）：只在真的超過時才縮寫
    if (n >= 10000) return Math.round(n / 1000) + 'K';
    if (n >= 1000) return (Math.round(n / 100) / 10) + 'K';
    return String(n);
  }

  function paintCount(id, value) {
    var el = byId(id);
    if (!el) return;
    if (typeof value === 'number' && isFinite(value) && value >= 0) {
      setText(el, formatCount(value));
      showEl(el);
    } else {
      hideEl(el);   // 沒有真實數字 → 不顯示（而不是顯示 0）
    }
  }

  // 從 currentDrama 讀真實的兩個數字（缺欄位 → null）
  function readCounts() {
    var drama = railDrama() || {};
    var f = Number(drama.followCount);
    var c = Number(drama.commentCount);
    followCount = drama.followCount === undefined || drama.followCount === null || !isFinite(f) ? null : f;
    commentCount = drama.commentCount === undefined || drama.commentCount === null || !isFinite(c) ? null : c;
  }

  function paintFollow() {
    var btn = byId('rail-follow');
    if (!btn) return;
    var drama = railDrama();
    var id = drama && drama.id;
    // 狀態（已收藏／未收藏）來自 follow.js 的真相，不是本機旗標
    var on = !!(id && typeof window.isFollowing === 'function' && window.isFollowing(id));
    setAttr(btn, 'aria-pressed', on ? 'true' : 'false');
    setAttr(btn, 'title', on ? '取消追劇' : '加入追劇');
    toggleClass(btn, 'rail-btn-on', on);
    paintCount('rail-follow-count', followCount);
  }

  function paintComment() {
    var btn = byId('rail-comment');
    if (!btn) return;
    setAttr(btn, 'title', '留言');
    paintCount('rail-comment-count', commentCount);
  }

  function paintRail() {
    var drama = railDrama();
    var eps = railEpisodes();
    var index = railIndex();
    var ep = eps[index] || null;
    var playable = railPlayable(ep, index, drama);

    /* v7.6.2：**不要**再 setText('rail-picker'/'rail-share') —— 那兩顆按鈕的內容是
       HTML 裡的 SVG 圖示 + 文字，覆寫 textContent 會把圖示整組洗掉。標籤現在是靜態的。 */

    // 分享：鎖住 → 停用外觀 + 提示（點擊時才跳 toast，不在這裡吵使用者）
    var share = byId('rail-share');
    toggleClass(share, 'rail-btn-off', !playable);
    if (playable) removeAttr(share, 'aria-disabled');
    else setAttr(share, 'aria-disabled', 'true');
    setAttr(share, 'title', playable ? '分享第 ' + (index + 1) + ' 集' : '需先解鎖第 ' + (index + 1) + ' 集才能分享');

    /* 下載：<a download> 指向該集的 videoUrl —— 但**只在 playable 時**才把 href 寫上去。
       鎖住時連 href / download 都不存在，所以就算使用者想辦法觸發點擊也下載不到東西；
       這是不繞過付費牆的關鍵一步（不是只靠「按鈕變灰」）。 */
    var link = byId('rail-download');
    setText(link, '⤓ 下載');
    toggleClass(link, 'rail-btn-off', !playable);
    if (playable) {
      setAttr(link, 'href', ep.videoUrl);
      setAttr(link, 'download', downloadName(drama, ep, index));
      removeAttr(link, 'aria-disabled');
      setAttr(link, 'title', '下載第 ' + (index + 1) + ' 集');
    } else {
      removeAttr(link, 'href');
      removeAttr(link, 'download');
      setAttr(link, 'aria-disabled', 'true');
      setAttr(link, 'title', '需先解鎖第 ' + (index + 1) + ' 集才能下載');
    }

    // 頂列／底部列
    setText(byId('rail-episode-chip'), '第 ' + episodeNumberOf(ep, index) + ' 集');
    var membership = byId('bottom-membership');
    setText(membership, '✓ 開通會員');
    setAttr(membership, 'title', giftMember ? '已開通會員' : '開通會員');

    readCounts();      // v7.6.2：真實的追劇人數／留言則數（後端沒給 → 那行隱藏）
    paintFollow();
    paintComment();
    paintSpeed();
  }

  // 下載檔名：劇名_EPn.mp4（只用 mp4 的副檔名，HLS 清單不假裝成影片檔）
  function downloadName(drama, ep, index) {
    var base = String((drama && drama.title) || 'julang').replace(/[\\/:*?"<>|\s]+/g, '_');
    var n = episodeNumberOf(ep, index);
    var ext = /\.mp4(\?|$)/i.test(String((ep && ep.videoUrl) || '')) ? '.mp4' : '';
    return base + '_EP' + n + ext;
  }

  // ---------- 頂列：倍速 ＋ ⋮ ----------
  function paintSpeed() {
    var rate = currentRate();
    var label = (Math.round(rate * 100) / 100) + '×';
    setText(byId('rail-speed'), label);
    var menu = byId('rail-speed-menu');
    if (!menu) return;
    setHTML(menu, SPEED_RATES.map(function (r) {
      var on = Math.abs(r - rate) < 0.001;
      return '<button type="button" class="rail-menu-item' + (on ? ' rail-menu-item-on' : '') +
        '" role="menuitemradio" aria-checked="' + (on ? 'true' : 'false') +
        '" data-rate="' + r + '" onclick="railSetSpeed(' + r + ')">' +
        '<span>' + r + '×</span><span>' + (on ? '✓' : '') + '</span></button>';
    }).join(''));
  }

  /* ---------- v7.6.2「播放設置」sheet（頂列 ⋮）----------
   * 使用者要求：⋮ 開一張播放設置面板（參考 DramaBox：解析度／倍速／彈幕／畫中畫）。
   * 誠實原則（本專案的硬性要求）：
   *   · 目前解析度 → 讀**影片自己的** videoWidth×videoHeight，不是寫死的「自動(720p)」
   *   · 倍速      → 真的改 artPlayer.playbackRate（沿用 SPEED_RATES）
   *   · 畫中畫    → 真的切 artPlayer.pip，開關狀態反映實際值
   *   · 彈幕      → 本專案**沒有彈幕引擎**，所以標示「尚未開通」且不可切換，
   *                 而不是做一個按了沒反應的假開關
   *   · 觀看數    → 沿用舊 ⋮ 選單那個真實數字；沒有資料就說沒有 */
  function settingsResolutionText() {
    var art = window.artPlayer;
    var v = (art && art.video) || null;
    if (!v || !v.videoWidth || !v.videoHeight) return '載入中…';
    return v.videoWidth + '×' + v.videoHeight;
  }

  function renderSettingsBody() {
    var body = byId('rail-settings-body');
    if (!body) return;
    var drama = railDrama();
    var index = railIndex();
    var ep = railEpisode();
    var views = viewsText(drama);
    var rate = currentRate();
    var art = window.artPlayer;
    var pipOn = !!(art && art.pip);
    var rates = SPEED_RATES.map(function (r) {
      var on = Math.abs(r - rate) < 0.001;
      return '<button type="button" class="rail-set-chip' + (on ? ' rail-set-chip-on' : '') +
        '" aria-pressed="' + (on ? 'true' : 'false') + '" onclick="railSetSpeed(' + r + ')">' + r + '×</button>';
    }).join('');
    setHTML(body,
      '<h3 class="rail-set-title">播放設置</h3>' +
      '<div class="rail-set-row"><span class="rail-set-label">目前解析度</span>' +
        '<span class="rail-set-value">' + esc(settingsResolutionText()) + '</span></div>' +
      '<div class="rail-set-row"><span class="rail-set-label">倍速</span>' +
        '<span class="rail-set-value">' + (Math.round(rate * 100) / 100) + '×</span></div>' +
      '<div class="rail-set-chips">' + rates + '</div>' +
      '<div class="rail-set-row"><span class="rail-set-label">彈幕</span>' +
        '<span class="rail-set-value rail-set-off">尚未開通</span></div>' +
      '<p class="rail-set-note">本專案沒有彈幕引擎，所以不安裝一個按了沒反應的假開關。</p>' +
      '<div class="rail-set-row"><span class="rail-set-label">畫中畫</span>' +
        '<button type="button" class="rail-set-toggle' + (pipOn ? ' rail-set-toggle-on' : '') +
        '" role="switch" aria-checked="' + (pipOn ? 'true' : 'false') +
        '" onclick="railTogglePip()" aria-label="畫中畫">' +
        '<span class="rail-set-knob"></span></button></div>' +
      '<div class="rail-set-row"><span class="rail-set-label">觀看數</span>' +
        '<span class="rail-set-value">' + (views ? esc(views) + ' 次' : '尚無資料') + '</span></div>' +
      '<p class="rail-set-note">第 ' + episodeNumberOf(ep, index) + ' 集 · 全 ' + railEpisodes().length + ' 集</p>');
  }

  // 畫中畫：真的切 artPlayer.pip（沒有播放器就不假裝）
  function railTogglePip() {
    var art = window.artPlayer;
    if (!art) {
      toast('播放器尚未就緒');
      return false;
    }
    try {
      art.pip = !art.pip;
    } catch (e) {
      if (window.console && console.warn) console.warn('player-rail: 無法切換畫中畫', e);
    }
    renderSettingsBody();
    return false;
  }

  function closeMenus() {
    speedOpen = false;
    hideEl(byId('rail-speed-menu'));
    setAttr(byId('rail-speed'), 'aria-expanded', 'false');
  }

  function railToggleSpeed() {
    var open = !speedOpen;
    closeMenus();
    if (!open) return false;
    speedOpen = true;
    paintSpeed();
    showEl(byId('rail-speed-menu'));
    setAttr(byId('rail-speed'), 'aria-expanded', 'true');
    return false;
  }

  // 頂列 ⋮：開「播放設置」sheet（v7.6.2 取代舊的 rail-more-menu）
  function railToggleSettings() {
    if (settingsOpen) return railCloseSettings();
    closeMenus();
    settingsOpen = true;
    railShow();                    // 面板要看得見，chrome 必須是顯示的
    renderSettingsBody();
    showEl(byId('rail-settings-sheet'));
    setAttr(byId('rail-more'), 'aria-expanded', 'true');
    lockBody('settings');
    return false;
  }

  function railCloseSettings() {
    settingsOpen = false;
    hideEl(byId('rail-settings-sheet'));
    setAttr(byId('rail-more'), 'aria-expanded', 'false');
    unlockBody('settings');
    return false;
  }

  // 舊名字（v7.5 的「更多」選單）保留給外部呼叫：現在就是開播放設置。
  function railToggleMore() {
    return railToggleSettings();
  }

  /* 真的改播放速度。有 artPlayer 就直接寫 playbackRate（播放器是唯一真相）；
     沒有播放器（Node harness / 尚未初始化）就退回 player.js 既有的 changeSpeed()，
     兩條路都不假裝改了。 */
  function railSetSpeed(rate) {
    var r = Number(rate);
    if (!Number.isFinite(r) || r <= 0) return false;
    var art = window.artPlayer;
    if (art) {
      try {
        art.playbackRate = r;
      } catch (e) {
        if (window.console && console.warn) console.warn('player-rail: 無法設定倍速', e);
      }
    } else if (typeof window.changeSpeed === 'function') {
      window.changeSpeed();
    }
    closeMenus();
    paintSpeed();
    if (settingsOpen) renderSettingsBody();   // 面板開著時倍速 chips 要跟著更新
    toast('倍速：' + r + '×');
    return false;
  }

  /* ---------- 選集 bottom sheet ----------
   * 每一格都呼叫既有的 selectEp(i)：這是**同一條**付費牆路徑（鎖住 → showUnlockModal），
   * 所以面板不可能繞過解鎖直接播放。鎖住的格子顯示右上角 🔒 並帶 data-locked="1"，
   * 與 #episode-list 的契約一致（同一組屬性，方便用同一套檢查驗證）。 */
  function pageCount(total) {
    return Math.max(1, Math.ceil(total / RANGE_SIZE));
  }

  function renderRangeTabs(total) {
    var pages = pageCount(total);
    if (pages <= 1) return '';   // 只有一段就不必顯示籤（沒有資訊量）
    var out = [];
    for (var p = 0; p < pages; p++) {
      var from = p * RANGE_SIZE + 1;
      var to = Math.min(total, (p + 1) * RANGE_SIZE);
      out.push('<button type="button" class="rail-range-tab' + (p === pickerPage ? ' rail-range-tab-on' : '') +
        '" data-page="' + p + '" onclick="railSetRange(' + p + ')">' + from + '-' + to + '</button>');
    }
    return '<div class="rail-range-tabs">' + out.join('') + '</div>';
  }

  function renderEpisodeGrid() {
    var drama = railDrama();
    var eps = railEpisodes().slice(0, RAIL_EPISODE_LIMIT);
    if (!eps.length) return '<p class="rail-panel-empty">集數載入中…</p>';
    var active = railIndex();
    var from = pickerPage * RANGE_SIZE;
    var slice = eps.slice(from, from + RANGE_SIZE);
    var tiles = slice.map(function (ep, i) {
      var index = from + i;
      var locked = railLocked(ep, index, drama);
      var cls = 'rail-ep' + (index === active ? ' rail-ep-active' : '') + (locked ? ' rail-ep-locked' : '');
      /* v7.6.2：鎖頭改成**線性 SVG**（參考 DramaBox 的白線鎖頭），不再用 emoji 🔒 ——
         與右側操作列改成線性圖示是同一個理由（emoji 在每個平台長得不一樣）。
         契約不變：`.rail-ep-lock` + `data-locked="1"`（paywalltest/rail-contract 靠這兩個）。 */
      var lockIcon = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" ' +
        'stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
        '<rect x="4.5" y="10.5" width="15" height="10" rx="2.2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
      // 右上角鎖頭 + 灰底；目前播放那格高亮＋「播放中」；未鎖純數字
      return '<button type="button" class="' + cls + '" data-ep-index="' + index +
        '" data-locked="' + (locked ? '1' : '0') + '"' +
        ' onclick="selectEp(' + index + ')"' + (locked ? ' title="需要解鎖"' : '') + '>' +
        '<span class="rail-ep-stack"><span>' + episodeNumberOf(ep, index) + '</span>' +
        (index === active ? '<span class="rail-ep-now">播放中</span>' : '') + '</span>' +
        (locked ? '<span class="rail-ep-lock" aria-label="已鎖住">' + lockIcon + '</span>' : '') +
        '</button>';
    }).join('');
    return '<div class="rail-ep-grid">' + tiles + '</div>';
  }

  function renderPickerBody() {
    var body = byId('rail-picker-body');
    if (!body) return;
    var drama = railDrama();
    var eps = railEpisodes();
    var views = viewsText(drama);
    var cover = (drama && drama.cover) ? String(drama.cover) : '';
    var head =
      '<div class="rail-sheet-head">' +
        (cover ? '<img class="rail-sheet-cover" src="' + esc(cover) + '" alt="" loading="lazy">' : '') +
        '<div class="rail-sheet-head-text">' +
          '<h3 class="rail-sheet-title">' + esc((drama && drama.title) || '未命名劇集') + '</h3>' +
          // 用該劇真實的 views 字串；沒有就誠實說沒有
          '<p class="rail-sheet-views">' + (views
            ? esc(views) + ' 次觀看'
            : '尚無觀看數資料') + '</p>' +
        '</div>' +
      '</div>' +
      '<div class="rail-sheet-tabs">' +
        '<button type="button" class="rail-sheet-tab' + (pickerTab === 'intro' ? ' rail-sheet-tab-on' : '') +
          '" onclick="railPickerTab(\'intro\')">簡介</button>' +
        '<button type="button" class="rail-sheet-tab' + (pickerTab === 'list' ? ' rail-sheet-tab-on' : '') +
          '" onclick="railPickerTab(\'list\')">選集</button>' +
      '</div>';

    var content;
    if (pickerTab === 'intro') {
      // 簡介不裁切、不截斷（CSS 是 white-space: pre-wrap，整個描述都看得到）
      var desc = drama && drama.desc ? String(drama.desc) : '';
      content = '<p class="rail-sheet-desc">' + (desc ? esc(desc) : '這齣劇還沒有簡介。') + '</p>';
    } else {
      pickerPage = Math.min(pickerPage, pageCount(eps.length) - 1);
      content = renderRangeTabs(eps.length) + renderEpisodeGrid();
    }
    setHTML(body, head + content);
  }

  function railPickerTab(tab) {
    pickerTab = tab === 'intro' ? 'intro' : 'list';
    renderPickerBody();
    return false;
  }

  function railSetRange(page) {
    var p = Number(page);
    if (!Number.isFinite(p) || p < 0) return false;
    pickerPage = Math.floor(p);
    pickerTab = 'list';
    renderPickerBody();
    return false;
  }

  /* ---------- 分享 bottom sheet ---------- */
  function renderShareBody() {
    var body = byId('rail-share-body');
    if (!body) return;
    var drama = railDrama();
    var index = railIndex();
    var ep = railEpisode();
    var playable = railPlayable(ep, index, drama);
    /* v7.6：後端真的有贈送模型了（DramaGift + /api/v1/gifts），所以會員看到的不再是
       「即將推出」的假入口，而是真的產生一組贈送碼去分享。
       碼是**綁劇**的：換劇時 syncRail 會清掉上一齣的碼（用 giftCodeDramaId 比對）。
       文案裡的數字全部來自伺服器回應（集數、到期日、每日上限的錯誤訊息），
       前端不寫死 7 天/5 組這類常數 —— 兩邊漂移的話，畫面上就會出現假數字。 */
    var giftTitle = (drama && drama.title) ? String(drama.title) : '這齣劇';
    var gift = '';
    if (giftMember) {
      var giftBody;
      if (giftBusy) {
        giftBody = '<button type="button" class="rail-gift-cta" disabled>產生中…</button>';
      } else if (giftCode && giftCodeDramaId === ((drama && drama.id) || '')) {
        giftBody =
          '<p class="rail-gift-code">' + esc(giftCode) + '</p>' +
          '<button type="button" class="rail-gift-cta" onclick="railCopyGiftLink()">複製贈送連結</button>' +
          '<p class="rail-gift-note">好友登入後開這個連結就能領取，' +
            (giftEpisodes > 0 ? '免費看需要解鎖的 ' + giftEpisodes + ' 集。' : '免費看本劇的付費集數。') +
            (giftExpiresAt ? '贈送碼有效到 ' + esc(giftExpiresAt) + '。' : '') + '</p>';
      } else {
        giftBody =
          '<button type="button" class="rail-gift-cta" onclick="railCreateGift()">產生贈送碼</button>' +
          '<p class="rail-gift-note">好友領取後可免費觀看本劇需要解鎖的集數。每日贈送組數有上限，' +
            '實際額度以伺服器回覆為準。</p>';
      }
      gift =
        '<div class="rail-gift">' +
          '<div class="rail-gift-icon" aria-hidden="true">🎟️</div>' +
          '<p class="rail-gift-text">贈送《' + esc(giftTitle) + '》給好友</p>' +
          giftBody +
          (giftError ? '<p class="rail-gift-note rail-gift-err">⚠️ ' + esc(giftError) + '</p>' : '') +
        '</div>';
    } else {
      gift =
        '<div class="rail-gift">' +
          '<div class="rail-gift-icon" aria-hidden="true">🎟️</div>' +
          '<p class="rail-gift-text">會員可贈送短劇給好友免費觀看</p>' +
          '<button type="button" class="rail-gift-cta" onclick="switchTab(\'inspire\')">訂閱</button>' +
        '</div>';
    }
    var sharePane =
      '<p class="rail-share-hint">🪙 ' + (shareRewardClaimed
        ? '已領取過分享獎勵'
        : '分享給第一位朋友，獲得 10 金幣') + '</p>' +
      '<div class="rail-share-row">' + SHARE_PLATFORMS.map(function (p) {
        return '<button type="button" class="rail-share-item" data-platform="' + p.id +
          '" onclick="railShareTo(\'' + p.id + '\')">' +
          '<span class="rail-share-icon" style="background:' + p.bg + '">' + p.icon + '</span>' +
          '<span>' + p.name + '</span></button>';
      }).join('') + '</div>' +
      '<button type="button" class="rail-share-main" onclick="railShareTo(\'main\')"' +
        (playable ? '' : ' disabled') + '>' +
        (playable ? '分享' : '🔒 第 ' + episodeNumberOf(ep, index) + ' 集尚未解鎖') + '</button>';

    setHTML(body,
      '<div class="rail-sheet-tabs">' +
        '<button type="button" class="rail-sheet-tab' + (shareTab === 'share' ? ' rail-sheet-tab-on' : '') +
          '" onclick="railShareTab(\'share\')">分享</button>' +
        '<button type="button" class="rail-sheet-tab' + (shareTab === 'gift' ? ' rail-sheet-tab-on' : '') +
          '" onclick="railShareTab(\'gift\')">贈送影片</button>' +
      '</div>' +
      (shareTab === 'gift' ? gift : sharePane));
  }

  function railShareTab(tab) {
    shareTab = tab === 'gift' ? 'gift' : 'share';
    renderShareBody();
    return false;
  }

  // ---------- bottom sheet 開合（body 捲動鎖定，巢狀計數）----------
  function anySheetOpen() {
    return pickerOpen || shareOpen || settingsOpen || commentsOpen;
  }

  /* body 捲動鎖：用**持有鎖的 sheet 集合**（而不是布林、也不是單純計數）。
     為什麼：兩個 sheet 可以接連開（關掉選集、馬上開分享），布林寫法會在「關 A → 開 B」
     之間把 overflow 還原成 ''（畫面彈一下），或在 B 開著時就解除；而計數如果被重複
     unlock（例如關播放器時順手把兩個 sheet 都關一次）就會變成負數，最後一次關閉反而
     不還原。「集合 + 名稱」天生冪等：同一個 sheet 重複 lock/unlock 都只算一次。
     「還原成什麼」則是**第一次上鎖前**的值（有別人在鎖 body 時也不亂改）。 */
  function lockBody(owner) {
    if (bodyLockOwners[owner]) return;      // 這一張已經持有鎖
    bodyLockOwners[owner] = true;
    bodyLockCount += 1;
    if (bodyLockCount !== 1) return;
    var body = document.body;
    if (!body || !body.style) return;
    lastBodyOverflow = body.style.overflow || '';
    body.style.overflow = 'hidden';
  }

  function unlockBody(owner) {
    if (!bodyLockOwners[owner]) return;     // 這一張沒有鎖 → 不重複釋放
    delete bodyLockOwners[owner];
    bodyLockCount = Math.max(0, bodyLockCount - 1);
    if (bodyLockCount > 0) return;          // 還有另一張 sheet 開著
    var body = document.body;
    if (!body || !body.style) return;
    // 還原成原本的值（ui.js 開播放器時也是設 hidden，關閉時清空）
    body.style.overflow = lastBodyOverflow || '';
  }

  function railOpenPicker() {
    closeMenus();
    pickerOpen = true;
    pickerTab = 'list';
    railShow();
    renderPickerBody();
    showEl(byId('rail-picker-sheet'));
    setAttr(byId('rail-picker'), 'aria-expanded', 'true');
    lockBody('picker');
    return false;
  }

  function railClosePicker() {
    pickerOpen = false;
    hideEl(byId('rail-picker-sheet'));
    setAttr(byId('rail-picker'), 'aria-expanded', 'false');
    unlockBody('picker');
    return false;
  }

  function railTogglePicker() {
    if (pickerOpen) return railClosePicker();
    return railOpenPicker();
  }

  async function railOpenShare() {
    closeMenus();
    shareOpen = true;
    shareTab = 'share';
    railShow();
    // 先畫（分享籤的內容不依賴會員狀態），再非同步確認登入／會員
    renderShareBody();
    showEl(byId('rail-share-sheet'));
    lockBody('share');
    loggedInForShare = railLoggedIn();
    if (!loggedInForShare) {
      giftMember = false;   // 未登入不可能有會員狀態（不猜）
      renderShareBody();
      return false;
    }
    /* 會員判定要**與後端一致**：只有觀眾方案（/subscription/plans 的 group:'audience'）
       能送片；創作者工具方案（週卡／專業版／團隊版）不是「看劇吃到飽」。方案清單由
       後端提供（單一來源），前端不寫死 plan id —— 後端 giftController 用同一份
       AUDIENCE_PLANS 判斷，兩邊才不會一個放行一個 403。 */
    if (!window.api || typeof window.api.get !== 'function') {
      giftMember = false;
      renderShareBody();
      return false;
    }
    var out = await Promise.all([
      window.api.get('/subscription'),
      window.api.get('/subscription/plans'),
    ]);
    giftMember = isAudienceMember(out[0], out[1]);
    renderShareBody();
    return false;
  }

  /* 觀眾會員：訂閱有效 **且** 方案屬於後端標成 audience 的那一組。
     拿不到方案清單時 fail-closed（當成不是會員），不做樂觀猜測。 */
  function isAudienceMember(subRes, plansRes) {
    var sub = subRes && subRes.code === 200 ? subRes.data : null;
    if (!sub || sub.status !== 'active') return false;
    if (!sub.plan || sub.plan === 'free') return false;
    var plans = plansRes && plansRes.code === 200 && Array.isArray(plansRes.data) ? plansRes.data : null;
    if (!plans) return false;
    return plans.some(function (p) { return p && p.id === sub.plan && p.group === 'audience'; });
  }

  function railCloseShare() {
    shareOpen = false;
    hideEl(byId('rail-share-sheet'));
    unlockBody('share');
    return false;
  }

  // ---------- 顯示 / 收起（v7.6.2：整組 chrome 一起切換）----------
  /* 使用者：「開通會員和下載是在影片視窗下固定隱藏，點擊顯示出來的」＋
     「（確認）全部一起：預設全部隱藏，點畫面才出現」。
     所以頂列／右側操作列／底部列是**同一組**：要顯示一起顯示、要隱藏一起隱藏。 */
  var CHROME_IDS = ['player-top-bar', 'player-rail', 'player-bottom-bar'];

  function railShow() {
    railVisible = true;
    for (var i = 0; i < CHROME_IDS.length; i++) showEl(byId(CHROME_IDS[i]));
  }

  function railHide() {
    railVisible = false;
    closeMenus();
    railClosePicker();
    railCloseShare();
    railCloseSettings();
    railCloseComments();
    for (var i = 0; i < CHROME_IDS.length; i++) hideEl(byId(CHROME_IDS[i]));
    return false;   // 供 inline onclick 使用（不影響任何預設行為）
  }

  /* 點畫面 = 純 toggle（規格）：顯示↔隱藏互換，沒有計時器、不碰播放狀態。
     回傳目前是否可見，方便診斷與 harness 斷言。 */
  function railToggle() {
    if (railVisible) {
      railHide();
      return false;
    }
    railShow();
    return true;
  }

  // 舊名字（v7.4 的 railReveal）保留給外部呼叫；現在就是「顯示」。
  function railReveal() {
    railShow();
    return true;
  }

  // ---------- 全螢幕：把操作列搬進播放器容器 ----------
  function fullscreenHost() {
    var fs = document.fullscreenElement || document.webkitFullscreenElement || null;
    if (fs && fs.querySelector) {
      /* Artplayer 全螢幕時把 .art-video-player（root）丟進 requestFullscreen，
         所以 fs 本身就是那層；萬一未來版本改成容器進全螢幕，退而找內層節點。 */
      return fs.querySelector('.art-video-player') || fs;
    }
    var container = byId('player-video');
    if (container && container.querySelector) {
      var root = container.querySelector('.art-video-player');
      if (root) return root;
    }
    return null;
  }

  /* 進全螢幕：rail 節點搬進播放器容器（.art-video-player）並加 .rail-fullscreen，
     否則 #player-video-home 被播放器覆蓋，rail 會跟著消失（＝操作列進不了全螢幕）。
     離開：搬回 #player-video-home 並移除 class。搬移前後重算一次位置（讀 rect 會
     強制版面重算，高度上限就是照新的宿主算的）。 */
  function syncRailHost() {
    var rail = byId('player-rail');
    var home = byId('player-video-home');
    var host = fullscreenHost();
    try {
      if (host && rail && host.appendChild && rail.parentNode !== host) {
        host.appendChild(rail);
        if (rail.classList) rail.classList.add('rail-fullscreen');
      } else if (!host && rail && home && home.appendChild && rail.parentNode !== home) {
        home.appendChild(rail);
        if (rail.classList) rail.classList.remove('rail-fullscreen');
      }
    } catch (e) {
      if (window.console && console.warn) console.warn('player-rail: 全螢幕搬移失敗', e);
    }
    recalcRailRect();
  }

  function recalcRailRect() {
    var home = byId('player-video-home');
    if (!home || typeof home.getBoundingClientRect !== 'function') return;
    try {
      var r = home.getBoundingClientRect();   // 讀一次 → 強制重算版面
      railLayout.stageH = Math.round(r.height || 0);
      railLayout.stageW = Math.round(r.width || 0);
    } catch (e) { /* harness 沒有幾何資訊，忽略 */ }
  }

  function onFullscreenChange() {
    syncRailHost();
  }

  // ---------- 五個動作 ----------

  /* 收藏：狀態一律讀 GET /user/follows，切換走 POST /dramas/:id/follow（後端契約）。
     v7.5：真正的實作搬到 follow.js（首頁／排行榜卡片的愛心也走同一支），
     這裡只負責「問一次狀態」與「重畫按鈕」，確保兩邊永遠一致。 */
  async function railRefreshFollow() {
    var drama = railDrama();
    var id = drama && drama.id;
    if (!id) return false;
    if (typeof window.loadFollowStates === 'function') {
      await window.loadFollowStates([id]);
    }
    paintFollow();
    return !!(typeof window.isFollowing === 'function' && window.isFollowing(id));
  }

  async function railToggleFollow() {
    var drama = railDrama();
    var id = drama && drama.id;
    if (!id) return;
    if (typeof window.toggleFollow === 'function') {
      // follow.js 會處理未登入提示、樂觀更新、失敗回滾與 toast
      await window.toggleFollow(id);
      paintFollow();
      if (pickerOpen) renderPickerBody();
      return;
    }
    if (!railLoggedIn()) {
      toast('請先登入才能收藏');
      if (typeof window.showLogin === 'function') window.showLogin();
    }
  }

  /* ---------- 留言 sheet（v7.6.2：真的有功能）----------
   * 使用者：「留言沒功能」。原因是後端**根本沒有劇集留言端點**（`prisma.comment` 全庫沒被用過），
   * 舊版只能跳一個「目前沒有留言」的 toast。現在接真的 API：
   *   GET  /dramas/:id/comments   （未登入可看）
   *   POST /dramas/:id/comments   （需登入；body { content, episodeId }）
   * 未登入按送出 → 開登入框（不假裝送出成功）。數字（rail-comment-count）也是後端真值。 */
  function renderCommentsBody() {
    var body = byId('rail-comment-body');
    if (!body) return;
    var head = '<h3 class="rail-set-title">留言</h3>';
    if (commentsLoading) {
      setHTML(body, head + '<p class="rail-panel-empty">載入中…</p>');
      return;
    }
    var list;
    if (!commentsList.length) {
      /* 空狀態（照 DramaBox 的評論面板）：說明 + 提示寫第一則，不用假留言填版面 */
      list = '<div class="rail-cm-empty">' +
        '<div class="rail-cm-empty-ico" aria-hidden="true">💬</div>' +
        '<p class="rail-cm-empty-text">還沒有留言，來發表第一則吧</p></div>';
    } else {
      list = '<div class="rail-cm-list">' + commentsList.map(function (c) {
        var nick = (c.user && c.user.nickname) || '劇迷';
        var when = '';
        try { when = c.createdAt ? new Date(c.createdAt).toLocaleString() : ''; } catch (e) { when = ''; }
        return '<div class="rail-cm-item">' +
          '<div class="rail-cm-avatar" aria-hidden="true">' + esc(String(nick).slice(0, 1)) + '</div>' +
          '<div class="rail-cm-main">' +
            '<div class="rail-cm-meta"><span class="rail-cm-nick">' + esc(nick) + '</span>' +
            (when ? '<span class="rail-cm-time">' + esc(when) + '</span>' : '') + '</div>' +
            '<p class="rail-cm-text">' + esc(c.content) + '</p>' +
          '</div></div>';
      }).join('') + '</div>';
    }
    var composer = railLoggedIn()
      ? '<div class="rail-cm-composer">' +
          '<input id="rail-comment-input" class="rail-cm-input" type="text" maxlength="500" placeholder="發一則友善的留言…" aria-label="留言內容">' +
          '<button type="button" class="rail-cm-send" onclick="railPostComment()">送出</button>' +
        '</div>'
      : '<div class="rail-cm-composer"><button type="button" class="rail-cm-send rail-cm-send-wide" onclick="railRequireLogin()">登入後留言</button></div>';
    setHTML(body, head + (commentsError ? '<p class="rail-gift-note rail-gift-err">⚠️ ' + esc(commentsError) + '</p>' : '') + list + composer);
  }

  async function railLoadComments() {
    var drama = railDrama();
    var id = drama && drama.id;
    if (!id) return false;
    if (window.__apiMode === 'mock') {
      commentsList = [];
      commentsError = 'Demo 模式沒有留言後端（要 ?api=real 才會真的讀寫留言）';
      renderCommentsBody();
      return false;
    }
    commentsLoading = true;
    commentsError = '';
    renderCommentsBody();
    var res = await window.api.get('/dramas/' + encodeURIComponent(id) + '/comments');
    commentsLoading = false;
    if (!res || res.code !== 200) {
      commentsError = (res && res.message) || '讀取留言失敗';
      renderCommentsBody();
      return false;
    }
    var data = res.data || {};
    commentsList = Array.isArray(data.list) ? data.list : [];
    // 後端回的 total 才是真的「這齣劇有幾則留言」，用它更新右側數字
    if (typeof data.total === 'number') {
      commentCount = data.total;
      paintComment();
    }
    renderCommentsBody();
    return true;
  }

  async function railPostComment() {
    var drama = railDrama();
    var id = drama && drama.id;
    var input = byId('rail-comment-input');
    var content = input && input.value ? String(input.value).trim() : '';
    if (!id) return false;
    if (!railLoggedIn()) return railRequireLogin();
    if (!content) {
      toast('請先輸入留言內容');
      return false;
    }
    if (window.__apiMode === 'mock') {
      toast('Demo 模式沒有留言後端');
      return false;
    }
    var res = await window.api.post('/dramas/' + encodeURIComponent(id) + '/comments', {
      content: content,
      // 目前正在看的那一集（後端會驗它真的屬於這齣劇）
      episodeId: (railEpisode() && railEpisode().id) || undefined,
    });
    if (!res || res.code !== 200) {
      toast('⚠️ ' + ((res && res.message) || '留言失敗'));
      return false;
    }
    if (input) input.value = '';
    toast('💬 已送出留言');
    if (typeof commentCount === 'number') { commentCount += 1; paintComment(); }
    await railLoadComments();   // 以伺服器回來的清單為準（不自己往陣列塞假的）
    return true;
  }

  function railRequireLogin() {
    toast('請先登入才能留言');
    if (typeof window.showLogin === 'function') window.showLogin();
    return false;
  }

  // 留言：開 sheet 並載入真實留言（未登入也可以看）
  function railComment() {
    if (commentsOpen) return railCloseComments();
    closeMenus();
    commentsOpen = true;
    railShow();                    // sheet 要看得見，chrome 必須顯示
    commentsList = [];
    commentsError = '';
    renderCommentsBody();
    showEl(byId('rail-comment-sheet'));
    lockBody('comments');
    railLoadComments();
    return false;
  }

  function railCloseComments() {
    commentsOpen = false;
    hideEl(byId('rail-comment-sheet'));
    unlockBody('comments');
    return false;
  }

  // 分享連結：這個 app 的深連結只有 #play=<dramaId>，不假造不存在的 ?ep=。
  function railShareUrl(drama) {
    var base = '';
    try {
      base = String(window.location.origin || '') + String(window.location.pathname || '/');
    } catch (e) {
      base = '';
    }
    return base + '#play=' + encodeURIComponent(drama.id);
  }

  function copyToClipboard(text) {
    try {
      if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        navigator.clipboard.writeText(text).then(function () {
          toast('🔗 連結已複製');
        }, function () {
          legacyCopy(text);
        });
        return;
      }
    } catch (e) { /* 沒有 clipboard API 就往下走 */ }
    legacyCopy(text);
  }

  function legacyCopy(text) {
    var copied = false;
    try {
      var ta = document.createElement('textarea');
      ta.value = text;
      setAttr(ta, 'readonly', '');
      if (document.body && typeof document.body.appendChild === 'function') document.body.appendChild(ta);
      if (typeof ta.select === 'function') ta.select();
      if (typeof document.execCommand === 'function') copied = !!document.execCommand('copy');
      if (ta && typeof ta.remove === 'function') ta.remove();
    } catch (e) {
      copied = false;
    }
    // 複製不了也要讓使用者拿得到連結（toast 就是既有的提示機制）
    toast(copied ? '🔗 連結已複製' : '🔗 分享連結：' + text);
  }

  /* 分享本體：navigator.share 優先，不支援／失敗就複製連結。
     回傳 true = 分享或複製真的發生了（呼叫端才會去要分享獎勵）。 */
  async function doShare(drama, index) {
    var url = railShareUrl(drama);
    var title = drama.title || '劇浪';
    var text = title + ' 第 ' + (index + 1) + ' 集';
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: title, text: text, url: url });
        return true;
      } catch (e) {
        // 使用者自己取消（AbortError）就不要再吵他；其他錯誤才退回複製連結
        if (e && e.name === 'AbortError') return false;
      }
    }
    copyToClipboard(url);
    return true;
  }

  /* 分享獎勵：**只有分享成功之後**才呼叫（先走既有分享路徑）。
     未登入 → 提示登入，不亂叫 API（後端這條是 auth 保護的，打了只會 401）。
     granted:true → toast「+10 金幣」並更新所有金幣顯示；
     granted:false/alreadyGranted → 不再顯示 +10（只說已領取過）。
     Demo（mock）模式沒有這條路由，直接跳過並誠實說明，不假裝領到。 */
  async function claimShareReward() {
    if (!railLoggedIn()) {
      toast('請先登入才能領取分享獎勵');
      if (typeof window.showLogin === 'function') window.showLogin();
      return false;
    }
    if (window.__apiMode === 'mock') {
      toast('🔗 已分享（Demo 模式沒有分享獎勵）');
      return false;
    }
    var res = await window.api.post('/coins/share-reward');
    if (!res || res.code !== 200) {
      toast('⚠️ 分享成功，但獎勵領取失敗：' + ((res && res.message) || '請稍後再試'));
      return false;
    }
    var data = res.data || {};
    var amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) amount = 10;   // 後端固定 10，僅在缺欄位時退回
    if (data.granted === true) {
      shareRewardClaimed = false;
      toast('🪙 +' + amount + ' 金幣');
      if (typeof window.updateCoinDisplay === 'function') {
        var coins = Number(data.coins);
        window.updateCoinDisplay(Number.isFinite(coins) ? coins : undefined);
      }
      if (typeof window.updateCoinPill === 'function') window.updateCoinPill();
      return true;
    }
    // alreadyGranted / granted:false → 絕不再顯示 +10
    shareRewardClaimed = true;
    toast('已領取過分享獎勵');
    return false;
  }

  /* 主分享路徑（右側操作列的「分享」）：先檢查付費牆，開分享 sheet。 */
  function railShare() {
    var drama = railDrama();
    var index = railIndex();
    var ep = railEpisode();
    if (!drama) return false;
    // 付費牆：鎖住 / 沒有網址 → 不分享（不繞過解鎖）
    if (!railPlayable(ep, index, drama)) {
      toast('🔒 第 ' + episodeNumberOf(ep, index) + ' 集尚未解鎖，請先解鎖後再分享');
      return false;
    }
    railOpenShare();
    return false;
  }

  /* 社群圖示／主按鈕：都走同一條既有分享路徑，成功後才要獎勵。
     （各平台的 JS SDK 不在這個專案裡，所以圖示是入口而不是假 SDK 呼叫。） */
  async function railShareTo(platform) {
    var drama = railDrama();
    var index = railIndex();
    var ep = railEpisode();
    if (!drama) return false;
    if (!railPlayable(ep, index, drama)) {
      toast('🔒 第 ' + episodeNumberOf(ep, index) + ' 集尚未解鎖，請先解鎖後再分享');
      return false;
    }
    var ok = await doShare(drama, index);
    if (ok) await claimShareReward();
    if (pickerOpen) renderPickerBody();
    return false;
  }

  // 同源判斷：相對路徑（/media/...）算同源；只有 http(s):// 才需要比對 origin
  function sameOrigin(url) {
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return true;
    try {
      return new URL(url).origin === String(window.location.origin || '');
    } catch (e) {
      return false;
    }
  }

  /* 下載：<a download href=videoUrl> 是主體（同源 mp4 由瀏覽器原生下載）。
   * 這裡只擋兩種「下載了也沒有意義」的情況，並且說清楚原因：
   *   · 鎖住的集數 → 不可能有 href（見 paintRail）
   *   · 外部 CDN 的串流 / HLS 清單 → download 屬性跨網域無效、m3u8 也不是影片檔；
   *     直接放行會變成「按了下載卻整頁跳走」，所以改成明確提示。
   * 真實成片（/media/shengtang/*.mp4）同源、又是 mp4 → 走原生下載。 */
  function railDownload(event) {
    var drama = railDrama();
    var index = railIndex();
    var ep = railEpisode();
    function stop(message) {
      if (event && typeof event.preventDefault === 'function') event.preventDefault();
      if (message) toast(message);
      return false;
    }
    if (!railPlayable(ep, index, drama)) {
      return stop('🔒 第 ' + episodeNumberOf(ep, index) + ' 集尚未解鎖，請先解鎖後再下載');
    }
    var url = String(ep.videoUrl);
    if (!sameOrigin(url)) {
      return stop('⤓ 第 ' + episodeNumberOf(ep, index) + ' 集是外部串流，瀏覽器無法直接存檔');
    }
    if (!/\.mp4(\?|$)/i.test(url)) {
      return stop('⤓ 第 ' + episodeNumberOf(ep, index) + ' 集是 HLS 串流清單，無法直接存成影片檔');
    }
    toast('⤓ 開始下載第 ' + episodeNumberOf(ep, index) + ' 集…');
    return true;   // 讓 <a download> 用瀏覽器原生行為下載
  }

  /* ---------- 贈送影片（v7.6）：產生碼 / 複製連結 / 領取 ----------
   * 後端：api/routes/gifts.js → api/controllers/giftController.js。
   * 前端只做三件事：把碼做出來、把連結給出去、把連結帶回來領。
   * 會員資格、每日上限、碼的效期一律由伺服器判定／回報 —— 前端不重算規則，
   * 否則兩邊一旦漂移，畫面就會顯示假數字（本專案對「不造假」的要求見 HANDOFF §1.5）。 */

  async function railCreateGift() {
    var drama = railDrama();
    var id = drama && drama.id;
    if (!id || giftBusy) return false;
    if (window.__apiMode === 'mock') {
      giftError = 'Demo 模式沒有贈送後端（要 ?api=real 才會真的產生贈送碼）';
      renderShareBody();
      toast('🎟️ ' + giftError);
      return false;
    }
    giftBusy = true;
    giftError = '';
    renderShareBody();
    var res = await window.api.post('/gifts', { dramaId: id });
    giftBusy = false;
    if (!res || res.code !== 200) {
      giftError = (res && res.message) || '產生贈送碼失敗';
      renderShareBody();
      toast('⚠️ ' + giftError);
      return false;
    }
    var data = res.data || {};
    giftCode = String(data.code || '');
    giftCodeDramaId = id;
    giftEpisodes = Number(data.episodes) || 0;
    giftExpiresAt = data.expiresAt ? new Date(data.expiresAt).toLocaleString() : '';
    renderShareBody();
    toast('🎟️ 贈送碼已產生');
    return false;
  }

  // 贈送連結（與 railShareUrl 用同一套 origin/pathname 算法，不假造不存在的 query）
  function railGiftUrl() {
    if (!giftCode) return '';
    var base = '';
    try {
      base = String(window.location.origin || '') + String(window.location.pathname || '/');
    } catch (e) { base = ''; }
    return base + '#gift=' + encodeURIComponent(giftCode);
  }

  function railCopyGiftLink() {
    var url = railGiftUrl();
    if (!url) return false;
    copyToClipboard(url);
    return false;
  }

  /* 領取：把碼送給後端，成功就直接把這齣劇打開。
     付費牆的放行完全由伺服器決定（同一條 UnlockedEpisode），前端不自己標記。 */
  async function railClaimGift(code) {
    var c = String(code || '').toUpperCase();
    if (!c || giftClaimed) return false;
    if (window.__apiMode === 'mock') {
      toast('Demo 模式沒有贈送後端，無法領取贈送碼');
      return false;
    }
    if (!railLoggedIn()) {
      pendingGiftCode = c;   // 記住，登入成功後由 doLogin 的包裝續領
      toast('🎟️ 收到贈送碼，請先登入即可領取');
      if (typeof window.showLogin === 'function') window.showLogin();
      return false;
    }
    pendingGiftCode = '';
    var res = await window.api.post('/gifts/' + encodeURIComponent(c) + '/claim');
    if (!res || res.code !== 200) {
      toast('⚠️ ' + ((res && res.message) || '領取失敗'));
      return false;
    }
    giftClaimed = true;
    var data = res.data || {};
    toast('🎟️ ' + (data.dramaTitle ? '已領取《' + data.dramaTitle + '》' : '已領取贈送') +
      (data.episodesGranted ? '，解鎖 ' + data.episodesGranted + ' 集' : ''));
    if (data.dramaId && typeof window.openPlayer === 'function') window.openPlayer(data.dramaId);
    return true;
  }

  /* 分享出去的就是 #gift=CODE 這個連結：帶著它進來就自動領取。
     未登入時 railClaimGift 會先開登入框，登入成功後再續領。 */
  function bootGiftFromHash() {
    var hash = String((window.location && window.location.hash) || '');
    var m = /(?:^|[#&])gift=([A-Za-z0-9]{4,16})/.exec(hash);
    if (!m) return false;
    railClaimGift(m[1]);
    return true;
  }

  // ---------- 與播放流程同步 ----------
  var railLayout = { stageW: 0, stageH: 0 };   // 搬移前後重算的幾何（診斷用）

  function syncRail() {
    attemptWire();
    var drama = railDrama();
    var id = (drama && drama.id) || '';
    var index = railIndex();
    if (id !== lastDramaId) {
      /* 新的一齣劇（或第一次進播放器）：只把面板／選單／區段這些「上一齣劇的暫存」清掉。
         v7.6.2：**不再強制 railShow()** —— chrome 現在預設隱藏，由使用者點畫面決定；
         換劇不該擅自把它叫出來（那是上一輪「預設顯示」的寫法）。 */
      lastDramaId = id;
      lastIndex = index;
      pickerPage = 0;
      pickerTab = 'list';
      shareTab = 'share';
      /* 贈送碼是**綁劇**的：換劇就把上一齣的碼清掉，否則會拿 A 劇的碼去送 B 劇。 */
      if (giftCodeDramaId !== id) { giftCode = ''; giftEpisodes = 0; giftExpiresAt = ''; giftError = ''; }
      commentsList = [];          // 留言是 per-drama 的，換劇要清掉上一齣的
      commentsError = '';
      closeMenus();
      railClosePicker();
      railCloseShare();
      railCloseSettings();
      railCloseComments();
      railRefreshFollow();
    } else if (index !== lastIndex) {
      // 換集：sheet 收起來（使用者已經選好了），區段停在目前這一集所在的那一段
      lastIndex = index;
      pickerPage = Math.floor(index / RANGE_SIZE);
      if (pickerOpen) railClosePicker();
    }
    syncRailHost();
    paintRail();
    if (settingsOpen) renderSettingsBody();
    if (commentsOpen) renderCommentsBody();
    if (pickerOpen) renderPickerBody();
    if (shareOpen) renderShareBody();
  }

  function attemptWire() {
    if (stageWired) return true;
    var stage = byId('player-video-home');
    if (!stage || typeof stage.addEventListener !== 'function') return false;
    var doc = document;
    if (doc && typeof doc.addEventListener === 'function') {
      doc.addEventListener('fullscreenchange', onFullscreenChange);
      doc.addEventListener('webkitfullscreenchange', onFullscreenChange);
    }
    /* capture 階段、不 preventDefault、不 stopPropagation：
       我們只是「順便」toggle 操作列，Artplayer 的點擊行為（控制列、雙擊播放/全螢幕、
       進度條）完全不受影響。 */
    stage.addEventListener('click', function (e) {
      var target = e && e.target;
      var rail = byId('player-rail');
      // 點在操作列 / 它的選單 / 頂列 / 底部列 / 已打開的 sheet 上＝「操作」，不 toggle
      if (rail && target && typeof rail.contains === 'function' && rail.contains(target)) return;
      var menus = [byId('rail-speed-menu')];
      for (var i = 0; i < menus.length; i++) {
        if (menus[i] && target && typeof menus[i].contains === 'function' && menus[i].contains(target)) return;
      }
      var bars = [byId('player-top-bar'), byId('player-bottom-bar')];
      for (var j = 0; j < bars.length; j++) {
        if (bars[j] && target && typeof bars[j].contains === 'function' && bars[j].contains(target)) return;
      }
      if (anySheetOpen()) return;                 // sheet 開著時點背景不算「點畫面」
      if (speedOpen) { closeMenus(); return; }     // 倍速下拉開著：點畫面先把它關掉
      railToggle();                                // 純 toggle（chrome 整組一起），播放狀態不變
    }, true);
    stageWired = true;
    return true;
  }

  /* 包一層既有函式（不改原行為；包裝失敗不影響播放）。
   *
   * 為什麼是 direct 呼叫而不是共用包裝器：Function.prototype.toString() 只吐「這個
   * 函式自己的原始碼」，被當成參數／閉包變數傳進來的函式**不會**出現在字串裡
   * （實測：`make(inner)` 回傳的包裝器字串裡找不到 'inner'，但 `function h(){ inner() }`
   * 找得到）。而 _julang-analysis/paywalltest.js 正是用
   *   String(window.openPlayer).indexOf('applyServerLockState') !== -1
   * 確認「ui.js → unlock.js」這條包裝鏈沒有被抹掉 —— 所以每個包裝器都必須**自己直接
   * 呼叫**它要呼叫的東西，不能躲在共用 helper 後面（本層就曾因此弄壞 1/74）。 */
  function wrapGlobalByName(name) {
    var original = window[name];
    if (typeof original !== 'function') return null;
    function wrapped() {
      var result = original.apply(this, arguments);
      try {
        if (name === 'applyServerLockState' || name === 'selectEp') {
          syncRail();
        } else if (name === 'openPlayer') {
          /* 開播放器：重讀真實狀態。v7.6.2 起 chrome **預設隱藏**（使用者：點畫面才出現），
             所以這裡不再強制顯示 —— 只把選單／面板的暫存清掉，並讓 syncRail 重畫。 */
          if (typeof window.applyServerLockState === 'function') window.applyServerLockState();
          lastIndex = -1;
          speedOpen = false;
          settingsOpen = false;
          closeMenus();
          railCloseSettings();
          railCloseComments();
          syncRail();
        } else if (name === 'closePlayer') {
          railHide();
          closeMenus();
        } else if (name === 'restorePlayer') {
          /* 從迷你播放器回來：只清面板暫存。chrome 維持「使用者上次的選擇」——
             v7.6.2 起預設是隱藏，這裡不再硬把它叫出來（點畫面才顯示）。 */
          closeMenus();
          railCloseSettings();
          railCloseComments();
        }
      } catch (e) {
        // 外框出錯不該讓播放/解鎖流程掛掉
        if (window.console && console.warn) console.warn('player-rail: 同步失敗', e);
      }
      return result;
    }
    window[name] = wrapped;
    return wrapped;
  }

  /* 包裝次序是刻意的：openPlayer 先包，最後才包 applyServerLockState。
     原因見 wrapGlobalByName 的說明 —— openPlayer 的包裝器原始碼一定要含
     'applyServerLockState' 這個「直接呼叫」；unlock.js 的原始碼本來就含（它自己直接
     呼叫），所以「先包 openPlayer（unlock 的版本在內層）→ 再包 applyServerLockState」
     同時滿足兩件事：外層開播放器時會呼叫 == 已包好的 == applyServerLockState（外框一起
     同步），而 String(window.openPlayer) 仍然看得到 applyServerLockState。 */
  wrapGlobalByName('openPlayer');
  wrapGlobalByName('closePlayer');
  wrapGlobalByName('restorePlayer');
  wrapGlobalByName('selectEp');
  wrapGlobalByName('applyServerLockState');

  // ---------- 匯出（inline onclick 需要全域函式；診斷用 railState）----------
  window.railReveal = railReveal;
  window.railShow = railShow;
  window.railHide = railHide;
  window.railToggle = railToggle;
  window.railToggleFollow = railToggleFollow;
  window.railRefreshFollow = railRefreshFollow;
  window.railComment = railComment;
  window.railTogglePicker = railTogglePicker;
  window.railOpenPicker = railOpenPicker;
  window.railClosePicker = railClosePicker;
  window.railPickerTab = railPickerTab;
  window.railSetRange = railSetRange;
  window.railShare = railShare;
  window.railShareTo = railShareTo;
  window.railOpenShare = railOpenShare;
  window.railCloseShare = railCloseShare;
  window.railShareTab = railShareTab;
  window.railToggleSpeed = railToggleSpeed;
  window.railToggleMore = railToggleMore;
  window.railSetSpeed = railSetSpeed;
  // v7.6.2：⋮ 的播放設置面板、以及真的有功能的留言
  window.railToggleSettings = railToggleSettings;
  window.railCloseSettings = railCloseSettings;
  window.railTogglePip = railTogglePip;
  window.railComment = railComment;
  window.railCloseComments = railCloseComments;
  window.railLoadComments = railLoadComments;
  window.railPostComment = railPostComment;
  window.railRequireLogin = railRequireLogin;
  window.railDownload = railDownload;
  window.railSync = syncRail;
  window.railFullscreenSync = syncRailHost;
  // v7.6 贈送影片：inline onclick 與 #gift=CODE 的處理入口
  window.railCreateGift = railCreateGift;
  window.railCopyGiftLink = railCopyGiftLink;
  window.railClaimGift = railClaimGift;
  window.railGiftUrl = railGiftUrl;
  window.railState = function () {
    var drama = railDrama();
    var index = railIndex();
    var ep = railEpisode();
    return {
      visible: railVisible,
      pickerOpen: pickerOpen,
      pickerTab: pickerTab,
      pickerPage: pickerPage,
      shareOpen: shareOpen,
      shareTab: shareTab,
      speedOpen: speedOpen,
      settingsOpen: settingsOpen,
      commentsOpen: commentsOpen,
      commentsLoading: commentsLoading,
      commentsCount: commentsList.length,
      commentsError: commentsError,
      followCount: followCount,
      commentCount: commentCount,
      dramaId: lastDramaId,
      index: index,
      following: !!(drama && drama.id && typeof window.isFollowing === 'function' && window.isFollowing(drama.id)),
      followingKnown: !!(drama && drama.id && typeof window.isFollowingKnown === 'function' && window.isFollowingKnown(drama.id)),
      playable: railPlayable(ep, index, drama),
      canDownload: railPlayable(ep, index, drama),
      speed: currentRate(),
      member: giftMember,
      giftCode: giftCode,
      giftCodeDramaId: giftCodeDramaId,
      giftEpisodes: giftEpisodes,
      giftBusy: giftBusy,
      giftError: giftError,
      giftClaimed: giftClaimed,
      pendingGiftCode: pendingGiftCode,
      shareRewardClaimed: shareRewardClaimed,
      stageW: railLayout.stageW,
      stageH: railLayout.stageH,
      bodyLockCount: bodyLockCount,
      lastBodyOverflow: lastBodyOverflow,
      fullscreen: (typeof document !== 'undefined' && !!(document.fullscreenElement || document.webkitFullscreenElement)),
    };
  };

  // 頁面載入時就先掛好監聽（script 在 </body> 前載入，DOM 已就緒）；
  // 若這個宿主沒有那塊 DOM（Node harness），syncRail 之後會再試一次。
  /* 登入成功後續領贈送碼：使用者是從 #gift=CODE 的連結進來的，
     登入完不該還要他自己再點一次。doLogin 是 ui.js 的 async 函式
     （成功後會關掉登入框、更新畫面）。這裡刻意用區域包裝而不是
     wrapGlobalByName：那個 helper 的 switch 只管播放流程那五個函式。 */
  (function wrapDoLogin() {
    var original = window.doLogin;
    if (typeof original !== 'function') return;
    window.doLogin = async function () {
      var result = await original.apply(this, arguments);
      if (pendingGiftCode) {
        try { await railClaimGift(pendingGiftCode); } catch (e) { /* 領取失敗不影響登入結果 */ }
      }
      return result;
    };
  })();

  attemptWire();
  /* v7.6.2：chrome（頂列／操作列／底部列）**預設隱藏**（HTML 也帶了 hidden）；
     這裡再收一次是為了讓「上一輪留在畫面上的狀態」不可能殘留，也讓 harness 的
     載入後斷言有一致的起點。第一次點畫面就會全部出現。 */
  railHide();
  bootGiftFromHash();   // v7.6：帶著 #gift=CODE 進來就自動領取（未登入會先開登入框）
})();
