// ===== v6.0 Demo 模式：Mock API =====
// @ts-check
// 覆寫 api.request，讓整個前端無需後端/資料庫即可完整體驗
// 演示漫劇分鏡圖、角色頭像均為真實 AI 生成資產

(function () {
  const A = 'assets/panels/';
  const C = 'assets/chars/';
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
    { id: 'd1', title: '霸道總裁愛上我', desc: '平凡女孩意外闖入總裁生活，展開一段甜寵愛情故事', cover: 'https://picsum.photos/seed/jld1/400/600', category: '甜寵', episodes: 3, views: '2.3億', rating: 9.2, isFree: true },
    { id: 'd2', title: '重生之復仇女王', desc: '前世被陷害致死，重生歸來誓要讓所有人付出代價', cover: 'https://picsum.photos/seed/jld2/400/600', category: '重生', episodes: 3, views: '1.8億', rating: 9.0, isFree: true },
    { id: 'd3', title: '都市神醫', desc: '隱世神醫下山歷練，憑藉絕世醫術縱橫都市', cover: 'https://picsum.photos/seed/jld3/400/600', category: '都市', episodes: 3, views: '3.1億', rating: 8.8, isFree: true },
    { id: 'd4', title: '穿越之嫡女歸來', desc: '現代女醫生穿越古代，成為相府嫡女，開啟逆襲人生', cover: 'https://picsum.photos/seed/jld4/400/600', category: '穿越', episodes: 3, views: '1.5億', rating: 9.1, isFree: true },
    { id: 'd5', title: '龍王贅婿', desc: '隱藏身份的龍王入贅豪門，被看不起的他終於展露真實實力', cover: 'https://picsum.photos/seed/jld5/400/600', category: '逆襲', episodes: 3, views: '4.2億', rating: 8.5, isFree: false },
    { id: 'd6', title: '仙尊歸來', desc: '修仙萬年歸來，發現地球已過百年，曾經的愛人已白髮蒼蒼', cover: 'https://picsum.photos/seed/jld6/400/600', category: '玄幻', episodes: 3, views: '2.8億', rating: 9.3, isFree: true },
  ];

  const COMIC_ID = 'demo-comic-001';

  // Demo 漫劇（可編輯狀態，畫布編輯器直接操作此對象）
  const demoComic = {
    id: COMIC_ID,
    title: '逆襲：命運重啟',
    desc: 'AI 生成演示漫劇：被逐出家門的少女三年後華麗歸來，在豪門宴會上展開復仇。分鏡圖全部由 AI 真實生成。',
    cover: A + 'cover.jpg',
    category: '逆襲',
    artStyle: 'anime',
    theme: '豪門逆襲復仇',
    views: '125萬',
    rating: 9.4,
    likes: 12800,
    remixCount: 326,
    remixOfId: null,
    characters: [
      { id: 'ch1', name: '林晚', role: '主角', persona: '堅韌隱忍，逆襲復仇', avatar: C + 'linwan.jpg', voiceId: 'alloy' },
      { id: 'ch2', name: '顧沉', role: '配角', persona: '身份神秘的守護者', avatar: C + 'guchen.jpg', voiceId: 'onyx' },
    ],
    episodes: [{
      id: 'ep1', episodeNumber: 1, title: '第1集 命運轉折', duration: 25, status: 'published',
      panels: [
        { id: 'p1', panelNumber: 1, imageUrl: A + 'e1p1.jpg', shotType: 'wide', transition: 'fade', speaker: '', dialogue: '三年前，我被趕出家門，身無分文。', duration: 4, voiceUrl: null },
        { id: 'p2', panelNumber: 2, imageUrl: A + 'e1p2.jpg', shotType: 'close', transition: 'zoom', speaker: '林晚', dialogue: '我發誓，總有一天要讓他們後悔！', duration: 4, voiceUrl: null },
        { id: 'p3', panelNumber: 3, imageUrl: A + 'e1p3.jpg', shotType: 'medium', transition: 'slide', speaker: '顧沉', dialogue: '這位小姐，我們又見面了。', duration: 4, voiceUrl: null },
        { id: 'p4', panelNumber: 4, imageUrl: A + 'e1p4.jpg', shotType: 'medium', transition: 'fade', speaker: '林晚', dialogue: '是你？當年那個救我的人……', duration: 4, voiceUrl: null },
        { id: 'p5', panelNumber: 5, imageUrl: A + 'e1p5.jpg', shotType: 'close', transition: 'zoom', speaker: '顧沉', dialogue: '從今天起，我來護你周全。', duration: 4, voiceUrl: null },
        { id: 'p6', panelNumber: 6, imageUrl: A + 'e1p6.jpg', shotType: 'full', transition: 'fade', speaker: '', dialogue: '這一次，命運由我自己改寫。', duration: 5, voiceUrl: null },
      ],
    }],
  };

  // 社區作品（含兩部其他畫風的演示作品）
  const communityWorks = [
    { id: COMIC_ID, title: demoComic.title, desc: demoComic.desc, cover: demoComic.cover, category: '逆襲', artStyle: 'anime', episodes: 1, views: '125萬', likes: 12800, remixCount: 326, remixOfId: null, characters: demoComic.characters, createdAt: '2026-08-20T10:00:00Z' },
    { id: 'demo-comic-002', title: '劍來：雪中行', desc: '水墨國風漫劇：落魄劍客一劍破萬法，江湖夜雨十年燈。', cover: A + 'work_ink.jpg', category: '玄幻', artStyle: 'ink', episodes: 2, views: '86萬', likes: 9600, remixCount: 210, remixOfId: null, characters: [], createdAt: '2026-08-21T08:00:00Z' },
    { id: 'demo-comic-003', title: '小廚娘的魔法廚房', desc: 'Q版萌系漫劇：會魔法的小廚娘，用甜點治癒整座城市。', cover: A + 'work_chibi.jpg', category: '甜寵', artStyle: 'chibi', episodes: 1, views: '52萬', likes: 7400, remixCount: 158, remixOfId: null, characters: [], createdAt: '2026-08-22T06:00:00Z' },
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
      episodes: [{
        episodeNumber: 1, title: '第1集',
        panels: [1, 2, 3, 4, 5, 6].map(n => ({
          id: id + '-p' + n, panelNumber: n, imageUrl: `https://picsum.photos/seed/${id}p${n}/720/1280`,
          dialogue: `（${w.title}）第 ${n} 格演示分鏡`, speaker: '', shotType: 'medium', transition: 'fade', duration: 4,
        })),
      }],
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

  // ---------- 路由 ----------
  function route(method, url, body) {
    // ===== AI 能力 / 漫劇（v5.0） =====
    if (url === '/ai/capabilities') return {
      styles: [
        { id: 'anime', name: '日系動漫', desc: '色彩鮮豔的日系賽璐璐風格' },
        { id: 'ink', name: '水墨國風', desc: '中式水墨，留白意境' },
        { id: 'realistic', name: '寫實電影', desc: '電影級寫實光影' },
        { id: 'chibi', name: 'Q版萌系', desc: '可愛治癒的 Q 版畫風' },
      ],
      voices: [
        { id: 'alloy', name: '清悦（女）', desc: '年輕清亮，適合甜寵女主' },
        { id: 'nova', name: '柔婉（女）', desc: '溫柔成熟，適合旁白' },
        { id: 'onyx', name: '低沉（男）', desc: '磁性低沉，適合霸總男主' },
        { id: 'echo', name: '沉穩（男）', desc: '沉穩敘事，適合懸疑' },
      ],
      backends: { llm: 'builtin-template', image: 'api', tts: 'web-speech-fallback' },
    };
    if (url.startsWith('/ai/comics/') && url.includes('/episodes/')) {
      const ep = demoComic.episodes[0];
      return {
        episodeId: ep.id, episodeNumber: 1, title: ep.title, duration: ep.duration,
        panels: ep.panels.map(p => ({ n: p.panelNumber, image: p.imageUrl, shot: p.shotType, transition: p.transition, dialogue: p.dialogue, speaker: p.speaker, voice: p.voiceUrl, duration: p.duration })),
      };
    }
    if (url.startsWith('/ai/comics/')) {
      return { ...demoComic, views: '1250001', episodes: demoComic.episodes.map(e => ({ id: e.id, episodeNumber: e.episodeNumber, title: e.title, duration: e.duration, status: e.status })) };
    }
    if (url.startsWith('/ai/comics')) return { total: 1, page: 1, list: [{ ...demoComic, episodes: 1 }] };
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
      const avatars = [C + 'linwan.jpg', C + 'guchen.jpg'];
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
        dramas: dramas.filter(d => d.title.toLowerCase().includes(q) || d.category.includes(q)).map(d => ({ ...d, type: 'drama' })),
        comics: communityWorks.filter(w => w.title.toLowerCase().includes(q) || (w.desc || '').toLowerCase().includes(q)).map(w => ({ ...w, type: 'comic' })),
        creators: q.includes('星辰') ? [{ id: 'cr1', name: '星辰劇場', avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=星辰劇場', bio: '專業短劇創作團隊', type: 'creator' }] : [],
      };
    }

    // ===== 短劇（v4.0） =====
    if (url.startsWith('/dramas/recommend')) return { total: dramas.length, list: dramas };
    if (url === '/categories') return categories;
    if (url.startsWith('/dramas/categories')) return categories;
    if (url.startsWith('/rankings/') || url.startsWith('/dramas/rankings/')) {
      const sorted = [...dramas].sort((a, b) => b.rating - a.rating);
      return sorted.map((d, i) => ({ ...d, rank: i + 1 }));
    }
    if (url.startsWith('/dramas/search')) {
      const q = decodeURIComponent((url.split('q=')[1] || '')).toLowerCase();
      return { list: dramas.filter(d => d.title.toLowerCase().includes(q) || d.category.includes(q)) };
    }
    if (method === 'POST' && url.match(/^\/dramas\/[^/]+\/follow/)) return { followed: true };
    if (url.match(/^\/dramas\/[^/]+/)) {
      const id = url.split('/')[2];
      const d = dramas.find(x => x.id === id) || dramas[0];
      return {
        ...d,
        episodes: [1, 2, 3].map(n => ({ id: d.id + '-e' + n, episodeNumber: n, title: '第' + n + '集', videoUrl: TEST_VIDEO, duration: 320 })),
      };
    }

    // ===== 用戶 =====
    if (url === '/user/coins') return { coins: 8888 };
    if (url === '/user/profile') return { nickname: 'Demo 用戶', coins: 8888, vipLevel: 3 };
    if (url === '/user/follows') return [];
    if (url === '/user/history') return [];
    if (method === 'POST' && url === '/user/checkin') return { coins: 8938, earned: 50, streak: 4, coinsEarned: 50, streakDays: 4, totalCoins: 8938 };
    if (method === 'POST' && url === '/auth/login') return { token: 'demo-token', user: { nickname: 'Demo 用戶' } };
    if (method === 'POST' && url === '/auth/register') return { token: 'demo-token', user: { nickname: 'Demo 用戶' } };

    return { __notFound: true };
  }

  // ---------- 覆寫 api.request ----------
  api.request = async function (method, url, body) {
    await new Promise(r => setTimeout(r, 80 + Math.random() * 120));
    const data = route(method, url, body);
    if (data && data.__notFound) return { code: 404, message: 'Demo 模式：接口未實現' };
    if (data && data.__badRequest) return { code: 400, message: data.__badRequest };
    if (data && data.__msg) { const { __msg, ...rest } = data; return { code: 200, message: __msg, data: rest }; }
    return { code: 200, message: 'success', data };
  };

  if (!api.token) api.setToken('demo-token');
  console.log('%c🎬 劇浪 v6.2 Demo 模式已啟用（Mock API · PWA · 雲端同步）', 'color:#a855f7;font-weight:bold');
})();
