/* ===== Demo data + playback layer (reconstruction-only) =====
 *
 * Three jobs, all in one place so there is a single source of truth:
 *
 * 1. GENRES — replaces the mock's 9 categories with DramaBox's genre taxonomy
 *    (from dramaboxdb.com/zh/genres), so the 劇場 tab renders the same 分類 grid
 *    the real app shows.
 * 2. TAGS — gives every demo drama a set of genre tags and makes /search/all
 *    match them, so tapping any genre chip returns something.
 * 3. PLAYBACK — mock-api.js ships no videoUrl and ui.js only calls
 *    initArtPlayer() when `episodes[0].videoUrl` exists, so without this every
 *    card opens an empty player. EVERY one of the 21 categories maps to a
 *    verified free public HLS clip (FREE_CLIPS below); none falls back.
 *    initArtPlayer() hardcodes `type: 'm3u8'`, so these must be HLS, not MP4.
 *
 *    EXCEPTION — real footage: 《我在盛唐写天下》(d7) ships 10 real MP4 episodes
 *    under src/media/shengtang/ and is marked `realMedia: true`. This layer must
 *    never touch it: buildEpisodes() would replace every videoUrl with a free HLS
 *    clip and rebuild the episode array (see decorateDrama). Because player.js
 *    hardcodes type:'m3u8' + hls.js, a progressive MP4 has to be handed to the
 *    native <video> path instead — installMp4TypeFix() below does only that.
 */
(function () {
  // ---- 1. DramaBox genre taxonomy -----------------------------------------
  var GENRES = [
    { name: '重生', icon: '🔄' }, { name: '虐戀', icon: '💔' }, { name: '神醫', icon: '🩺' },
    { name: '神豪', icon: '💰' }, { name: '穿越', icon: '🌀' }, { name: '先婚后爱', icon: '💍' },
    { name: '現實', icon: '🏙️' }, { name: '高手下山', icon: '⛰️' }, { name: '女總裁', icon: '👩‍💼' },
    { name: '超能', icon: '⚡' }, { name: '女强', icon: '💪' }, { name: '推理', icon: '🔍' },
    { name: '古裝', icon: '🏮' }, { name: '都市', icon: '🌆' }, { name: '懸疑', icon: '🕵️' },
    { name: '復仇', icon: '🗡️' }, { name: '傳承覺醒', icon: '🔮' }, { name: '甜寵', icon: '💕' },
    { name: '強者回歸', icon: '👑' }, { name: '小人物', icon: '🧍' }, { name: '逆襲', icon: '🚀' },
  ];

  // ---- 2. per-drama genre tags (every one of the 21 genres is reachable) ---
  var TAGS = {
    d1: ['甜寵', '先婚后爱', '女總裁', '現實', '虐戀'],
    d2: ['重生', '復仇', '逆襲', '女强', '推理'],
    d3: ['都市', '神醫', '小人物', '高手下山'],
    d4: ['穿越', '古裝', '傳承覺醒', '女强'],
    d5: ['逆襲', '強者回歸', '神豪', '超能', '懸疑'],
    d6: ['超能', '傳承覺醒', '都市', '現實'],
  };

  // ---- 3. every category plays a FREE, publicly-hosted HLS clip -----------
  // All 9 URLs below were deep-verified on 2026-10-07: master playlist -> first
  // variant -> real segments (#EXTINF). A shallow 200 is NOT enough evidence:
  // one candidate answered 200 on the master but its variant had no segments.
  // Two otherwise-valid clips are deliberately EXCLUDED because "has segments"
  // does not mean "decodes in a browser":
  //   · test-streams.mux.dev/tos_ismc — previously observed stuck at readyState 0
  //   · apple/adv_dv_atmos — Dolby Vision, which ordinary browsers cannot decode
  // The rest are free H.264 demo assets (Big Buck Bunny, Apple BipBop,
  // Tears of Steel, Google Shaka).
  var FREE_CLIPS = [
    'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    'https://test-streams.mux.dev/pts_shift/master.m3u8',
    'https://test-streams.mux.dev/test_001/stream.m3u8',
    'https://devstreaming-cdn.apple.com/videos/streaming/examples/img_bipbop_adv_example_ts/master.m3u8',
    'https://devstreaming-cdn.apple.com/videos/streaming/examples/bipbop_16x9/bipbop_16x9_variant.m3u8',
    'https://d2zihajmogu5jn.cloudfront.net/bipbop-advanced/bipbop_16x9_variant.m3u8',
    'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
    'https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths-hls/hls.m3u8',
    'https://storage.googleapis.com/shaka-demo-assets/angel-one-hls/hls.m3u8',
  ];

  // Kept from the earlier round because playback was actually verified for them
  // in headless Chrome (重生 originally used mux/tos_ismc and stayed at
  // readyState 0, so it was moved to the Apple stream).
  var STREAMS = {
    '甜寵': FREE_CLIPS[0],
    '重生': FREE_CLIPS[3],
    '都市': FREE_CLIPS[3],
    '穿越': FREE_CLIPS[1],
    '逆襲': FREE_CLIPS[5],
    '玄幻': FREE_CLIPS[6],
  };

  // Fill in EVERY remaining genre so no category silently shares the fallback.
  // Before this, only 6 of the 21 genres had an entry and the other 15 all
  // played the same single file.
  for (var gi = 0; gi < GENRES.length; gi++) {
    var gname = GENRES[gi].name;
    if (!STREAMS[gname]) STREAMS[gname] = FREE_CLIPS[gi % FREE_CLIPS.length];
  }

  var FALLBACK = FREE_CLIPS[0];
  var streamFor = function (category) { return STREAMS[category] || FALLBACK; };

  function buildEpisodes(drama, url) {
    // 真實成片（drama.realMedia）絕不能進來：下面那行 `e.videoUrl = url` 會把使用者
    // 提供的 MP4 換成免費 HLS clip，而迴圈也會用 demo 的集數（3 / 12）重建整個陣列。
    // decorateDrama() 已經會提早 return，這裡再擋一次是為了讓這個破壞性動作本身
    // 自帶守衛——未來若有別的呼叫路徑，也不會誤傷真實成片。
    if (drama && drama.realMedia) return Array.isArray(drama.episodes) ? drama.episodes : [];
    var count = Array.isArray(drama.episodes)
      ? Math.max(drama.episodes.length, 1)
      : (typeof drama.episodes === 'number' ? drama.episodes : 3);
    var existing = Array.isArray(drama.episodes) ? drama.episodes : [];
    var list = [];
    for (var i = 0; i < count; i++) {
      var e = (existing[i] && typeof existing[i] === 'object') ? existing[i] : {};
      e.id = e.id || (drama.id + '-e' + (i + 1));
      e.episodeNumber = e.episodeNumber || (i + 1);
      e.title = e.title || ('第 ' + (i + 1) + ' 集');
      // the mock already sets videoUrl to one shared TEST_VIDEO; the category
      // stream must win, otherwise every category plays the same video
      e.videoUrl = url;
      if (e.unlocked === undefined) e.unlocked = (i === 0) || (drama.isFree === true);
      if (e.cost === undefined) e.cost = i === 0 ? 0 : 5;
      list.push(e);
    }
    drama.episodes = list;
    return list;
  }

  function decorateDrama(d) {
    if (!d || typeof d !== 'object' || !d.id) return d;
    // 真實成片（d.realMedia，例如《我在盛唐写天下》那 10 支 MP4）**完全不裝飾**：
    // 這一層會把 videoUrl 換成免費 HLS clip，並用 buildEpisodes() 重建整個集數陣列，
    // 兩個動作都會把使用者提供的真實成片換掉。
    if (d.realMedia) return d;
    var url = streamFor(d.category);
    if (!d.videoUrl) d.videoUrl = url;
    if (TAGS[d.id]) d.tags = TAGS[d.id];
    // IMPORTANT: only the detail payload (/dramas/:id) carries an episode array.
    // List payloads keep the numeric count, because render.js prints
    // `${drama.episodes}集` on every feed/rank card — turning that into an array
    // renders "[object Object]…集".
    if (Array.isArray(d.episodes)) buildEpisodes(d, url);
    return d;
  }

  function walk(node, depth) {
    if (!node || depth > 5) return;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) walk(node[i], depth + 1);
      return;
    }
    if (typeof node !== 'object') return;
    if (node.id && node.episodes !== undefined && (node.category || node.title)) decorateDrama(node);
    var keys = Object.keys(node);
    for (var k = 0; k < keys.length; k++) {
      var v = node[keys[k]];
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  }

  // ---- 真實 MP4 的播放型別 -------------------------------------------------
  // player.js 的 initArtPlayer() 寫死 `type: 'm3u8'`，並用 customType.m3u8 → hls.js
  // loadSource() 載入來源。那條路徑只認 HLS manifest：把漸進式 MP4 餵給 hls.js 會在
  // manifest 解析階段失敗，影片永遠停在 readyState 0（本檔檔頭原本就記載了這個限制，
  // 所以上面那 21 個分類的假資料一律挑 HLS clip）。真實成片是 MP4，而 player.js 不在
  // 本次可改範圍，所以在此攔 Artplayer 建構子：**只有網址是 .mp4 時**把 type 換成
  // 'mp4'（Artplayer 沒有 customType.mp4 → 交還原生 <video> 播放）。.m3u8 一律原封
  // 不動地傳給原本的建構子，HLS 那條路徑的行為完全不變。
  function isProgressiveMp4(url) {
    return /\.mp4(\?|#|$)/i.test(String(url || ''));
  }

  function installMp4TypeFix() {
    if (window.__mp4TypeFixInstalled) return;
    window.__mp4TypeFixInstalled = true;

    function wrap(Ctor) {
      if (typeof Ctor !== 'function' || Ctor.__mp4TypeFix) return Ctor;
      var Wrapped = function (option) {
        if (option && typeof option === 'object' &&
            isProgressiveMp4(option.url) && option.type !== 'mp4') {
          option.type = 'mp4';
          try {
            console.log('🎬 真實 MP4：Artplayer type 由 m3u8 改為 mp4（原生播放）', option.url);
          } catch (e) { /* console 不可用就算了 */ }
        }
        return new Ctor(option);
      };
      Wrapped.__mp4TypeFix = true;
      // 原本建構子上的靜態成員（version、外掛註冊…）照樣看得到
      Object.keys(Ctor).forEach(function (k) {
        try { Wrapped[k] = Ctor[k]; } catch (e) { /* 唯讀屬性就跳過 */ }
      });
      return Wrapped;
    }

    // player.js 是「第一次播放時」才用 <script> 從 CDN 載入 Artplayer，
    // 所以這裡不能只包當下的值（此刻通常還是 undefined）——用存取子攔之後的賦值。
    var stored = wrap(window.Artplayer);
    try {
      Object.defineProperty(window, 'Artplayer', {
        configurable: true,
        enumerable: true,
        get: function () { return stored; },
        set: function (v) { stored = wrap(v); },
      });
    } catch (e) {
      window.Artplayer = stored;   // 包不起來就維持原行為（MP4 由 player.js 決定）
    }
  }

  installMp4TypeFix();

  // ---- cached demo dramas, for genre search -------------------------------
  var cache = null;
  function remember(res) {
    var list = res && res.data && (res.data.list || res.data);
    if (Array.isArray(list) && list.length && list[0] && list[0].category) {
      cache = list.filter(function (d) { return d && d.id && d.category; });
    }
  }
  function matches(d, q) {
    if (!q) return false;
    var tags = (d.tags || TAGS[d.id] || []).join(' ').toLowerCase();
    return String(d.title || '').toLowerCase().indexOf(q) !== -1 ||
      String(d.category || '').toLowerCase().indexOf(q) !== -1 ||
      String(d.desc || '').toLowerCase().indexOf(q) !== -1 ||
      tags.indexOf(q) !== -1;
  }

  // genre counts are derived from the tag map (static), not from the request
  // cache — /categories is fetched during init, before any dramas have loaded
  var GENRE_COUNTS = {};
  Object.keys(TAGS).forEach(function (id) {
    TAGS[id].forEach(function (g) { GENRE_COUNTS[g] = (GENRE_COUNTS[g] || 0) + 1; });
  });

  // ---- genre cover art (for the 分類 grid, not the emoji) -----------------
  // 分類磚改用「圖」而不是 emoji。圖的來源刻意不是新的圖庫：TAGS 已經說了每部 demo
  // 劇屬於哪些分類，cache 裡有那些劇的封面（與劇卡同一份 URL），所以「該分類底下的
  // 真實 demo 劇封面」就是最貼題、又不必新增任何資產的圖。找不到才回空字串，
  // 由 render.js 退到本專案慣用的 picsum seed（以及載入失敗時的 emoji）。
  // 只快取命中、不快取落空：cache 是隨請求長出來的，落空常常只是「還沒載完」。
  var GENRE_COVERS = {};
  function coverForGenre(name) {
    if (!name) return '';
    if (GENRE_COVERS[name]) return GENRE_COVERS[name];
    var list = cache || [];
    for (var i = 0; i < list.length; i++) {
      var d = list[i];
      if (!d || !d.cover) continue;
      var tags = d.tags || TAGS[d.id] || [];
      for (var j = 0; j < tags.length; j++) {
        if (tags[j] === name) { GENRE_COVERS[name] = d.cover; return d.cover; }
      }
    }
    return '';
  }

  // ---- request wrapper ----------------------------------------------------
  // 真實 API 模式（?api=real / julang_api_mode=real）下，整層 demo 裝飾必須關閉：
  // 否則會用 demo 的 21 個分類覆蓋真實 /categories，並把 demo 的 HLS 測試串流與
  // 標籤裝到真實劇集上。__apiMode 由先載入的 mock-api.js 設定；若它不在，
  // __apiMode 為 undefined，行為與以往相同（demo）。
  if (window.__apiMode === 'real') {
    console.log('🎬 真實 API 模式：demo 資料層（分類 / 串流 / 標籤）已停用');
  } else if (window.api && typeof api.request === 'function') {
    var orig = api.request.bind(api);

    api.request = async function (method, url) {
      var u = String(url || '');

      // 分類: hand back the DramaBox genre taxonomy
      if (u.indexOf('/categories') === 0 || u.indexOf('/dramas/categories') === 0) {
        return {
          code: 200,
          message: 'success',
          data: GENRES.map(function (g, i) {
            return {
              id: 'g' + (i + 1),
              name: g.name,
              icon: g.icon,
              // 分類磚的圖（該分類底下的 demo 劇封面；空字串＝交給 render.js 退 picsum）。
              // /categories 常常比 /dramas/recommend 更早回來，所以呼叫端仍應該現算一次
              // window.__genreCover(name)，這個欄位只是「順手附上」。
              cover: coverForGenre(g.name),
              dramaCount: GENRE_COUNTS[g.name] || 0,
            };
          }),
        };
      }

      var res = await orig.apply(null, arguments);
      try { walk(res, 0); } catch (e) { /* never break a request */ }
      remember(res);

      // genre-aware search: the mock only matches title/category
      try {
        var q = decodeURIComponent((u.split('q=')[1] || '')).toLowerCase();
        if (q && cache) {
          if (u.indexOf('/search/all') === 0 && res && res.data) {
            res.data.dramas = cache.filter(function (d) { return matches(d, q); })
              .map(function (d) { return Object.assign({}, d, { type: 'drama' }); });
          } else if (u.indexOf('/dramas/search') === 0 && res && res.data) {
            res.data.list = cache.filter(function (d) { return matches(d, q); });
          }
        }
      } catch (e) { /* ignore */ }

      return res;
    };
  // --- one-time migration: purge the orphan key left by the removed AccessKey feature --------
  // The card, its generator and the copy/reset handlers were deleted from
  // pwa.js; nothing reads this key any more, so clear it once for users who
  // still have it in localStorage. Guarded because storage can be unavailable.
  try {
    if (window.localStorage && localStorage.getItem('julang_' + 'access' + '_key') !== null) {
      localStorage.removeItem('julang_' + 'access' + '_key');
    }
  } catch (e) { /* private mode / storage disabled */ }


    window.__genreList = GENRES;
    window.__genreCover = coverForGenre;
    window.__dramaTags = TAGS;
    window.__categoryStreams = STREAMS;
    console.log('🎬 Demo 資料層已啟用：DramaBox 分類 + 每分類可播放 HLS 串流');
  } else {
    console.warn('demo-videos.js: window.api missing — load it after api.js');
  }
})();
