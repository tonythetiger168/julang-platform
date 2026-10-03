// ===== v5.0 漫劇播放器 =====
// @ts-check
// 分鏡圖 + Ken Burns 運鏡 + AI 配音（Web Speech 降級）+ 字幕 + 自動播放

let cpComic = null;        // 漫劇詳情
let cpPanels = [];         // 當前集分鏡
let cpEpIndex = 0;         // 當前集序
let cpPanelIndex = 0;      // 當前分鏡序
let cpPlaying = false;
let cpTimer = null;
let cpAudio = null;        // Audio 實例
let cpProgressTimer = null;
let cpSpeed = 1;           // v6.0 深化：倍速播放

// ---------- v6.0 深化：播放進度記憶（localStorage，LibreTV 式） ----------
const CP_PROGRESS_KEY = 'julang_play_progress';

function cpSaveProgress() {
  if (!cpComic) return;
  const map = JSON.parse(localStorage.getItem(CP_PROGRESS_KEY) || '{}');
  map[cpComic.id] = { epIndex: cpEpIndex, panelIndex: cpPanelIndex, at: Date.now() };
  localStorage.setItem(CP_PROGRESS_KEY, JSON.stringify(map));
}

function cpLoadProgress(comicId) {
  const map = JSON.parse(localStorage.getItem(CP_PROGRESS_KEY) || '{}');
  return map[comicId] || null;
}

// ---------- v6.0 深化：倍速切換 ----------
function cpCycleSpeed() {
  const speeds = [0.75, 1, 1.25, 1.5, 2];
  cpSpeed = speeds[(speeds.indexOf(cpSpeed) + 1) % speeds.length];
  document.getElementById('cp-speed-btn').textContent = cpSpeed + 'x';
  if (cpAudio) cpAudio.playbackRate = cpSpeed;
  if (cpPlaying) cpSchedule(); // 立即按新倍速重排
}

// 鏡頭類型對應的 Ken Burns 動畫
const CP_SHOT_ANIM = {
  close: 'cp-kenburns-in',
  medium: 'cp-kenburns-pan',
  full: 'cp-kenburns-out',
  wide: 'cp-kenburns-pan-alt',
};

async function openComicPlayer(id) {
  const res = await api.get('/ai/comics/' + id);
  if (res.code !== 200) return alert('加載失敗：' + (res.message || '未知錯誤'));
  cpComic = res.data;
  cpEpIndex = 0;
  document.getElementById('cp-title').textContent = cpComic.title;
  document.getElementById('cp-meta').textContent = `${cpComic.category} · ${cpComic.artStyle} 畫風 · ${cpComic.views} 次觀看`;
  if (typeof pwaRecordHistory === 'function') pwaRecordHistory({ id: cpComic.id, type: 'comic', title: cpComic.title, cover: cpComic.cover });
  cpRenderEpisodes();
  // v6.0 深化：有進度記憶時自動續播
  const saved = cpLoadProgress(cpComic.id);
  const resumeEp = saved && cpComic.episodes[saved.epIndex] ? saved.epIndex : 0;
  cpEpIndex = resumeEp;
  cpRenderEpisodes();
  await cpLoadEpisode(cpComic.episodes[resumeEp]?.episodeNumber || 1, saved && saved.epIndex === resumeEp ? saved.panelIndex : 0);
  if (saved && (saved.epIndex > 0 || saved.panelIndex > 0)) {
    const c = document.getElementById('cp-counter');
    c.textContent = `已續播 · ${cpPanelIndex + 1}/${cpPanels.length}`;
  }
  document.getElementById('comic-player-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeComicPlayer() {
  cpStop();
  document.getElementById('comic-player-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function cpRenderEpisodes() {
  const box = document.getElementById('cp-episode-list');
  box.innerHTML = (cpComic.episodes || []).map((ep, i) => `
    <button onclick="cpSelectEp(${i})"
      class="cp-ep-btn flex-shrink-0 w-12 h-12 rounded-xl ${i === cpEpIndex ? 'bg-purple-500 text-white' : 'bg-white/10 text-white/70'} flex items-center justify-center text-sm font-medium transition">
      ${ep.episodeNumber}
    </button>`).join('');
}

async function cpSelectEp(i) {
  cpEpIndex = i;
  cpRenderEpisodes();
  await cpLoadEpisode(cpComic.episodes[i].episodeNumber);
}

async function cpLoadEpisode(epNumber, startPanel = 0) {
  cpStop();
  const stage = document.getElementById('cp-stage');
  stage.innerHTML = '<div class="flex items-center justify-center h-full"><div class="loading-spinner"></div></div>';
  const res = await api.get(`/ai/comics/${cpComic.id}/episodes/${epNumber}`);
  if (res.code !== 200) {
    stage.innerHTML = '<p class="text-white/40 text-center py-20">劇集加載失敗</p>';
    return;
  }
  cpPanels = res.data.panels || [];
  document.getElementById('cp-ep-title').textContent = res.data.title || `第${epNumber}集`;
  cpPanelIndex = Math.min(startPanel, Math.max(0, cpPanels.length - 1));
  cpRenderPanel();
  cpPlay();
}

function cpRenderPanel() {
  const p = cpPanels[cpPanelIndex];
  if (!p) return;
  const stage = document.getElementById('cp-stage');
  const anim = CP_SHOT_ANIM[p.shot] || 'cp-kenburns-in';
  const transClass = p.transition === 'slide' ? 'cp-trans-slide' : p.transition === 'zoom' ? 'cp-trans-zoom' : 'cp-trans-fade';
  stage.innerHTML = `
    <div class="absolute inset-0 ${transClass}" key="${cpPanelIndex}">
      ${p.image
        ? `<img src="${p.image}" class="w-full h-full object-cover ${anim}" alt="panel ${p.n}">`
        : '<div class="w-full h-full bg-gradient-to-br from-purple-900 to-gray-900 flex items-center justify-center text-white/30 text-sm">分鏡圖生成中</div>'}
      <div class="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none"></div>
      ${p.speaker ? `<div class="absolute top-4 left-4 px-3 py-1 rounded-full bg-purple-500/80 text-white text-xs font-medium backdrop-blur">${p.speaker}</div>` : '<div class="absolute top-4 left-4 px-3 py-1 rounded-full bg-white/20 text-white/80 text-xs backdrop-blur">旁白</div>'}
    </div>`;
  // 字幕
  const sub = document.getElementById('cp-subtitle');
  sub.textContent = p.dialogue || '';
  // 進度點
  document.getElementById('cp-dots').innerHTML = cpPanels.map((_, i) =>
    `<span class="h-1 rounded-full transition-all ${i === cpPanelIndex ? 'w-6 bg-purple-400' : i < cpPanelIndex ? 'w-3 bg-purple-400/50' : 'w-3 bg-white/20'}"></span>`
  ).join('');
  document.getElementById('cp-counter').textContent = `${cpPanelIndex + 1}/${cpPanels.length}`;
  cpSaveProgress();
}

// ---- 語音播放：優先 AI 音頻，降級 Web Speech ----
function cpSpeak(p) {
  cpStopAudio();
  if (p.voice) {
    cpAudio = new Audio(p.voice);
    cpAudio.playbackRate = cpSpeed;
    cpAudio.play().catch(() => {});
    return;
  }
  if ('speechSynthesis' in window && p.dialogue) {
    const u = new SpeechSynthesisUtterance(p.dialogue);
    u.lang = 'zh-TW';
    u.rate = 1.1 * cpSpeed;
    // 簡單音色區分：男角色低音调
    u.pitch = /沉|琛|總裁|少|爺|王|帝/.test(p.speaker || '') ? 0.7 : 1.0;
    window.speechSynthesis.speak(u);
  }
}

function cpStopAudio() {
  if (cpAudio) { cpAudio.pause(); cpAudio = null; }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

// ---- 播放控制 ----
function cpPlay() {
  if (!cpPanels.length) return;
  cpPlaying = true;
  document.getElementById('cp-play-icon').classList.add('hidden');
  document.getElementById('cp-pause-icon').classList.remove('hidden');
  cpSchedule();
}

function cpSchedule() {
  clearTimeout(cpTimer);
  if (!cpPlaying) return;
  const p = cpPanels[cpPanelIndex];
  if (!p) return;
  cpSpeak(p);
  const effective = p.duration / cpSpeed;
  cpStartProgress(effective);
  cpTimer = setTimeout(() => cpNext(), effective * 1000);
}

function cpStartProgress(duration) {
  const bar = document.getElementById('cp-progress-bar');
  bar.style.transition = 'none';
  bar.style.width = '0%';
  requestAnimationFrame(() => {
    bar.style.transition = `width ${duration}s linear`;
    bar.style.width = '100%';
  });
}

function cpPause() {
  cpPlaying = false;
  clearTimeout(cpTimer);
  cpStopAudio();
  const bar = document.getElementById('cp-progress-bar');
  const w = getComputedStyle(bar).width;
  bar.style.transition = 'none';
  bar.style.width = w;
  document.getElementById('cp-play-icon').classList.remove('hidden');
  document.getElementById('cp-pause-icon').classList.add('hidden');
}

function cpToggle() {
  cpPlaying ? cpPause() : cpPlay();
}

function cpNext() {
  cpStopAudio();
  if (cpPanelIndex < cpPanels.length - 1) {
    cpPanelIndex++;
    cpRenderPanel();
    if (cpPlaying) cpSchedule();
  } else {
    // 本集播完，自動下一集
    if (cpEpIndex < (cpComic.episodes?.length || 1) - 1) {
      cpSelectEp(cpEpIndex + 1);
    } else {
      cpPause();
      document.getElementById('cp-counter').textContent = '已播完';
      // 全劇播完，清除進度記憶
      const map = JSON.parse(localStorage.getItem(CP_PROGRESS_KEY) || '{}');
      delete map[cpComic.id];
      localStorage.setItem(CP_PROGRESS_KEY, JSON.stringify(map));
    }
  }
}

function cpPrev() {
  cpStopAudio();
  if (cpPanelIndex > 0) {
    cpPanelIndex--;
    cpRenderPanel();
    if (cpPlaying) cpSchedule();
  }
}

function cpStop() {
  cpPlaying = false;
  clearTimeout(cpTimer);
  cpStopAudio();
}

// 覆寫漫劇 Tab：改為加載真實 AI 漫劇數據
async function renderManju() {
  const grid = document.getElementById('manju-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="col-span-2 flex justify-center py-10"><div class="loading-spinner"></div></div>';
  const res = await api.get('/ai/comics?limit=20');
  if (res.code !== 200 || !res.data.list.length) {
    grid.innerHTML = `
      <div class="col-span-2 text-center py-16">
        <p class="text-white/40 mb-4">還沒有 AI 漫劇，來創作第一部吧！</p>
        <button onclick="showAiStudio()" class="px-6 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold">🎨 AI 生成漫劇</button>
      </div>`;
    return;
  }
  grid.innerHTML = res.data.list.map(c => `
    <div class="rounded-xl overflow-hidden bg-white/5 cursor-pointer hover:bg-white/10 transition duration-300" onclick="openComicPlayer('${c.id}')">
      <div class="aspect-[3/4] relative">
        <img src="${c.cover || ''}" class="w-full h-full object-cover" alt="${c.title}" loading="lazy">
        <div class="absolute top-2 left-2 px-2 py-0.5 rounded bg-purple-500/80 text-white text-xs backdrop-blur">AI 漫劇</div>
        <div class="absolute bottom-2 right-2 px-2 py-0.5 rounded bg-black/60 text-white text-xs backdrop-blur">${c.episodes}集</div>
      </div>
      <div class="p-2">
        <h4 class="text-white text-sm font-medium truncate">${c.title}</h4>
        <p class="text-white/40 text-xs mt-0.5">${c.category} · 👁 ${c.views}</p>
      </div>
    </div>`).join('');
}

window.openComicPlayer = openComicPlayer;
window.closeComicPlayer = closeComicPlayer;
window.cpSelectEp = cpSelectEp;
window.cpToggle = cpToggle;
window.cpNext = cpNext;
window.cpPrev = cpPrev;
window.cpCycleSpeed = cpCycleSpeed;
window.renderManju = renderManju;
