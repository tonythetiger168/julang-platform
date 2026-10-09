/* ===== 播放器模塊 ===== */
// @ts-check

let artPlayer = null;
// 目前播放器用的型別（'m3u8' | 'mp4'）。selectEp 用它判斷「只換 URL 夠不夠」：
// 型別不同就必須重建播放器，否則 hls.js 會被餵到 MP4（或反之）而靜默不播。
let currentPlayerType = 'm3u8';
let currentDrama = null;
let currentEpIndex = 0;

/* ===== v7.3 付費牆（真實廣告 / 金幣解鎖）=====
 *
 * 後端契約（已凍結，前端照這個寫）：
 *   · GET /dramas/:id 與 GET /dramas/:id/episodes 的每一集多帶
 *     free / unlocked / locked（boolean）與 cost（金幣數）；**locked 時 videoUrl 是 null**，
 *     頂層多一個 freeEpisodes。兩個端點都掛 optional auth，所以帶 token 時 unlocked
 *     反映該用戶真正解鎖過的集數 —— 重新整理後仍然是對的。
 *   · POST /ads/watch { dramaId, episodeId } → 用廣告換該集解鎖（**不給幣**）；
 *     不帶這兩個欄位 → 原本的「看廣告拿幣」行為不變。
 *     超過每日上限或間隔太短 → HTTP 429，message 說明原因。
 *   · POST /coins/unlock { dramaId, episodeId } → 金幣解鎖。
 *
 * 政策（Google Play 廣告政策）：插頁／全螢幕廣告不得在內容開始時彈出。
 * 因此本檔**沒有任何**「進集數前自動播廣告」的路徑：
 *   · nextEp() / selectEp() 遇到鎖住的集數只會打開解鎖彈窗（純 UI，不碰廣告）。
 *   · 廣告覆蓋層只在使用者按下 #btn-unlock-ad（主動點擊）之後才出現，
 *     倒數期間不可略過，倒數結束才發獎勵。
 *
 * 政策數字不寫死：免費集數一律用伺服器回的 freeEpisodes、價格用每集的 cost；
 * 只有在伺服器沒給（舊後端 / 舊快取 / 離線）時才退回下面的常數，並且明確標成退路。
 */
const PAYWALL_FREE_EPISODES_FALLBACK = 5;   // 舊後端沒回 freeEpisodes 時的退路（＝重構前寫死的 5）
const PAYWALL_COST_FALLBACK_STANDARD = 5;   // 舊後端沒回 cost 時的退路（＝重構前寫死的 5）
const PAYWALL_COST_FALLBACK_PREMIUM = 8;    // ＝重構前 index >= 20 時寫死的 8
const PAYWALL_COST_PREMIUM_FROM_INDEX = 20;
const AD_REWARD_SECONDS = 10;               // rewarded 廣告倒數秒數（政策允許 5–15 秒）
const PLAYER_EPISODE_LIMIT = 20;            // 集數按鈕上限，與 ui.js 的 eps.slice(0, 20) 對齊

/* 播放中的劇：ui.js 的 openPlayer(id) 是實際入口，它寫的是 window.currentDrama；
 * 而本檔的 currentDrama 是 script 作用域的 let（兩者不是同一個綁定），
 * 所以一律透過這兩個存取器讀寫，避免付費牆「眼睛只看到 null」的沉默失效。 */
function playerDrama() {
  if (typeof window !== 'undefined' && window.currentDrama) return window.currentDrama;
  return currentDrama;
}
function setPlayerDrama(drama) {
  currentDrama = drama;
  if (typeof window !== 'undefined') window.currentDrama = drama;
  return drama;
}

// 免費集數：一律用伺服器回的 freeEpisodes（後端目前 5）
function freeEpisodeCount(drama) {
  const n = Number(drama && drama.freeEpisodes);
  if (Number.isFinite(n) && n >= 0) return n;
  return PAYWALL_FREE_EPISODES_FALLBACK;   // 舊後端沒給 → 退回舊值
}

// 這一集鎖住了嗎？以伺服器的 locked 為準，其次 free / unlocked，都沒有才退回「前 N 集免費」
function isEpisodeLocked(ep, index, drama) {
  if (!ep) return false;
  if (typeof ep.locked === 'boolean') return ep.locked;
  if (ep.free === true || ep.unlocked === true) return false;
  if (typeof ep.unlocked === 'boolean' || typeof ep.free === 'boolean') return true;
  return Number(index) >= freeEpisodeCount(drama);
}

// 這一集的金幣價：一律用伺服器回的 cost（免費集為 0）
function episodeCost(ep, index, drama) {
  const c = Number(ep && ep.cost);
  if (Number.isFinite(c) && c >= 0) return c;
  const premium = Number(index) >= PAYWALL_COST_PREMIUM_FROM_INDEX;
  return premium ? PAYWALL_COST_FALLBACK_PREMIUM : PAYWALL_COST_FALLBACK_STANDARD;
}

// 動態加載播放器庫（僅在首次播放時加載，減少首屏 80KB+）
let playerLibsLoaded = false;
async function loadPlayerLibs() {
  if (playerLibsLoaded) return;
  if (window.Artplayer && window.Hls) {
    playerLibsLoaded = true;
    return;
  }
  const loadScript = (url) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  await Promise.all([
    loadScript('https://cdn.jsdelivr.net/npm/artplayer@5.1.1/dist/artplayer.min.js'),
    loadScript('https://cdn.jsdelivr.net/npm/hls.js@1.5.8/dist/hls.min.js')
  ]);
  playerLibsLoaded = true;
}

/* ===== v7.4 播放區＝影片原生比例 =====
 *
 * 問題：容器以前固定 16:9（index.html 的 aspect-video），而 demo 的真實成片是直式
 * 720×1280（9:16，src/media/shengtang/ep01..ep10.mp4）—— 影片被硬塞進 16:9 的框裡，
 * 橫向被壓扁（失真），旁邊再留一大片黑邊。
 *
 * 做法：metadata 一到就讀 video.videoWidth / videoHeight，把比例寫成**容器上的 CSS
 * 變數**，由 styles.css 的 `#player-video` 規則消費：
 *     --jl-video-aspect : `720 / 1280`  → aspect-ratio（框＝影片比例）
 *     --jl-video-ratio  : `0.5625`       → max-width: calc(var(--jl-video-max-h) * ratio)
 * 為什麼是 CSS 變數而不是直接寫 element.style.aspectRatio / height：
 *   同一個 #player-video 節點會被 parkMiniPlayer() 搬進 #pip-card（迷你播放器）。
 *   inline 樣式會跟著節點搬過去，而 inline 一定贏過 id 選擇器 —— 縮圖的 16:9 就會被
 *   蓋掉。用變數的話，只有 `#player-video` 這條規則會消費它，
 *   `#pip-video-slot #player-video`（特異度更高）把 aspect-ratio / max-height /
 *   max-width 全部蓋回縮圖自己的值，所以迷你播放器完全不受影響。
 * 為什麼 max-width 也要跟著算：只設 max-height 的話，高度被夾住但寬度仍是 100%，
 * 框的比例就和影片不同了 → 影片被留在框內（又出現黑邊）。用**同一個** max-height
 * 變數乘上影片比例算出 max-width，框的比例永遠等於影片比例 → 不裁切、不變形。
 * 高度上限（--jl-video-max-h，styles.css 內 72vh／橫向 62vh）保證直式影片不會把
 * 下方的說明與集數方格擠出畫面（#player-modal 本身可捲動）。
 */
function setCssVar(el, name, value) {
  if (!el || !el.style || typeof el.style.setProperty !== 'function') return false;
  el.style.setProperty(name, value);
  return true;
}

// 把影片原生尺寸寫進容器的 CSS 變數；metadata 還沒到（0×0）時回 false
function applyVideoAspect(container, video) {
  if (!container || !video) return false;
  const w = Number(video.videoWidth);
  const h = Number(video.videoHeight);
  if (!(w > 0) || !(h > 0)) return false;
  setCssVar(container, '--jl-video-aspect', w + ' / ' + h);
  setCssVar(container, '--jl-video-ratio', String(w / h));
  if (container.dataset) container.dataset.videoSize = w + 'x' + h;
  return true;
}

// 換片前先把比例清掉，才不會拿上一集的框去顯示這一集的 poster
function clearVideoAspect(container) {
  if (!container || !container.style || typeof container.style.removeProperty !== 'function') return;
  container.style.removeProperty('--jl-video-aspect');
  container.style.removeProperty('--jl-video-ratio');
  if (container.dataset) delete container.dataset.videoSize;
}

/* 監聽 metadata。Artplayer 的 events 模組會把 <video> 的原生事件用
 * `video:<type>` 轉發出來（見 artplayer 的 eventsMix / config.events），
 * 所以 loadedmetadata 一定收得到；建立後再立刻試一次，換集重建播放器時若
 * metadata 已就緒就不必等下一個事件。 */
function watchNativeAspect(art, container) {
  const apply = () => {
    if (!art) return;
    const video = art.video
      || (container && typeof container.querySelector === 'function' ? container.querySelector('video') : null);
    applyVideoAspect(container, video);
    // v7.6：直式（9:16）→ 自動切到滿版沉浸模式（橫式／無 metadata 則維持原狀）
    try {
      const portrait = isPortraitVideo(video);
      applyImmersive(portrait);
      if (portrait) maybeAutoFullscreen();
    } catch (e) { /* 外框不該影響播放 */ }
    /* 比例／滿版都套用完，容器的比例才剛剛改變 —— 叫 Artplayer 用**新的**容器尺寸
       重算內層 .art-video-player 的 inline width。不做這件事它會停在 metadata 之前的
       舊高度算出來的值（真實 Chrome 實測：720×1280 被寫成 width:31.64% → 細長畫面）。 */
    resyncAutoSize(art, container);
  };
  if (typeof art.on === 'function') {
    art.on('video:loadedmetadata', apply);
    art.on('video:canplay', apply);   // 保險：極少數情況下 loadedmetadata 的時機不穩
  }
  apply();
}

/* ===== v7.6 直式（9:16）滿版沉浸模式 =====
 *
 * 使用者需求：「影片豎頻播放如果是 9:16，一進播放器就自動全螢幕／直式滿版。」
 *
 * metadata 一到就知道是不是直式（videoHeight > videoWidth）。是直式的話就對
 * #player-modal 加上 .player-immersive（styles.css）：容器 padding 歸零、播放區高度
 * 上限改成 100dvh、舊標題列與簡介不佔版面、頂列／底部列改成**覆蓋**在畫面上 →
 * 影片直接佔滿整個可視畫面。橫式片源、或 metadata 還沒到（0×0）都維持原本版面。
 *
 * 不裁切是刻意的：9:16 的片放到更高的螢幕上，contain 才是不變形、不裁切的選擇
 * （與 v7.4 的原生比例設計一致）；黑邊只會留在必要的一側。
 *
 * 原生全螢幕（maybeAutoFullscreen）：瀏覽器只允許在**使用者手勢**中進入原生全螢幕，
 * 而 metadata 是非同步事件（手勢早已失效），所以先檢查 navigator.userActivation.isActive，
 * 沒有就完全不呼叫 —— 不硬闯、不在 console 留錯誤。真正保證生效的是上面的 CSS 滿版；
 * 這一小段只是「手勢還熱著時」的加分項。 */
function isPortraitVideo(video) {
  const w = Number(video && video.videoWidth);
  const h = Number(video && video.videoHeight);
  return w > 0 && h > 0 && h > w;
}

/* 防禦性寫法：這個模組會被多個 Node DOM harness 載入（它們的 classList 不一定完整），
 * 拿不到就當「這個宿主沒有那塊 UI」，絕不讓它影響播放。 */
function applyImmersive(portrait) {
  const modal = document.getElementById('player-modal');
  if (!modal || !modal.classList) return false;
  try {
    if (portrait) {
      if (typeof modal.classList.add === 'function') modal.classList.add('player-immersive');
    } else if (typeof modal.classList.remove === 'function') {
      modal.classList.remove('player-immersive');
    }
  } catch (e) {
    return false;
  }
  return !!portrait;
}

/* Artplayer 的 autoSize 會在**容器還是舊高度**時就把內層 .art-video-player 的
 * inline width 算好，之後容器長高也不會自己重算。實測（真實 Chrome，d7 720×1280）：
 * metadata 一到，容器從預設 16:9 的 219px 變成 693px，但內層被寫死成
 * `width: 31.6406%`（= 219 × 0.5625 / 390）→ 直式成片被壓成一條 123px 的細畫面。
 * 這裡在比例／滿版套用之後強制它重算一次：先讀一次幾何觸發重排，再呼叫 autoSize()。
 * 沒有這個 API 的宿主（Node harness）直接跳過，不影響任何既有測試。 */
function resyncAutoSize(art, container) {
  if (!art || typeof art.autoSize !== 'function') return false;
  try {
    if (container && typeof container.getBoundingClientRect === 'function') container.getBoundingClientRect();
    art.autoSize();
    return true;
  } catch (e) {
    return false;
  }
}

/* window.artPlayer：對外永遠指向「現在還活著」的播放器實例。
 * 為什麼用 getter 而不是在每個 `artPlayer = null` 旁邊各補一行：module 內的 artPlayer
 * 是**頂層 let**，不會自動成為 window 的屬性（只有 var / 函式宣告會）→ window.artPlayer
 * 一直是 undefined，而 player-rail.js 的倍速正是靠它（讀 currentRate、寫 playbackRate）：
 *   讀不到 → 標籤永遠顯示 1×；寫不動 → 退回 changeSpeed() 依自己的順序亂跳
 *   （真實 Chrome 實測：選 1.5× 只會變成 1.25×，標籤還停在 1×）。
 * 用 getter 讀同一個 binding，destroy 之後自然變成 null，不必在三個地方各補一次
 * （漏一個就會留下已銷毀的實例）。setter 刻意保留可寫：rail-contract.js 這個 harness
 * 會自己指派 window.artPlayer，寫回去正好就是同一個 binding。 */
Object.defineProperty(window, 'artPlayer', {
  configurable: true,
  get: function () { return artPlayer; },
  set: function (v) { artPlayer = v; },
});

let autoFullscreenTried = false;

/* 一次「進入播放器」只評估一次：非同步事件（canplay 等）可能在稍後的使用者手勢中
 * 才被觸發，若每次都試就會變成「畫面突然全螢幕」的意外行為。 */
function maybeAutoFullscreen() {
  if (autoFullscreenTried) return false;
  autoFullscreenTried = true;
  try {
    const act = (typeof navigator !== 'undefined') && navigator.userActivation;
    if (!act || !act.isActive) return false;          // 沒有手勢 → 不可能成功，不呼叫
    if (typeof document !== 'undefined' &&
        (document.fullscreenElement || document.webkitFullscreenElement)) return false;
    if (!artPlayer) return false;
    artPlayer.fullscreen = true;                      // Artplayer 自己處理各瀏覽器 prefix
    return true;
  } catch (e) {
    return false;
  }
}

async function initArtPlayer(url, poster) {
  autoFullscreenTried = false;   // 每次開啟播放器重新評估「自動全螢幕」（見 maybeAutoFullscreen）
  await loadPlayerLibs(); // 確保庫已加載
  unparkMiniPlayer();     // 3.2: pull the video back out of the mini player card
  if (artPlayer) {
    artPlayer.destroy();
    artPlayer = null;
    window.artPlayer = null;
  }
  const container = document.getElementById('player-video');
  if (!container) return;
  container.innerHTML = '';
  clearVideoAspect(container);   // 換片：先回到預設比例，等新影片的 metadata
  currentPlayerType = /\.mp4(\?|$)/i.test(String(url)) ? 'mp4' : 'm3u8';
  artPlayer = new Artplayer({
    container: container,
    url: url,
    poster: poster,
    // 依副檔名決定型別：hls.js 只解析 M3U8 manifest，餵**漸進式 MP4** 會停在
    // readyState 0（真實成片 /media/shengtang/*.mp4 就是這種）。Artplayer 沒有
    // customType.mp4，所以 MP4 走原生 <video>（不給 type 也會依副檔名判斷，
    // 但明示比較不容易被未來的選項變更影響）。
    type: /\.mp4(\?|$)/i.test(String(url)) ? 'mp4' : 'm3u8',
    /* autoSize 在 Artplayer 5.1.1 是「使用者自己去呼叫 art.autoSize」的 mixin，
       選項本身沒有任何地方讀它（已核對 5.1.1 的 bundle）：把內層 .art-video-player
       縮成影片比例塞進容器，也就是留黑邊。留著 true 只是不改動既有選項；
       真正的尺寸由上面 v7.4 的容器比例負責（容器已等於影片比例時，那個 mixin
       算出來就是 100%×100%，即使未來版本開始自動呼叫也不會改變外觀）。 */
    autoSize: true,
    playbackRate: true,
    aspectRatio: true,
    pip: true,
    fullscreen: true,
    fullscreenWeb: true,
    miniProgressBar: true,
    setting: true,
    theme: CONFIG.player.theme,
    lang: CONFIG.player.lang,
    moreVideoAttr: {
      'webkit-playsinline': true,
      playsinline: true,
    },
    customType: {
      m3u8: function (video, url) {
        if (Hls.isSupported()) {
          const hls = new Hls();
          hls.loadSource(url);
          hls.attachMedia(video);
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
        }
      },
    },
  });
  /* v7.5/v7.6：把實例公開到 window。
     為什麼一定要：上面宣告的是 `let artPlayer`，而頂層 let **不會**成為 window 的屬性
     （只有 var / 函式宣告會），所以 `window.artPlayer` 一直是 undefined —— 而
     player-rail.js 的倍速正是靠 window.artPlayer（currentRate 讀 art.playbackRate、
     railSetSpeed 寫 art.playbackRate）：讀不到 → 標籤永遠顯示 1×；寫不動 → 退回
     changeSpeed() 依自己的順序亂跳（實測：選 1.5× 只會變成 1.25×）。
     公開之後 rail 與播放器看到的是同一個實例（rail-contract.js 是自己在 harness 裡
     補上這個變數才通過倍速檢查的，所以補在產品程式碼裡才對）。 */
  // window.artPlayer 由上面的 Object.defineProperty 提供（getter 讀同一個 artPlayer 綁定）
  // v7.4: 依影片原生比例調整播放區（見上面的長註解）
  watchNativeAspect(artPlayer, container);
}

function selectEp(index) {
  const drama = playerDrama();
  const eps = (drama && drama.episodes) || [];
  const ep = eps[index];
  if (!ep) return;
  // 付費牆：鎖住的集數不播放也不切換集數，只開解鎖彈窗。
  // 這裡只開彈窗，**不會**自動播廣告（見檔頭政策說明）。
  if (isEpisodeLocked(ep, index, drama)) {
    showUnlockModal(index, episodeCost(ep, index, drama));
    return;
  }
  currentEpIndex = index;
  if (typeof window !== 'undefined') window.currentEpIndex = index;
  renderEpisodeList();   // 高亮與鎖頭一律由伺服器狀態重畫
  if (ep.videoUrl && artPlayer) {
    // 型別不同時必須**重建**播放器：switchUrl() 只換 URL，不會把 hls.js 的
    // customType 換掉，所以 HLS clip ↔ 真實 MP4 之間切換會靜默失敗（readyState 0）。
    const wantType = /\.mp4(\?|$)/i.test(String(ep.videoUrl)) ? 'mp4' : 'm3u8';
    if (wantType !== currentPlayerType) {
      initArtPlayer(ep.videoUrl, (drama && drama.cover) || null);
      return;
    }
    artPlayer.switchUrl(ep.videoUrl);
  }
}

function prevEp() {
  if (currentEpIndex > 0) {
    selectEp(currentEpIndex - 1);
  }
}

function nextEp() {
  const drama = playerDrama();
  const eps = (drama && drama.episodes) || [];
  if (currentEpIndex < eps.length - 1) {
    const nextIndex = currentEpIndex + 1;
    const nextEpisode = eps[nextIndex];
    // v7.3: 要不要解鎖只看伺服器回的 locked / free（免費集數由 freeEpisodes 決定），
    // 不再寫死「前 5 集免費、8 幣」。注意：這裡只開解鎖彈窗，
    // 不會在使用者按下按鈕前播任何廣告。
    if (isEpisodeLocked(nextEpisode, nextIndex, drama)) {
      showUnlockModal(nextIndex, episodeCost(nextEpisode, nextIndex, drama));
      return;
    }
    selectEp(nextIndex);
  }
}

// ---------- 解鎖彈窗（v7.3：真的打後端）----------

function closeUnlockModal() {
  const modal = document.getElementById('unlock-modal');
  if (modal && typeof modal.remove === 'function') modal.remove();
}

// 把「可行動」的失敗訊息顯示在彈窗裡（金幣選項一律留在原位）
function showUnlockMessage(text) {
  const modal = document.getElementById('unlock-modal');
  if (!modal) return;
  const msg = modal.querySelector('#unlock-msg');
  if (msg) {
    msg.textContent = text;
    msg.classList.remove('hidden');
  }
  // 廣告走不通時，把「改用金幣」這個替代方案凸顯出來
  const coin = modal.querySelector('#btn-unlock-coin');
  if (coin && coin.classList) coin.classList.add('ring-2', 'ring-amber-400');
  showToast(text);
}

function setUnlockBusy(busy) {
  const modal = document.getElementById('unlock-modal');
  if (!modal) return;
  ['#btn-unlock-ad', '#btn-unlock-coin'].forEach((sel) => {
    const btn = modal.querySelector(sel);
    if (!btn) return;
    btn.disabled = !!busy;
    if (btn.classList) btn.classList.toggle('opacity-50', !!busy);
  });
}

/* 解鎖成功後：先標記本機狀態（樂觀），再重抓伺服器狀態拿回 videoUrl，
 * 最後才關彈窗並播放。
 * 為什麼一定要重抓：契約規定 locked 時 videoUrl 是 null，所以解鎖成功的那一刻
 * 本機手上根本沒有可播的 URL；而且重抓回來的 unlocked 才是「重新整理後仍解鎖」
 * 的唯一依據（伺服器狀態，不是本機旗標）。 */
function markEpisodeUnlocked(episodeIndex) {
  const drama = playerDrama();
  const ep = drama && drama.episodes && drama.episodes[episodeIndex];
  if (!ep) return;
  ep.unlocked = true;
  ep.locked = false;
}

async function refreshDramaFromServer() {
  const drama = playerDrama();
  if (!drama || !drama.id) return null;
  /* cache-buster 是刻意的：後端把 GET /dramas/:id 掛了 cache('drama', 300)
   * （api/middleware/cache.js），而快取鍵只有 URL、不含使用者，所以解鎖後立刻重抓
   * 很可能讀到解鎖前的舊回應（locked:true + videoUrl:null）→ 明明解鎖成功卻播不了。
   * 帶一個 query 參數就能拿到本人當下的狀態（Express 的 :id 不受 query 影響）。
   * 正解是後端把使用者納入快取鍵；在前端這邊這是唯一能保證正確的讀法。 */
  const res = await api.get('/dramas/' + drama.id + '?unlockAt=' + Date.now());
  if (res && res.code === 200 && res.data) {
    setPlayerDrama(res.data);   // 伺服器為準
    return res.data;
  }
  return null;   // 失敗就保留本機樂觀狀態，至少不會把已解鎖的集數鎖回去
}

// 目前這齣劇還有鎖住的集數嗎？（unlock.js 用它決定要不要補抓一次最新狀態）
function paywallHasLocked() {
  const drama = playerDrama();
  const eps = (drama && drama.episodes) || [];
  return eps.some((ep, i) => isEpisodeLocked(ep, i, drama));
}

async function afterUnlock(episodeIndex, method) {
  markEpisodeUnlocked(episodeIndex);
  await refreshDramaFromServer();
  closeUnlockModal();
  selectEp(episodeIndex);
  showToast(method === 'ad' ? '✅ 廣告觀看完畢，已解鎖本集' : '✅ 解鎖成功！');
  updateCoinDisplay();
}

// 失敗訊息要可行動：說清楚原因，並告訴使用者還能用幾枚硬幣解鎖
function adFailureMessage(res, cost) {
  const hint = cost > 0 ? `可改用 ${cost} 幣解鎖` : '請稍後再試';
  const raw = (res && res.message) || '';
  const code = res && res.code;
  if (code === 429) return `📺 ${raw || '廣告暫時無法觀看'}，${hint}`;
  if (code === 401 || code === 403) return `請先登入才能用廣告解鎖，${hint}`;
  return `📺 廣告暫時無法使用${raw ? '（' + raw + '）' : ''}，${hint}`;
}

/* 使用者主動觸發的 rewarded 廣告覆蓋層（回傳 Promise；倒數結束才 resolve）。
 *
 * 政策：這裡刻意不提供「略過」按鈕，倒數期間也關不掉 —— rewarded 廣告必須看完才給獎勵。
 * 這個函式**只會**在使用者按下解鎖彈窗的「觀看廣告免費解鎖」之後被呼叫；
 * 千萬不要在 openPlayer() / selectEp() / nextEp() 裡呼叫它：在內容開始前插全螢幕
 * 廣告違反 Google Play 政策（這也是重構前那條假路徑最危險的地方）。
 *
 * TODO（尚未完成）：接上真正的 rewarded 廣告 SDK（AdMob rewarded / 穿山甲 …）。
 * 接法是把這個函式換成 SDK 的 load + show + onUserEarnedReward 回調，外層流程不用改：
 * Promise resolve 就代表「獎勵可以發了」。目前是**應用內模擬**的倒數覆蓋層，
 * 並沒有真的播放任何廣告素材，也還沒有廣告平台的 server-side 驗籤。
 */
function showRewardedAd(options) {
  const requested = Number(options && options.seconds);
  const seconds = Math.max(5, Math.min(15, Number.isFinite(requested) ? requested : AD_REWARD_SECONDS));
  const episodeNumber = options && options.episodeNumber;
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'rewarded-ad-overlay';
    overlay.className = 'fixed inset-0 z-[400] flex flex-col items-center justify-center bg-black text-white';
    overlay.innerHTML = `
      <div class='w-full max-w-sm text-center px-6'>
        <p class='text-white/50 text-xs tracking-widest mb-3'>廣告</p>
        <div class='rounded-2xl bg-white/5 border border-white/10 h-48 flex flex-col items-center justify-center mb-4'>
          <div class='text-3xl mb-2'>📺</div>
          <p class='text-white/70 text-sm'>廣告播放中…</p>
          ${episodeNumber ? `<p class='text-white/40 text-xs mt-1'>看完即可解鎖第 ${episodeNumber} 集</p>` : ''}
        </div>
        <p class='text-amber-400 font-bold text-lg'>還有 <span id='ad-countdown'>${seconds}</span> 秒</p>
        <p class='text-white/40 text-xs mt-2'>倒數結束後自動發放獎勵（此廣告無法略過）</p>
      </div>`;
    // 沒有任何關閉／略過路徑；點擊也不做任何事（不會提前結束）
    overlay.onclick = (e) => { if (e && typeof e.stopPropagation === 'function') e.stopPropagation(); };
    document.body.appendChild(overlay);
    const label = overlay.querySelector('#ad-countdown');
    let left = seconds;
    const timer = setInterval(() => {
      left -= 1;
      if (left <= 0) {
        clearInterval(timer);
        if (typeof overlay.remove === 'function') overlay.remove();
        resolve(true);
        return;
      }
      if (label) label.textContent = String(left);
    }, 1000);
  });
}

// 「看廣告免費解鎖」：廣告看完 → 打後端換解鎖。獎勵發不發由伺服器說了算（429 = 不發）。
async function unlockEpisodeWithAd(episodeIndex) {
  const drama = playerDrama();
  const ep = drama && drama.episodes && drama.episodes[episodeIndex];
  if (!ep) return;
  const cost = episodeCost(ep, episodeIndex, drama);
  setUnlockBusy(true);
  await showRewardedAd({ seconds: AD_REWARD_SECONDS, episodeNumber: ep.episodeNumber });
  // retries: 0 —— 429 是「今天不能再看了」這種明確答覆，不是暫時性故障；
  // api.js 預設會對 429 指数退避重試兩次，那會讓使用者白等好幾秒才看到訊息。
  const res = await api.post('/ads/watch', { dramaId: drama.id, episodeId: ep.id }, { retries: 0 });
  const data = (res && res.data) || {};
  // 只認伺服器的 unlocked === true：舊後端若忽略 dramaId/episodeId 而回「看廣告拿幣」，
  // 這裡就不會誤把集數解鎖（那正是重構前「假裝看完廣告就解鎖」的錯誤）。
  if (res && res.code === 200 && data.unlocked === true) {
    await afterUnlock(episodeIndex, 'ad');
    return;
  }
  setUnlockBusy(false);
  showUnlockMessage(adFailureMessage(res, cost));
}

// 「使用硬幣解鎖」：走既有的 POST /coins/unlock
async function unlockEpisodeWithCoins(episodeIndex) {
  const drama = playerDrama();
  const ep = drama && drama.episodes && drama.episodes[episodeIndex];
  if (!ep) return;
  setUnlockBusy(true);
  const res = await api.post('/coins/unlock', { dramaId: drama.id, episodeId: ep.id });
  if (res && res.code === 200) {
    await afterUnlock(episodeIndex, 'coin');
    return;
  }
  setUnlockBusy(false);
  showUnlockMessage('❌ ' + ((res && res.message) || '解鎖失敗，請稍後再試'));
}

// v7.3: 解鎖確認彈窗（參考 DramaBox 改進版）。價格一律吃伺服器回的 cost。
function showUnlockModal(episodeIndex, cost) {
  const drama = playerDrama();
  const eps = (drama && drama.episodes) || [];
  const ep = eps[episodeIndex] || {};
  const fallback = episodeCost(ep, episodeIndex, drama);
  const price = Number(cost);
  const shown = Number.isFinite(price) && price >= 0 ? price : fallback;
  closeUnlockModal();   // 一次只留一個
  const modal = document.createElement('div');
  modal.id = 'unlock-modal';
  modal.className = 'fixed inset-0 z-[300] flex items-center justify-center bg-black/80 backdrop-blur-sm';
  modal.innerHTML = `
    <div class='bg-gray-900 border border-white/10 rounded-2xl max-w-sm w-[90%] p-6 shadow-2xl text-center'>
      <div class='text-4xl mb-3'>🔒</div>
      <h3 class='text-white font-bold text-lg mb-2'>解鎖第 ${Number(ep.episodeNumber) || episodeIndex + 1} 集</h3>
      <p class='text-white/60 text-sm mb-2'>本集需要 ${shown} 硬幣解鎖</p>
      <p id='unlock-msg' class='hidden text-rose-300 text-xs mb-3 leading-relaxed'></p>
      <div class='flex items-center justify-center gap-2 text-amber-400 font-bold text-lg mb-5'>
        <span>🪙</span><span>${shown}</span>
      </div>
      <div class='space-y-2'>
        <button id='btn-unlock-coin' class='w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-medium hover:opacity-90 transition'>使用硬幣解鎖（${shown}）</button>
        <button id='btn-unlock-ad' class='w-full py-3 rounded-xl bg-white/10 text-white/80 font-medium hover:bg-white/20 transition'>📺 觀看廣告免費解鎖</button>
        <button id='btn-unlock-cancel' class='w-full py-2.5 rounded-xl text-white/40 text-sm hover:text-white/60 transition'>稍後再看</button>
      </div>
    </div>`;
  document.body.appendChild(modal);

  const coinBtn = modal.querySelector('#btn-unlock-coin');
  const adBtn = modal.querySelector('#btn-unlock-ad');
  const cancelBtn = modal.querySelector('#btn-unlock-cancel');
  // 回傳 promise：瀏覽器不在乎，但讓流程可被 await（測試 / 後續擴充都用得到）
  if (coinBtn) coinBtn.onclick = () => unlockEpisodeWithCoins(episodeIndex);
  if (adBtn) adBtn.onclick = () => unlockEpisodeWithAd(episodeIndex);
  if (cancelBtn) cancelBtn.onclick = () => closeUnlockModal();
  modal.onclick = (e) => { if (e.target === modal) closeUnlockModal(); };
}

// v7.3: 更新硬幣顯示（優先用呼叫端已知的餘額，否則查 /coins/balance）
function updateCoinDisplay(knownCoins) {
  const paint = (coins) => {
    const amount = document.getElementById('coin-amount');
    if (amount) amount.textContent = coins;
    const total = document.getElementById('coin-count');
    if (total) total.textContent = coins;
  };
  const known = Number(knownCoins);
  if (Number.isFinite(known)) { paint(known); return; }
  if (!api.isLoggedIn()) return;
  api.get('/coins/balance').then((res) => {
    const coins = Number(res && res.data && res.data.coins);
    if (res && res.code === 200 && Number.isFinite(coins)) paint(coins);
  });
}

/* 3.2 mini player（PiP 縮圖）: closing the player parks the live video in
   #pip-card instead of destroying the Artplayer instance, so tapping the card
   can resume playback where it stopped. Returns false when the card is absent
   (partial DOM), letting closePlayer() fall back to a real teardown. */
function parkMiniPlayer() {
  const card = document.getElementById('pip-card');
  const slot = document.getElementById('pip-video-slot');
  const container = document.getElementById('player-video');
  if (!card || !slot || !container) return false;
  slot.appendChild(container); // moves the node; the player keeps its state
  const label = document.getElementById('pip-label');
  if (label) label.textContent = 'EP.' + ((currentEpIndex || 0) + 1);
  card.classList.remove('hidden');
  return true;
}

function unparkMiniPlayer() {
  const card = document.getElementById('pip-card');
  const home = document.getElementById('player-video-home');
  const container = document.getElementById('player-video');
  if (home && container) home.appendChild(container);
  if (card) card.classList.add('hidden');
}

function restorePlayer() {
  unparkMiniPlayer();
  document.getElementById('player-modal')?.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (artPlayer) {
    try { artPlayer.play(); } catch (e) {}
  }
}

function closePlayer() {
  document.getElementById('player-modal')?.classList.add('hidden');
  document.body.style.overflow = '';
  if (!artPlayer) return;
  // keep the instance alive so the viewer can resume from the mini player
  if (parkMiniPlayer()) {
    try { artPlayer.pause(); } catch (e) {}
    return;
  }
  artPlayer.destroy();
  artPlayer = null;
}

function togglePlay() {
  if (!artPlayer) return;
  artPlayer.toggle();
}

function toggleMute() {
  if (!artPlayer) return;
  artPlayer.muted = !artPlayer.muted;
}

function toggleFullscreen() {
  if (!artPlayer) return;
  artPlayer.fullscreen = !artPlayer.fullscreen;
}

function togglePip() {
  if (!artPlayer) return;
  artPlayer.pip = !artPlayer.pip;
}

function seekForward() {
  if (!artPlayer) return;
  artPlayer.currentTime += 10;
}

function seekBackward() {
  if (!artPlayer) return;
  artPlayer.currentTime -= 10;
}

function changeSpeed() {
  if (!artPlayer) return;
  const rates = [0.75, 1, 1.25, 1.5, 2];
  const next = rates[(rates.indexOf(artPlayer.playbackRate) + 1) % rates.length];
  artPlayer.playbackRate = next;
  showToast('倍速：' + next + 'x');
}

function openPlayer(drama) {
  setPlayerDrama(drama);
  currentEpIndex = 0;
  if (typeof window !== 'undefined') window.currentEpIndex = 0;
  document.getElementById('player-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const eps = (drama && drama.episodes) || [];
  initArtPlayer(eps[0]?.videoUrl, drama && drama.cover);
  renderEpisodeList();
}

/* 玩家開啟後（ui.js 的 openPlayer 拿到 /dramas/:id 之後）把**伺服器**的鎖定狀態套上 UI：
 * 用 free / unlocked / locked / freeEpisodes 重畫集數列，鎖住的集數顯示 🔒。
 * 重新整理後仍然正確，靠的就是這裡 —— 不再依賴任何本機旗標。
 * 由 src/js/unlock.js 在 ui.js 的 openPlayer 外層呼叫（本檔早於 ui.js 載入）。 */
function applyServerLockState() {
  const drama = playerDrama();
  if (!drama) return;
  const idx = Number(window.currentEpIndex);
  currentEpIndex = Number.isFinite(idx) && idx >= 0 ? idx : 0;
  window.currentEpIndex = currentEpIndex;
  renderEpisodeList();
}

// 集數列：鎖頭與高亮都從伺服器狀態算出來，不另外存旗標
function renderEpisodeList() {
  const list = document.getElementById('episode-list');
  if (!list) return;
  const drama = playerDrama();
  const eps = (drama && drama.episodes) || [];
  list.innerHTML = eps
    .slice(0, PLAYER_EPISODE_LIMIT)
    .map((ep, i) => {
      const locked = isEpisodeLocked(ep, i, drama);
      const active = i === currentEpIndex;
      const tone = active
        ? 'bg-rose-500 text-white'
        : (locked ? 'bg-white/5 text-white/40' : 'bg-white/10 text-white/70 hover:bg-white/20');
      // 固定小方格（48×48）。容器是 flex flex-wrap，所以格子會緊貼，
      // 不會像 grid-cols-5 那樣被 78px 的欄寬撐開。
      return `<button data-ep-index="${i}" data-locked="${locked ? '1' : '0'}" onclick="selectEp(${i})" class="w-12 h-12 shrink-0 rounded-xl ${tone} flex flex-col items-center justify-center text-sm font-medium transition">` +
        `<span>${ep.episodeNumber}</span>` +
        (locked ? `<span class="text-[10px] leading-none" aria-label="已鎖住" title="需要解鎖">🔒</span>` : '') +
        `</button>`;
    })
    .join('');
}

window.initArtPlayer = initArtPlayer;
window.selectEp = selectEp;
window.prevEp = prevEp;
window.nextEp = nextEp;
window.closePlayer = closePlayer;
window.restorePlayer = restorePlayer;
window.togglePlay = togglePlay;
window.toggleMute = toggleMute;
window.toggleFullscreen = toggleFullscreen;
window.togglePip = togglePip;
window.seekForward = seekForward;
window.seekBackward = seekBackward;
window.changeSpeed = changeSpeed;
window.openPlayer = openPlayer;
// v7.3 付費牆：給 unlock.js（ui.js 之後載入）與測試用的入口
window.applyServerLockState = applyServerLockState;
window.renderEpisodeList = renderEpisodeList;
window.showUnlockModal = showUnlockModal;
window.showRewardedAd = showRewardedAd;
window.isEpisodeLocked = isEpisodeLocked;
window.episodeCost = episodeCost;
window.freeEpisodeCount = freeEpisodeCount;
window.paywallHasLocked = paywallHasLocked;
window.refreshDramaFromServer = refreshDramaFromServer;
// v7.4 播放區原生比例：給 player-rail.js / 測試用的入口
window.applyVideoAspect = applyVideoAspect;
window.clearVideoAspect = clearVideoAspect;
window.watchNativeAspect = watchNativeAspect;
// v7.6 直式滿版：診斷／測試入口（Chrome 探針讀這個，不必猜 class 有沒有加上去）
window.playerImmersiveState = function () {
  const modal = document.getElementById('player-modal');
  return {
    immersive: !!(modal && modal.classList && typeof modal.classList.contains === 'function' &&
      modal.classList.contains('player-immersive')),
    autoFullscreenTried: autoFullscreenTried,
    portrait: isPortraitVideo(document.querySelector('#player-video video')),
    fullscreen: typeof document !== 'undefined' &&
      !!(document.fullscreenElement || document.webkitFullscreenElement),
  };
};
