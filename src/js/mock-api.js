// ===== v6.0 Demo 模式：Mock API =====
// @ts-check
// 覆寫 api.request，讓整個前端無需後端/資料庫即可完整體驗
// 演示漫劇分鏡圖、角色頭像均為真實 AI 生成資產

(function () {
  /* 分鏡圖 / 封面 / 角色頭像的來源。
   * 這裡原本是 assets/panels/ 與 assets/chars/，但那些「真實 AI 生成資產」已隨
   * 「AI 創作」功能一起移除，資料夾不存在 → 漫劇卡片封面、播放器每一格分鏡、
   * 角色頭像全部 404（實測：GET /assets/panels/cover.jpg → 404），畫面上就是破圖，
   * 而且因為圖片位址非空，comic-player 的「分鏡圖生成中」降級還永遠不會出現。
   * 改用本專案本來就在用的遠端佔位圖慣例（劇卡封面用 picsum seed、留言頭像用
   * dicebear）：不新增任何套件、不下載任何二進位檔。 */
  const coverImg = (seed) => `https://picsum.photos/seed/${seed}/720/1280`;
  const avatarImg = (name) => `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
  const TEST_VIDEO = 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

  // ---------- 演示數據 ----------
  const categories = [
    { id: 'c1', name: '都市', icon: '🏙️', dramaCount: 12 },
    { id: 'c2', name: '甜寵', icon: '💕', dramaCount: 18 },
    { id: 'c3', name: '重生', icon: '🔄', dramaCount: 9 },
    { id: 'c4', name: '玄幻', icon: '⚡', dramaCount: 15 },
    { id: 'c5', name: '穿越', icon: '🌀', dramaCount: 7 },
    { id: 'c6', name: '逆襲', icon: '👑', dramaCount: 21 },
    { id: 'c7', name: '職場', icon: '💼', dramaCount: 6 },
    { id: 'c8', name: '懸疑', icon: '🔍', dramaCount: 8 },
    { id: 'c9', name: '古裝', icon: '🏮', dramaCount: 11 },
  ];

  const dramas = [
    { id: 'd1', title: '霸道總裁愛上我', desc: '平凡女孩意外闖入總裁生活，展開一段甜寵愛情故事', cover: 'https://picsum.photos/seed/jld1/400/600', category: '甜寵', episodes: 12, views: '2.3億', rating: 9.2, isFree: false, pricePerEp: 5 },
    { id: 'd2', title: '重生之復仇女王', desc: '前世被陷害致死，重生歸來誓要讓所有人付出代價', cover: 'https://picsum.photos/seed/jld2/400/600', category: '重生', episodes: 12, views: '1.8億', rating: 9.0, isFree: false, pricePerEp: 5 },
    { id: 'd3', title: '都市神醫', desc: '隱世神醫下山歷練，憑藉絕世醫術縱橫都市', cover: 'https://picsum.photos/seed/jld3/400/600', category: '都市', episodes: 12, views: '3.1億', rating: 8.8, isFree: false, pricePerEp: 5 },
    { id: 'd4', title: '穿越之嫡女歸來', desc: '現代女醫生穿越古代，成為相府嫡女，開啟逆襲人生', cover: 'https://picsum.photos/seed/jld4/400/600', category: '穿越', episodes: 12, views: '1.5億', rating: 9.1, isFree: false, pricePerEp: 5 },
    { id: 'd5', title: '龍王贅婿', desc: '隱藏身份的龍王入贅豪門，被看不起的他終於展露真實實力', cover: 'https://picsum.photos/seed/jld5/400/600', category: '逆襲', episodes: 12, views: '4.2億', rating: 8.5, isFree: false, pricePerEp: 5 },
    // 保留一齣「整齣免費」的劇，demo 才看得到 free 那條路徑（全劇 unlocked、cost 0）
    { id: 'd6', title: '仙尊歸來', desc: '修仙萬年歸來，發現地球已過百年，曾經的愛人已白髮蒼蒼', cover: 'https://picsum.photos/seed/jld6/400/600', category: '玄幻', episodes: 12, views: '2.8億', rating: 9.3, isFree: true, pricePerEp: 0 },
    /* 使用者提供的 10 支真實成片：來源檔已複製成 ASCII 檔名 ep01.mp4 … ep10.mp4
     * （src/media/shengtang/）。刻意用 ASCII：《》／空白／CJK 會讓 URL 需要編碼，
     * demo 的相對路徑最容易在這裡出錯。
     *
     * · episodes 是 10 個物件的陣列，每一集自帶 id / episodeNumber / title / videoUrl，
     *   資料本身就是這一齣劇的完整清單（不必靠 mediaDir 之類的規則去猜檔名）。
     * · realMedia:true 是給 demo-videos.js 的守衛看的：那一層會把每集的 videoUrl
     *   換成免費 HLS clip（e.videoUrl = url）並重建集數，真實 MP4 絕不能被換掉。
     * · 10 > FREE_EPISODES(5)，所以第 6 集起由付費牆鎖住、videoUrl 發送時為 null
     *   ——這齣劇因此同時是付費牆的**真實**展示案例（其他 mock 劇只有 12 集假資料）。
     */
    {
      id: 'd7', title: '我在盛唐写天下', desc: '穿越盛唐，一筆一畫改寫天下棋局；從落魄書生到權傾朝野，步步驚心。',
      cover: 'https://picsum.photos/seed/jld7/400/600', category: '穿越',
      views: '126萬', rating: 9.6, isFree: false, pricePerEp: 5, totalEpisodes: 10, realMedia: true,
      episodes: [
        { id: 'd7-e1', episodeNumber: 1, title: '第1集', videoUrl: '/media/shengtang/ep01.mp4' },
        { id: 'd7-e2', episodeNumber: 2, title: '第2集', videoUrl: '/media/shengtang/ep02.mp4' },
        { id: 'd7-e3', episodeNumber: 3, title: '第3集', videoUrl: '/media/shengtang/ep03.mp4' },
        { id: 'd7-e4', episodeNumber: 4, title: '第4集', videoUrl: '/media/shengtang/ep04.mp4' },
        { id: 'd7-e5', episodeNumber: 5, title: '第5集', videoUrl: '/media/shengtang/ep05.mp4' },
        { id: 'd7-e6', episodeNumber: 6, title: '第6集', videoUrl: '/media/shengtang/ep06.mp4' },
        { id: 'd7-e7', episodeNumber: 7, title: '第7集', videoUrl: '/media/shengtang/ep07.mp4' },
        { id: 'd7-e8', episodeNumber: 8, title: '第8集', videoUrl: '/media/shengtang/ep08.mp4' },
        { id: 'd7-e9', episodeNumber: 9, title: '第9集', videoUrl: '/media/shengtang/ep09.mp4' },
        { id: 'd7-e10', episodeNumber: 10, title: '終章', videoUrl: '/media/shengtang/ep10.mp4' },
      ],
    },
  ];

  /* ---------- v7.3 付費牆狀態（demo 的「伺服器狀態」）----------
   * demo 模式也必須看得見付費牆，而且解鎖要能跨呼叫維持（模擬真的伺服器寫入）。
   * 形狀與 api/controllers/dramaController.js 的 toEpisode()、adController.js 的
   * watchAd()、coinController.js 的 unlockEpisode() 對齊；常數也刻意取同值，
   * 避免「demo 說 5 集、後端說 3 集」的漂移。（_julang-analysis/paywalltest.js 會比對）
   */
  const FREE_EPISODES = 5;              // = dramaController.FREE_EPISODES
  const DEMO_EPISODE_COUNT = 12;        // > FREE_EPISODES，預覽才看得到付費牆
  const AD_DAILY_LIMIT = 15;            // = adController.DAILY_AD_LIMIT
  const AD_REWARD = 2;                  // = adController.AD_REWARD
  const AD_MIN_INTERVAL_MS = 10 * 1000; // = adController.MIN_WATCH_INTERVAL_MS
  const paywall = {
    unlocked: new Set(),   // 'dramaId:episodeId' —— 廣告 / 金幣解鎖過的集數
    coins: 8888,
    adWatchedToday: 0,
    lastAdAt: 0,
  };

  /* v7.4 追劇狀態（demo 的「伺服器狀態」）
   * 後端 POST /dramas/:id/follow 是 toggle，回 { following, dramaId }；
   * GET /user/follows 回真正的清單（userController.getFollows）。
   * 這裡以前固定回 { followed: true }、清單永遠是 [] —— 在 demo 裡「取消追劇」不可能
   * 發生，播放器右側操作列的收藏鈕（與首頁卡片上的愛心）就無法驗證狀態。
   * 補上可切換的狀態，形狀與後端對齊。 */
  const follows = new Set();   // dramaId

  const COMIC_ID = 'demo-comic-001';

  // Demo 漫劇（可編輯狀態，畫布編輯器直接操作此對象）
  const demoComic = {
    id: COMIC_ID,
    title: '逆襲：命運重啟',
    desc: 'AI 生成演示漫劇：被逐出家門的少女三年後華麗歸來，在豪門宴會上展開復仇。分鏡圖為遠端示範佔位圖。',
    cover: coverImg('jlcomic-cover'),
    category: '逆襲',
    artStyle: 'anime',
    theme: '豪門逆襲復仇',
    views: '125萬',
    rating: 9.4,
    likes: 12800,
    remixCount: 326,
    remixOfId: null,
    characters: [
      { id: 'ch1', name: '林晚', role: '主角', persona: '堅韌隱忍，逆襲復仇', avatar: avatarImg('林晚'), voiceId: 'alloy' },
      { id: 'ch2', name: '顧沉', role: '配角', persona: '身份神秘的守護者', avatar: avatarImg('顧沉'), voiceId: 'onyx' },
    ],
    episodes: [{
      id: 'ep1', episodeNumber: 1, title: '第1集 命運轉折', duration: 25, status: 'published',
      panels: [
        { id: 'p1', panelNumber: 1, imageUrl: coverImg('jlcomic-e1p1'), shotType: 'wide', transition: 'fade', speaker: '', dialogue: '三年前，我被趕出家門，身無分文。', duration: 4, voiceUrl: null },
        { id: 'p2', panelNumber: 2, imageUrl: coverImg('jlcomic-e1p2'), shotType: 'close', transition: 'zoom', speaker: '林晚', dialogue: '我發誓，總有一天要讓他們後悔！', duration: 4, voiceUrl: null },
        { id: 'p3', panelNumber: 3, imageUrl: coverImg('jlcomic-e1p3'), shotType: 'medium', transition: 'slide', speaker: '顧沉', dialogue: '這位小姐，我們又見面了。', duration: 4, voiceUrl: null },
        { id: 'p4', panelNumber: 4, imageUrl: coverImg('jlcomic-e1p4'), shotType: 'medium', transition: 'fade', speaker: '林晚', dialogue: '是你？當年那個救我的人……', duration: 4, voiceUrl: null },
        { id: 'p5', panelNumber: 5, imageUrl: coverImg('jlcomic-e1p5'), shotType: 'close', transition: 'zoom', speaker: '顧沉', dialogue: '從今天起，我來護你周全。', duration: 4, voiceUrl: null },
        { id: 'p6', panelNumber: 6, imageUrl: coverImg('jlcomic-e1p6'), shotType: 'full', transition: 'fade', speaker: '', dialogue: '這一次，命運由我自己改寫。', duration: 5, voiceUrl: null },
      ],
    }],
  };

  // 社區作品（含兩部其他畫風的演示作品）
  const communityWorks = [
    { id: COMIC_ID, title: demoComic.title, desc: demoComic.desc, cover: demoComic.cover, category: '逆襲', artStyle: 'anime', episodes: 1, views: '125萬', likes: 12800, remixCount: 326, remixOfId: null, characters: demoComic.characters, createdAt: '2026-08-20T10:00:00Z' },
    { id: 'demo-comic-002', title: '劍來：雪中行', desc: '水墨國風漫劇：落魄劍客一劍破萬法，江湖夜雨十年燈。', cover: coverImg('jlwork-ink'), category: '玄幻', artStyle: 'ink', episodes: 2, views: '86萬', likes: 9600, remixCount: 210, remixOfId: null, characters: [], createdAt: '2026-08-21T08:00:00Z' },
    { id: 'demo-comic-003', title: '小廚娘的魔法廚房', desc: 'Q版萌系漫劇：會魔法的小廚娘，用甜點治癒整座城市。', cover: coverImg('jlwork-chibi'), category: '甜寵', artStyle: 'chibi', episodes: 1, views: '52萬', likes: 7400, remixCount: 158, remixOfId: null, characters: [], createdAt: '2026-08-22T06:00:00Z' },
  ];

  let myFavs = [];

  // v6.0 深化：評論數據（演示）
  let commentSeq = 100;
  const comments = {
    [COMIC_ID]: [
      { id: 'cm1', content: '林晚的眼神戲太絕了，AI 分鏡一致性做得真好！', nickname: '劇迷小風', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=小風', createdAt: '2026-08-21T14:20:00Z', mine: false },
      { id: 'cm2', content: '水墨風格什麼時候出第二季？', nickname: '夜雨聲煩', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=夜雨', createdAt: '2026-08-22T09:05:00Z', mine: false },
    ],
  };

  // v6.0 深化：分鏡撤銷堆疊工具
  function pushPanelHistory(p) {
    p.history = Array.isArray(p.history) ? p.history.slice(-9) : [];
    p.history.push({
      imageUrl: p.imageUrl, imagePrompt: p.imagePrompt, dialogue: p.dialogue,
      speaker: p.speaker, shotType: p.shotType, transition: p.transition, duration: p.duration,
      at: new Date().toISOString(),
    });
  }

  // 非演示漫劇的詳情（用占位圖即興生成）
  function demoWorkflow() {
    return [
      { icon: '📝', step: '文本節點', detail: '輸入創意一句話：豪門棄女重生歸來，手撕白蓮花。' },
      { icon: '🎬', step: '腳本節點 · 分鏡腳本表', detail: '劇本拆成 6 行分鏡（時長 / 畫面 / 角色 / 景別 / 運鏡）。' },
      { icon: '🖼️', step: '批量出圖 · Seedream 5.0', detail: '一鍵 6 格分鏡圖，角色一致性鎖定（林晚 / 顧沉）。' },
      { icon: '🎛️', step: '導演台定機位', detail: '正面機位 + 中景為主，情緒點切特寫推鏡頭。' },
      { icon: '🎵', step: '配音 · Eleven V3', detail: '對白 TTS 合成，語速 1.1x，情緒：隱忍→爆發。' },
      { icon: '🎞', step: '時間軸合成', detail: '6 段視頻 + 配音軌合成導出，總長 25s。' },
    ];
  }

  function workDetail(id) {
    const w = communityWorks.find(x => x.id === id);
    if (!w) return null;
    if (id === COMIC_ID) {
      return {
        ...demoComic, commentCount: (comments[COMIC_ID] || []).length,
        creatorName: '星辰劇場',
        workflow: demoWorkflow(),
        episodes: demoComic.episodes.map(ep => ({
          episodeNumber: ep.episodeNumber, title: ep.title,
          panels: ep.panels.map(p => ({ id: p.id, panelNumber: p.panelNumber, imageUrl: p.imageUrl, dialogue: p.dialogue, speaker: p.speaker, shotType: p.shotType, transition: p.transition, duration: p.duration })),
        })),
      };
    }
    return {
      ...w, commentCount: (comments[id] || []).length, creatorName: 'AI 創作者',
      characters: w.characters || [],
      workflow: demoWorkflow(),
      // 集數依 communityWorks 宣告的集數產生。以前不管宣告幾集都只生 1 集，
      // 於是社群卡片寫「2集」、播放器只有 1 集可以點——同一筆資料自己打自己。
      episodes: Array.from({ length: Math.max(1, w.episodes || 1) }, (_, i) => ({
        episodeNumber: i + 1, title: `第${i + 1}集`,
        panels: [1, 2, 3, 4, 5, 6].map(n => ({
          id: `${id}-e${i + 1}p${n}`, panelNumber: n,
          imageUrl: `https://picsum.photos/seed/${id}e${i + 1}p${n}/720/1280`,
          dialogue: `（${w.title}）第 ${i + 1} 集第 ${n} 格演示分鏡`, speaker: '', shotType: 'medium', transition: 'fade', duration: 4,
        })),
      })),
    };
  }

  // ---------- 漫劇：清單 / 詳情 / 分集 ----------
  // 舊版三條漫劇路由都無視路徑上的 id，任何一本漫劇都回 demoComic 的標題與分鏡：
  // 從「靈感社區」點 demo-comic-002 / 003 的「▶ 立即播放」，看到的其實是 001。
  // 這裡一律按 id 查（查不到回 __notFound，由 api.request 轉成 404）。
  function comicWork(id) { return communityWorks.find(w => w.id === id) || null; }

  function comicEpisodes(id) {
    if (id === COMIC_ID) {
      return demoComic.episodes.map(e => ({
        id: e.id, episodeNumber: e.episodeNumber, title: e.title,
        duration: e.duration, status: e.status,
      }));
    }
    const detail = workDetail(id);
    if (!detail) return [];
    return detail.episodes.map(e => ({
      id: `${id}-ep${e.episodeNumber}`, episodeNumber: e.episodeNumber, title: e.title,
      duration: (e.panels[0] && e.panels[0].duration) || 25, status: 'published',
    }));
  }

  function comicDetail(id) {
    const w = comicWork(id);
    if (!w) return null;
    const episodes = comicEpisodes(id);
    if (id === COMIC_ID) return { ...demoComic, episodes };
    return { ...workDetail(id), episodes };
  }

  // 播放器要的每集形狀：{episodeId, episodeNumber, title, duration, panels:[{n,image,shot,
  // transition,dialogue,speaker,voice,duration}]}（欄位名與舊版一致，comic-player.js 沒改）
  function comicEpisode(id, n) {
    if (id === COMIC_ID) {
      const ep = demoComic.episodes.find(e => e.episodeNumber === n) || demoComic.episodes[0];
      return {
        episodeId: ep.id, episodeNumber: ep.episodeNumber, title: ep.title, duration: ep.duration,
        panels: ep.panels.map(p => ({
          n: p.panelNumber, image: p.imageUrl, shot: p.shotType, transition: p.transition,
          dialogue: p.dialogue, speaker: p.speaker, voice: p.voiceUrl, duration: p.duration,
        })),
      };
    }
    const detail = workDetail(id);
    if (!detail) return null;
    const ep = detail.episodes.find(e => e.episodeNumber === n) || detail.episodes[0];
    return {
      episodeId: `${id}-ep${ep.episodeNumber}`, episodeNumber: ep.episodeNumber, title: ep.title,
      duration: (ep.panels[0] && ep.panels[0].duration) || 25,
      panels: ep.panels.map(p => ({
        n: p.panelNumber, image: p.imageUrl, shot: p.shotType, transition: p.transition,
        dialogue: p.dialogue, speaker: p.speaker, voice: null, duration: p.duration,
      })),
    };
  }

  // ---------- 模擬 AI 生成任務 ----------
  const SIM_DURATION = 36000;
  const SIM_STAGES = [
    [2, '初始化生成任務'], [5, 'AI 正在創作劇本...'], [18, '劇本就緒：《逆襲：命運重啟》'],
    [25, '漫劇檔案已建立'], [30, '繪製分鏡 1/6...'], [38, '繪製分鏡 2/6...'], [46, '繪製分鏡 3/6...'],
    [54, '繪製分鏡 4/6...'], [62, '繪製分鏡 5/6...'], [68, '繪製分鏡 6/6...'],
    [72, '合成配音 1/6...'], [78, '合成配音 3/6...'], [84, '合成配音 6/6...'],
    [90, '生成封面與收尾...'], [96, '寫入資料庫...'],
  ];
  let simTask = null;

  function simProgress() {
    if (!simTask) return null;
    const elapsed = Date.now() - simTask.start;
    const progress = Math.min(100, Math.round((elapsed / SIM_DURATION) * 100));
    let stage = '排隊中...';
    for (const [p, s] of SIM_STAGES) if (progress >= p) stage = s;
    const done = progress >= 100;
    return {
      id: simTask.id,
      status: done ? 'success' : (progress < 5 ? 'pending' : 'processing'),
      progress, stage,
      comicId: done ? COMIC_ID : null,
      output: done ? { comicId: COMIC_ID, title: '逆襲：命運重啟', episodes: 1, panels: 6 } : null,
    };
  }

  function findPanel(panelId) {
    for (const ep of demoComic.episodes) {
      const p = ep.panels.find(x => x.id === panelId);
      if (p) return p;
    }
    return null;
  }

  // ---------- v7.3 付費牆：demo 端的每集形狀 ----------
  // 與後端 dramaController.toEpisode() 同形狀：
  //   free = 整齣免費或集數落在前 FREE_EPISODES 集；unlocked = free 或使用者解鎖過；
  //   locked = !unlocked；cost = free ? 0 : pricePerEp；locked 時 videoUrl = null。
  function demoEpisodeCost(drama) {
    const p = Number(drama && drama.pricePerEp);
    return Number.isFinite(p) && p >= 0 ? p : 5;
  }

  // 集數來源：真實成片自帶 episodes 陣列（長度即集數，d7 = 10 集）；
  // 其餘 demo 劇沒有陣列，維持原本的 DEMO_EPISODE_COUNT。
  function demoEpisodeCount(drama) {
    const list = drama && drama.episodes;
    if (Array.isArray(list) && list.length) return list.length;
    const n = drama && drama.totalEpisodes;
    if (typeof n === 'number' && n > 0) return n;
    return DEMO_EPISODE_COUNT;
  }

  // 真實成片在資料上就寫好每集的 id / 標題 / 自己的 MP4，這裡照抄；
  // 找不到（其他 demo 劇）回 null，走原本的產生路徑。
  function demoEpisodeSource(drama, n) {
    const list = drama && drama.episodes;
    if (!Array.isArray(list)) return null;
    for (const e of list) if (e && e.episodeNumber === n) return e;
    return list[n - 1] || null;
  }

  function demoEpisodeState(drama, n) {
    const src = demoEpisodeSource(drama, n);
    const id = (src && src.id) || (drama.id + '-e' + n);
    const free = drama.isFree === true || n <= FREE_EPISODES;
    const unlocked = free || paywall.unlocked.has(drama.id + ':' + id);
    return {
      id,
      episodeNumber: n,
      title: (src && src.title) || ('第' + n + '集'),
      duration: 320,
      free: !!free,
      unlocked: !!unlocked,
      locked: !unlocked,
      cost: free ? 0 : demoEpisodeCost(drama),
    };
  }

  // 每集的播放位址：真實成片用資料上寫好的那支 MP4（/media/shengtang/epNN.mp4）；
  // 其他 demo 劇共用 TEST_VIDEO。
  function demoEpisodeUrl(drama, n) {
    const src = demoEpisodeSource(drama, n);
    if (src && src.videoUrl) return src.videoUrl;
    return TEST_VIDEO;
  }

  // 用「受控 getter + 吞掉寫入的 setter」發出去，理由有兩個：
  //   · 鎖住的集數：契約要求 videoUrl === null
  //   · 真實成片：demo-videos.js 的裝飾層會無條件 `e.videoUrl = url`，會把真 MP4 換成免費 clip
  // （不用 Object.freeze，避免嚴格模式下寫入丟錯）
  function demoEpisodePayload(drama, n) {
    const ep = demoEpisodeState(drama, n);
    ep.videoUrl = demoEpisodeUrl(drama, n);
    const realMedia = !!(drama && drama.realMedia);
    if (ep.locked || realMedia) {
      const value = ep.videoUrl;
      Object.defineProperty(ep, 'videoUrl', {
        get() { return ep.locked ? null : value; },
        set() { /* 契約：鎖住就沒有播放位址；真實成片不接受覆寫 */ },
        enumerable: true,
        configurable: true,
      });
    }
    return ep;
  }

  function demoEpisodes(drama) {
    const out = [];
    const count = demoEpisodeCount(drama);
    for (let n = 1; n <= count; n++) out.push(demoEpisodePayload(drama, n));
    return out;
  }

  function findDemoEpisode(dramaId, episodeId) {
    const drama = dramas.find(x => x.id === dramaId);
    if (!drama || !episodeId) return null;
    const count = demoEpisodeCount(drama);
    for (let n = 1; n <= count; n++) {
      const st = demoEpisodeState(drama, n);
      if (st.id === episodeId) return { drama, state: st };
    }
    return null;
  }

  // /dramas/:id 可能帶 query（前端解鎖後會用 ?unlockAt=… 穿過回應快取），
  // 這裡把 query 去掉才是真正的 id（Express 的 :id 也不含 query）
  function dramaIdFromUrl(url) {
    return String(url || '').split('/')[2].split('?')[0];
  }

  // 列表 payload 只給「集數」（數字）：render.js / ui.js / v61.js 都直接印
  // `${drama.episodes}集`，真實成片的 episodes 是 10 個物件的陣列，原樣送出去
  // 會變成 "[object Object]…集"。集數陣列只出現在詳情（/dramas/:id、…/episodes）。
  function listDrama(d) {
    return { ...d, episodes: demoEpisodeCount(d) };
  }

  // ---------- 路由 ----------
  function route(method, url, body) {
    // ===== 漫劇（v5.0，原本掛在 /ai/comics） =====
    // 只有這三條是還在用的漫劇路由；下面其餘 /ai/* 是已移除的「AI 創作」套件留下的
    // mock 端資料，前端已經沒有任何呼叫端（保留是為了不擴大這次的改動範圍）。
    if (url.startsWith('/comics/') && url.includes('/episodes/')) {
      const parts = url.split('/');            // ['', 'comics', ':id', 'episodes', ':n']
      const ep = comicEpisode(parts[2], parseInt(parts[4], 10) || 1);
      if (!ep) return { __notFound: true };
      return ep;
    }
    if (url.startsWith('/comics/')) {
      const detail = comicDetail(url.split('?')[0].split('/')[2]);
      if (!detail) return { __notFound: true };
      return detail;
    }
    // 漫劇分頁的清單。路徑刻意不再是 /ai/comics：「AI 創作」那組功能已從前端移除，
    // 漫劇留下來卻還借道 AI 的命名，讀起來像沒拆乾淨的耦合（後端也已經沒有 /ai/*）。
    if (url.startsWith('/comics')) {
      return { total: 1, page: 1, list: [{ ...demoComic, episodes: comicEpisodes(COMIC_ID).length }] };
    }
    if (method === 'POST' && url === '/ai/tasks') {
      simTask = { id: 'sim-' + Date.now(), start: Date.now() };
      return { taskId: simTask.id, status: 'pending' };
    }
    if (url.startsWith('/ai/tasks/')) return simProgress() || { status: 'failed', errorMsg: '任務不存在' };
    if (url === '/ai/tasks') return simTask ? [{ id: simTask.id, status: simProgress().status, progress: simProgress().progress, comicId: simProgress().comicId, input: { theme: '（本次 Demo 生成）' }, createdAt: new Date(simTask.start).toISOString() }] : [];

    // ===== 短劇 Agent（v6.0） =====
    if (method === 'POST' && url === '/ai/agent/blueprint') {
      const text = body?.scriptText || '';
      const roleMatches = [...text.matchAll(/([\u4e00-\u9fa5]{2,4})[：:]/g)].map(m => m[1]);
      const names = [...new Set(roleMatches)].filter(n => !['旁白', '字幕', '場景'].includes(n)).slice(0, 4);
      const chars = names.length ? names : ['林晚', '顧沉'];
      return {
        title: '《重生之豪門逆襲》',
        logline: text.slice(0, 40) || '一段關於逆襲與救贖的故事',
        characters: chars.map((name, i) => ({
          name, role: i === 0 ? '主角' : '配角',
          persona: i === 0 ? '堅韌隱忍，逆襲復仇' : '身份神秘，亦正亦邪',
          gender: /沉|琛|少|爺|王|帝/.test(name) ? 'male' : 'female',
        })),
        acts: [
          { act: 1, summary: '主角重生歸來，發現自己回到命運轉折的那一夜。', hook: '含恨而終，睜眼重生', cliffhanger: '仇人的兒子出現在門口' },
          { act: 2, summary: '主角步步為營，在豪門宴會上埋下復仇伏筆。', hook: '宴會邀請函送達', cliffhanger: '證據突然被調包' },
          { act: 3, summary: '真相大白，主角當眾揭穿陰謀，完成逆襲。', hook: '關鍵證人現身', cliffhanger: '幕後黑手另有其人' },
        ],
        emotionCurve: ['壓抑', '蓄力', '爆發'],
        _mock: true,
      };
    }
    // v6.0 深化：多輪改稿（Demo 本地模擬 LLM 修訂）
    if (method === 'POST' && url === '/ai/agent/blueprint/revise') {
      const bp = JSON.parse(JSON.stringify(body?.blueprint || {}));
      const fb = (body?.feedback || '').slice(0, 24);
      bp.logline = `${(bp.logline || '').slice(0, 30)}（依「${fb}」調整）`;
      if (bp.acts && bp.acts.length) bp.acts[bp.acts.length - 1].cliffhanger = `${fb}……`;
      bp._revision = (bp._revision || 0) + 1;
      return bp;
    }
    if (method === 'POST' && url === '/ai/agent/characters') {
      const avatars = [avatarImg('林晚'), avatarImg('顧沉')];
      return (body?.characters || []).map((c, i) => ({
        ...c,
        appearancePrompt: `character portrait of ${c.name}, consistent character design`,
        avatar: avatars[i % avatars.length],
      }));
    }
    if (method === 'POST' && url === '/ai/agent/produce') {
      simTask = { id: 'sim-' + Date.now(), start: Date.now() };
      return { taskId: simTask.id, status: 'pending' };
    }
    if (url.match(/^\/ai\/agent\/comics\/[^/]+\/characters/)) return demoComic.characters;

    // ===== 智能畫布（v6.0） =====
    // v6.0 深化：批次重繪（須在 /canvas/:id 之前匹配）
    if (method === 'POST' && url === '/ai/agent/canvas/batch-redraw') {
      const results = [];
      (body?.panelIds || []).forEach(pid => {
        const p = findPanel(pid);
        if (p) {
          pushPanelHistory(p);
          p.imageUrl = `https://picsum.photos/seed/batch${pid}${Date.now() % 10000}/720/1280`;
          results.push({ id: p.id, imageUrl: p.imageUrl });
        }
      });
      return { redrawn: results.length, panels: results, __msg: `已批次重繪 ${results.length} 格` };
    }
    if (url.startsWith('/ai/agent/canvas/')) return demoComic;
    if (method === 'PATCH' && url.startsWith('/ai/agent/panels/')) {
      const p = findPanel(url.split('/').pop());
      if (!p) return { __notFound: true };
      pushPanelHistory(p);
      Object.assign(p, body || {});
      return p;
    }
    // v6.0 深化：單格撤銷
    if (method === 'POST' && url.match(/^\/ai\/agent\/panels\/[^/]+\/undo/)) {
      const p = findPanel(url.split('/')[4]);
      if (!p || !Array.isArray(p.history) || !p.history.length) return { __badRequest: '沒有可撤銷的修改' };
      const prev = p.history.pop();
      Object.assign(p, {
        imageUrl: prev.imageUrl, imagePrompt: prev.imagePrompt, dialogue: prev.dialogue,
        speaker: prev.speaker, shotType: prev.shotType, transition: prev.transition, duration: prev.duration,
      });
      return { panel: p, remaining: p.history.length, __msg: '↩️ 已撤銷上一步修改' };
    }
    if (method === 'POST' && url.match(/^\/ai\/agent\/panels\/[^/]+\/redraw/)) {
      const p = findPanel(url.split('/')[4]);
      if (!p) return { __notFound: true };
      pushPanelHistory(p);
      // Demo：用新種子占位圖模擬重繪
      p.imageUrl = `https://picsum.photos/seed/redraw${Date.now() % 100000}/720/1280`;
      return { ...p, __msg: '重繪完成（Demo 占位圖）' };
    }
    if (method === 'POST' && url.match(/^\/ai\/agent\/comics\/[^/]+\/restyle/)) {
      demoComic.artStyle = body?.style || demoComic.artStyle;
      demoComic.episodes[0].panels.forEach((p, i) => {
        p.imageUrl = `https://picsum.photos/seed/${demoComic.artStyle}${i}${Date.now() % 1000}/720/1280`;
      });
      return { restyled: 6, style: demoComic.artStyle, __msg: `已按新畫風重繪 6 格分鏡` };
    }

    // ===== 靈感社區（v6.0） =====
    // v6.0 深化：評論（須在 /works 列表之前匹配）
    if (method === 'GET' && url.match(/^\/community\/works\/[^/]+\/comments/)) {
      const id = url.split('/')[3];
      const list = [...(comments[id] || [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      return { total: list.length, page: 1, list };
    }
    if (method === 'POST' && url.match(/^\/community\/works\/[^/]+\/comments/)) {
      const id = url.split('/')[3];
      const c = {
        id: 'cm' + (++commentSeq), content: (body?.content || '').slice(0, 500),
        nickname: 'Demo 用戶', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Demo',
        createdAt: new Date().toISOString(), mine: true,
      };
      (comments[id] = comments[id] || []).unshift(c);
      return c;
    }
    if (method === 'DELETE' && url.match(/^\/community\/comments\/[^/]+/)) {
      const cid = url.split('/').pop();
      for (const key of Object.keys(comments)) {
        const i = comments[key].findIndex(c => c.id === cid);
        if (i >= 0) { comments[key].splice(i, 1); return { deleted: true }; }
      }
      return { __notFound: true };
    }
    // v6.0 深化：作品詳情（須在 /works 列表之前匹配）
    if (method === 'GET' && url.match(/^\/community\/works\/[^/]+$/) && !url.includes('?')) {
      const detail = workDetail(url.split('/')[3]);
      if (!detail) return { __notFound: true };
      return detail;
    }
    if (url.startsWith('/community/works') && method === 'GET') {
      let list = [...communityWorks];
      if (url.includes('sort=new')) list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      else list.sort((a, b) => b.likes - a.likes);
      const sm = url.match(/style=(\w+)/);
      if (sm) list = list.filter(w => w.artStyle === sm[1]);
      return { total: list.length, page: 1, list };
    }
    if (method === 'POST' && url.match(/^\/community\/works\/[^/]+\/like/)) {
      const id = url.split('/')[3];
      const w = communityWorks.find(x => x.id === id);
      w._liked = !w._liked;
      w.likes += w._liked ? 1 : -1;
      return { liked: w._liked };
    }
    if (method === 'POST' && url.match(/^\/community\/works\/[^/]+\/favorite/)) {
      const id = url.split('/')[3];
      const idx = myFavs.indexOf(id);
      if (idx >= 0) { myFavs.splice(idx, 1); return { favorited: false }; }
      myFavs.push(id);
      return { favorited: true };
    }
    if (method === 'POST' && url.match(/^\/community\/works\/[^/]+\/remix/)) {
      const id = url.split('/')[3];
      const w = communityWorks.find(x => x.id === id);
      if (w) w.remixCount++;
      simTask = { id: 'sim-' + Date.now(), start: Date.now() };
      return { taskId: simTask.id, remixOf: w?.title };
    }
    if (url === '/community/favorites') {
      return communityWorks.filter(w => myFavs.includes(w.id))
        .map(w => ({ id: w.id, title: w.title, cover: w.cover, episodes: w.episodes, artStyle: w.artStyle }));
    }

    // ===== LibTV 參考：創作工具（v6.0） =====
    if (url === '/ai/tools/models') return {
      image: [
        { id: 'libnano2', name: 'LibNano 2', desc: '通用生圖' },
        { id: 'seedream5', name: 'Seedream 5.0 Lite', desc: '角色一致性' },
        { id: 'z-image', name: 'Z Image Turbo', desc: '攝影級真實感' },
        { id: 'gpt-image2', name: 'GPT Image 2', desc: '榜首 · 文字渲染' },
        { id: 'flux2', name: 'FLUX.2', desc: '開源 · 多參考一致性' },
        { id: 'mj-v81', name: 'Midjourney V8.1', desc: '美學概念圖' },
        { id: 'nb-pro', name: 'Nano Banana Pro', desc: '原生 4K 編輯' },
      ],
      video: [
        { id: 'seedance25', name: 'Seedance 2.5', desc: '30s 長敘事 · 原生音頻' },
        { id: 'seedance20-fast', name: 'Seedance 2.0 Fast', desc: '快速性價比' },
        { id: 'seedance20-mini', name: 'Seedance 2.0 Mini', desc: '極致低成本' },
        { id: 'vidu-q3', name: 'Vidu Q3', desc: '原生音視頻 · 16s 漫劇' },
        { id: 'veo31', name: 'Veo 3.1', desc: '4K 電影感 · 原生音頻' },
        { id: 'runway-g45', name: 'Runway Gen-4.5', desc: '導演級運鏡' },
        { id: 'hailuo23', name: 'MiniMax Hailuo 2.3', desc: '動漫量產' },
        { id: 'pika25', name: 'Pika 2.5', desc: '特效社交向' },
        { id: 'kling-o3', name: 'Kling O3', desc: '元素編輯' },
        { id: 'wan26', name: 'Wan 2.6', desc: '多角色對話' },
      ],
      audio: [
        { id: 'eleven-v3', name: 'Eleven V3' }, { id: 'gemini31-tts', name: 'Gemini 3.1 Flash TTS' },
        { id: 'minimax-speech28', name: 'MiniMax Speech 2.8' }, { id: 'indextts2', name: 'IndexTTS-2' },
        { id: 'mureka-v8', name: 'Mureka V8' }, { id: 'suno-v55', name: 'Suno V5.5' },
      ],
      llm: [
        { id: 'kimi-k3', name: 'Kimi K3' }, { id: 'claude-opus5', name: 'Claude Opus 5' },
        { id: 'qwen38-max', name: 'Qwen3.8-Max' }, { id: 'kimi-k26', name: 'Kimi K2.6' },
        { id: 'glm53', name: 'GLM-5.3' }, { id: 'minimax-m3', name: 'MiniMax M3' },
        { id: 'ds-v4-pro', name: 'DeepSeek V4 Pro' }, { id: 'ds-v4-flash', name: 'DeepSeek V4 Flash' },
      ],
    };
    if (method === 'POST' && url === '/ai/tools/script-table') {
      const text = body?.scriptText || '';
      const segs = (text.match(/[^。\n！？]+[。\n！？]?/g) || [text]).filter(s => s.trim());
      const rows = Math.min(body?.rows || 9, Math.max(6, segs.length * 3));
      const cameras = ['固定', '推鏡頭', '拉鏡頭', '搖鏡頭', '跟隨鏡頭', '環繞鏡頭'];
      return {
        rows: Array.from({ length: rows }, (_, i) => ({
          idx: i + 1,
          duration: 3 + (i % 3),
          scene: (segs[i % segs.length] || '關鍵劇情推進').trim().slice(0, 60),
          characters: i % 2 ? '林晚' : '林晚、顧沉',
          shot: ['wide', 'medium', 'close'][i % 3],
          camera: cameras[i % cameras.length],
          dialogue: (segs[i % segs.length] || '').trim().slice(0, 40),
        })),
        shotNames: { close: '特寫', medium: '中景', full: '全身', wide: '遠景' },
        cameraPresets: cameras,
      };
    }
    if (method === 'POST' && url === '/ai/tools/image-op') {
      // 視頻生成請求返回測試 mp4
      if (body?.params?.type === 'video') {
        return { op: 'generate', opName: '生成視頻', imageUrl: '', videoUrl: TEST_VIDEO, __msg: '視頻已生成（Demo 測試片源）' };
      }
      const seed = `${body?.op || 'gen'}${Date.now() % 100000}`;
      const names = { generate: '生成圖片', upscale: '高清放大', expand: '擴圖', cutout: '摳圖', angle: '多角度', light: '打光' };
      const opName = names[body?.op] || '圖像操作';
      return { op: body.op, opName, imageUrl: `https://picsum.photos/seed/${seed}/720/1280`, __msg: `${opName}完成` };
    }
    if (method === 'POST' && url === '/ai/tools/slash') {
      const defs = { 'grid-cameras': 9, 'plot-4': 4, 'char-views': 3, 'grid-25': 25, 'lighting-fix': 1, 'plot-forward': 1, 'plot-backward': 1 };
      const names = { 'grid-cameras': '多機位九宮格', 'plot-4': '劇情推演四宮格', 'char-views': '角色三視圖', 'grid-25': '25 宮格連貫分鏡', 'lighting-fix': '電影級光影矯正', 'plot-forward': '畫面推演 +3 秒', 'plot-backward': '畫面推演 -3 秒' };
      const count = defs[body?.command] || 4;
      return {
        command: body.command, name: names[body.command] || '快捷命令',
        items: Array.from({ length: count }, (_, i) => ({
          index: i + 1, imageUrl: `https://picsum.photos/seed/${body.command}${i}${Date.now() % 1000}/720/1280`,
        })),
        __msg: `${names[body.command]}生成完成`,
      };
    }
    // v6.1 編劇工作台：AI 續寫 / 潤色（Demo 模板模擬）
    if (method === 'POST' && url === '/ai/tools/script-assist') {
      const mode = body?.mode || 'continue';
      const src = (body?.text || '').slice(-300);
      const title = body?.title || '未命名劇本';
      if (mode === 'polish') {
        const polished = src
          .replace(/([一-龥A-Za-z·]{2,8})：([^\n]+)/g, (m, name, line) => `${name}：${line.trim().replace(/。?$/, '。')}`)
          .replace(/【動作】/g, '【動作】鏡頭緩緩推近——');
        return { mode, text: polished || src, __msg: '對白已潤色' };
      }
      // continue：依結尾情緒接寫一場
      const cont = [
        '',
        '【場景】內·舊宅走廊·夜（AI 續寫）',
        '【動作】長廊盡頭的燈忽明忽暗，腳步聲在寂靜中格外清晰。',
        '林晚：你們以為，把我趕出去就結束了？',
        '顧沉：（低聲）小心，牆後有人。',
        '【旁白】門縫裡透出一線光，真相就藏在這扇門後。',
        '【動作】林晚握緊手中的文件，推開了那扇門——',
        '【旁白】（《' + title + '》續寫段落，可自由修改）',
      ].join('\n');
      return { mode, text: cont, __msg: '續寫完成' };
    }
    if (method === 'POST' && url === '/ai/tools/compose') {
      const clips = body?.clips || [];
      const total = clips.reduce((s, c) => s + (c.duration != null ? c.duration / (c.speed || 1) : ((c.end ?? 5) - (c.start || 0))), 0);
      return { taskType: 'compose', clips: clips.length, totalDuration: Math.round(total * 10) / 10, bgm: !!body?.bgm, videoUrl: clips[0]?.url || TEST_VIDEO, __msg: `已受理 ${clips.length} 個片段的合成任務` };
    }

    // ===== 聚合搜索（v6.0） =====
    if (url.startsWith('/search/all')) {
      const q = decodeURIComponent((url.split('q=')[1] || '')).toLowerCase();
      return {
        dramas: dramas.filter(d => d.title.toLowerCase().includes(q) || d.category.includes(q))
          .map(d => Object.assign(listDrama(d), { type: 'drama' })),
        comics: communityWorks.filter(w => w.title.toLowerCase().includes(q) || (w.desc || '').toLowerCase().includes(q)).map(w => ({ ...w, type: 'comic' })),
        creators: q.includes('星辰') ? [{ id: 'cr1', name: '星辰劇場', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=星辰劇場', bio: '專業短劇創作團隊', type: 'creator' }] : [],
      };
    }

    // ===== 短劇（v4.0） =====
    if (url.startsWith('/dramas/recommend')) return { total: dramas.length, list: dramas.map(listDrama) };
    if (url === '/categories') return categories;
    if (url.startsWith('/dramas/categories')) return categories;
    if (url.startsWith('/rankings/') || url.startsWith('/dramas/rankings/')) {
      const sorted = [...dramas].sort((a, b) => b.rating - a.rating);
      return sorted.map((d, i) => ({ ...listDrama(d), rank: i + 1 }));
    }
    if (url.startsWith('/dramas/search')) {
      const q = decodeURIComponent((url.split('q=')[1] || '')).toLowerCase();
      return { list: dramas.filter(d => d.title.toLowerCase().includes(q) || d.category.includes(q)).map(listDrama) };
    }
    // POST /dramas/:id/follow —— 與 dramaController.toggleFollow 同形狀（toggle）
    if (method === 'POST' && url.match(/^\/dramas\/[^/]+\/follow/)) {
      const id = dramaIdFromUrl(url);
      if (follows.has(id)) follows.delete(id); else follows.add(id);
      return { following: follows.has(id), dramaId: id };
    }

    // ===== v7.3 付費牆：解鎖 / 廣告 =====
    // POST /ads/watch —— 帶 {dramaId, episodeId} → 廣告換解鎖（**不給幣**）；
    // 不帶 → 原本行為（看廣告拿幣）。429 = 超過每日上限或間隔太短。
    if (method === 'POST' && url === '/ads/watch') {
      const dramaId = body && body.dramaId;
      const episodeId = body && body.episodeId;
      if (!dramaId || !episodeId) {
        if (paywall.adWatchedToday >= AD_DAILY_LIMIT) {
          return { __status: 429, __error: `今日廣告次數已用完（${AD_DAILY_LIMIT}/${AD_DAILY_LIMIT}）` };
        }
        if (Date.now() - paywall.lastAdAt < AD_MIN_INTERVAL_MS) {
          return { __status: 429, __error: '觀看過於頻繁，請稍後再試' };
        }
        paywall.adWatchedToday++;
        paywall.lastAdAt = Date.now();
        paywall.coins += AD_REWARD;
        return { coins: AD_REWARD, remaining: AD_DAILY_LIMIT - paywall.adWatchedToday };
      }
      const found = findDemoEpisode(dramaId, episodeId);
      if (!found) return { __notFound: true };
      // 免費 / 已解鎖的判斷在限流之前 —— 與後端契約一致，也避免誤擋
      if (found.state.free) return { unlocked: true, free: true, episodeId };
      if (found.state.unlocked) return { unlocked: true, alreadyUnlocked: true, episodeId };
      if (paywall.adWatchedToday >= AD_DAILY_LIMIT) {
        return { __status: 429, __error: `今日廣告次數已用完（${AD_DAILY_LIMIT}/${AD_DAILY_LIMIT}）` };
      }
      if (Date.now() - paywall.lastAdAt < AD_MIN_INTERVAL_MS) {
        return { __status: 429, __error: '觀看過於頻繁，請稍後再試' };
      }
      paywall.adWatchedToday++;
      paywall.lastAdAt = Date.now();
      paywall.unlocked.add(dramaId + ':' + episodeId);
      return { unlocked: true, episodeId, method: 'ad', remaining: AD_DAILY_LIMIT - paywall.adWatchedToday };
    }

    // POST /coins/unlock —— 金幣解鎖（與 coinController.unlockEpisode 同形狀）
    if (method === 'POST' && url === '/coins/unlock') {
      const dramaId = body && body.dramaId;
      const episodeId = body && body.episodeId;
      if (!dramaId || !episodeId) return { __badRequest: '缺少參數' };
      const found = findDemoEpisode(dramaId, episodeId);
      if (!found) return { __notFound: true };
      if (found.state.free || found.state.unlocked) return { alreadyUnlocked: true, cost: 0 };
      const cost = found.state.cost;
      if (paywall.coins < cost) {
        return { __status: 402, __error: `硬幣不足，需要 ${cost} 幣，當前 ${paywall.coins} 幣` };
      }
      paywall.coins -= cost;
      paywall.unlocked.add(dramaId + ':' + episodeId);
      return { cost, remaining: paywall.coins, __msg: `解鎖成功，消耗 ${cost} 幣` };
    }

    // GET /dramas/:id/episodes（契約：{dramaId, isFree, pricePerEp, freeEpisodes, total, list}）
    if (method === 'GET' && url.match(/^\/dramas\/[^/]+\/episodes/)) {
      const id = dramaIdFromUrl(url);
      const d = dramas.find(x => x.id === id) || dramas[0];
      const list = demoEpisodes(d);
      return {
        dramaId: d.id,
        isFree: d.isFree === true,
        pricePerEp: demoEpisodeCost(d),
        freeEpisodes: FREE_EPISODES,
        total: list.length,
        list,
      };
    }

    if (url.match(/^\/dramas\/[^/]+/)) {
      const id = dramaIdFromUrl(url);
      const d = dramas.find(x => x.id === id) || dramas[0];
      return {
        ...d,
        freeEpisodes: FREE_EPISODES,
        episodes: demoEpisodes(d),
      };
    }

    // ===== 訂閱方案 =====
    // 真實資料，來源＝api/controllers/subscriptionController.js 的
    // AUDIENCE_PLANS（觀眾訂閱）與 CREATOR_PLANS（創作者工具）。
    // demo 模式也必須有真資料可讀，否則 VIP 角標只能寫死數字。價格若改了後端，
    // 這裡要同步；_julang-analysis/vipoffertest.js 會把兩邊抓下來比對，防止漂移。
    if (url === '/subscription/plans') return [
      // 觀眾方案（VIP 角標只認這一組）
      { id: 'viewer_weekly', group: 'audience', name: '每週無限看', price: 9.9, provisional: true, unlimited: true, adFree: true, maxResolution: '1080p', features: ['全站劇集無限看', '免廣告打斷', '1080p 畫質', '每週固定更新檔期'] },
      // 創作者工具方案
      { id: 'free', group: 'creator', name: '免費版', price: 0, features: ['基礎短劇生成', '社區瀏覽', '本地素材庫'] },
      { id: 'weekly', group: 'creator', name: '週卡', price: 9.9, bonusCoins: 100, features: ['無限 AI 生成', '去水印', '1080p 輸出', '雲端同步', '贈送 100 幣'] },
      { id: 'pro', group: 'creator', name: '專業版', price: 29, bonusCoins: 500, features: ['無限 AI 生成', '去水印', '4K 輸出', '雲端同步', '優先渲染隊列', '贈送 500 幣'] },
      { id: 'team', group: 'creator', name: '團隊版', price: 99, bonusCoins: 2000, features: ['多人協作畫布', '品牌定制', 'API 訪問', '專屬客服', '數據分析面板', '贈送 2000 幣'] },
    ];

    // ===== 用戶 =====
    // 金幣一律讀 paywall.coins：demo 的金幣解鎖真的會扣，顯示才對得上
    if (url === '/coins/balance') return { coins: paywall.coins };
    if (url === '/user/coins') return { coins: paywall.coins };
    if (url === '/user/profile') return { nickname: 'Demo 用戶', coins: paywall.coins, vipLevel: 3 };
    // GET /user/follows —— 後端形狀（userController.getFollows）＋ renderFollow() 讀的欄位名
    if (url === '/user/follows') {
      return [...follows].map((id) => {
        const d = dramas.find((x) => x.id === id) || {};
        const total = demoEpisodeCount(d);
        return {
          dramaId: id,
          title: d.title || null,
          cover: d.cover || null,
          totalEpisodes: total,
          lastEpisode: 0,        // demo 沒有觀看進度可回，不編造
          progressSeconds: 0,
          createdAt: null,
          // render.js 的 renderFollow() 讀的是 d.id / d.episodes（前後端欄位名的既有落差），
          // demo 兩種鍵都給，「我的追劇」才不會永遠是空的
          id,
          episodes: total,
        };
      });
    }
    if (url === '/user/history') return [];
    if (method === 'POST' && url === '/user/checkin') return { coins: 8938, earned: 50, streak: 4, coinsEarned: 50, streakDays: 4, totalCoins: 8938 };
    if (method === 'POST' && url === '/auth/login') return { token: 'demo-token', user: { nickname: 'Demo 用戶' } };
    if (method === 'POST' && url === '/auth/register') return { token: 'demo-token', user: { nickname: 'Demo 用戶' } };

    return { __notFound: true };
  }

  // ---------- 是否接管 api.request ----------
  // 這支檔案原本「無條件」覆寫 api.request，所以前端永遠只會拿到 demo 資料，
  // 就算 config.js 已經把 apiBase 指向真實後端也一樣連不到。
  // 現在改成預設 demo、可以明確切換：
  //   · 網址加 ?api=real
  //   · 或 localStorage.julang_api_mode = 'real'
  // 兩者都沒有時行為與以往完全相同（無後端也能完整體驗）。
  function wantsRealApi() {
    try {
      if (/[?&]api=real\b/.test(String(window.location.search || ''))) return true;
      if (window.localStorage && localStorage.getItem('julang_api_mode') === 'real') return true;
    } catch (e) { /* 取不到就當作 demo */ }
    return false;
  }

  if (wantsRealApi()) {
    window.__apiMode = 'real';
    console.log('%c🎬 劇浪：真實 API 模式（' + ((window.CONFIG && CONFIG.apiBase) || '?') + '）', 'color:#22c55e;font-weight:bold');
    // 不接管 api.request，也不種 demo token —— 走 api.js 的真實 fetch
    return;
  }

  // ---------- 覆寫 api.request ----------
  api.request = async function (method, url, body) {
    await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
    const data = route(method, url, body);
    if (data && data.__notFound) return { code: 404, message: 'Demo 模式：接口未實現' };
    if (data && data.__badRequest) return { code: 400, message: data.__badRequest };
    // v7.3：讓 demo 也能回真正的錯誤碼（例：廣告 429 / 金幣不足 402），
    // 前端才有 429 那條「可改用 N 幣解鎖」的路徑可走
    if (data && data.__status) return { code: data.__status, message: data.__error || '請求失敗' };
    if (data && data.__msg) { const { __msg, ...rest } = data; return { code: 200, message: __msg, data: rest }; }
    return { code: 200, message: 'success', data };
  };

  window.__apiMode = 'mock';
  if (!api.token) api.setToken('demo-token');
  console.log('%c🎬 劇浪 v6.2 Demo 模式已啟用（Mock API · PWA · 雲端同步）', 'color:#a855f7;font-weight:bold');
})();
