// ===== v6.0 智能畫布編輯器（參考即夢）=====
// @ts-check
// 分鏡網格編輯：台詞修改、AI 重繪、換畫風、運鏡/轉場控制

let cvComic = null;
let cvActivePanel = null; // { epIdx, panelIdx }
let cvMultiMode = false;  // v6.0 深化：多選批次重繪模式
let cvSelected = new Set(); // panelId 集合

async function openCanvasEditor(comicId) {
  if (!api.isLoggedIn()) return showLogin();
  document.getElementById('canvas-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('cv-grid').innerHTML = '<div class="col-span-3 flex justify-center py-10"><div class="loading-spinner"></div></div>';
  const res = await api.get('/ai/agent/canvas/' + comicId);
  if (res.code !== 200) { alert(res.message || '加載失敗'); return closeCanvasEditor(); }
  cvComic = res.data;
  document.getElementById('cv-title').textContent = cvComic.title;
  document.getElementById('cv-style').value = cvComic.artStyle;
  cvRender();
}

function closeCanvasEditor() {
  document.getElementById('canvas-modal').classList.add('hidden');
  document.body.style.overflow = '';
  cvActivePanel = null;
  cvMultiMode = false;
  cvSelected = new Set();
}

const CV_SHOTS = { close: '特寫', medium: '中景', full: '全身', wide: '遠景' };
const CV_TRANS = { fade: '淡入', slide: '滑入', zoom: '縮放', none: '無轉場' };

function cvRender() {
  const grid = document.getElementById('cv-grid');
  grid.innerHTML = cvComic.episodes.map((ep, ei) => `
    <div class="col-span-3 text-white/50 text-xs font-bold mt-2">第 ${ep.episodeNumber} 集 · ${ep.title || ''}</div>
    ${ep.panels.map((p, pi) => `
      <div class="relative rounded-xl overflow-hidden bg-white/5 border ${cvSelected.has(p.id) ? 'border-pink-500 ring-2 ring-pink-500/50' : 'border-white/10'} cursor-pointer group" onclick="cvSelect(${ei}, ${pi})">
        <div class="aspect-[9/16]">
          ${p.imageUrl ? `<img src="${p.imageUrl}" class="w-full h-full object-cover" loading="lazy">` : '<div class="w-full h-full flex items-center justify-center text-white/20 text-xs">無圖</div>'}
        </div>
        <div class="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px]">#${p.panelNumber} ${CV_SHOTS[p.shotType] || p.shotType}</div>
        <div class="absolute bottom-0 left-0 right-0 p-1.5 bg-gradient-to-t from-black/80 to-transparent">
          <p class="text-white/80 text-[10px] line-clamp-2">${p.dialogue || ''}</p>
        </div>
        ${cvMultiMode ? `<div class="absolute top-1 right-1 w-5 h-5 rounded-full ${cvSelected.has(p.id) ? 'bg-pink-500' : 'bg-black/50 border border-white/40'} flex items-center justify-center text-white text-[10px]">${cvSelected.has(p.id) ? '✓' : ''}</div>` : ''}
        <div class="absolute inset-0 bg-purple-500/0 group-hover:bg-purple-500/10 transition"></div>
      </div>`).join('')}
  `).join('');
  cvUpdateMultiBar();
}

// ---------- v6.0 深化：多選模式 + 批次重繪 ----------
function cvToggleMulti() {
  cvMultiMode = !cvMultiMode;
  cvSelected = new Set();
  document.getElementById('cv-multi-btn').className = cvMultiMode
    ? 'px-3 py-1.5 rounded-lg bg-pink-500 text-white text-xs font-medium'
    : 'px-3 py-1.5 rounded-lg bg-white/10 text-white/70 text-xs hover:bg-white/20';
  cvRender();
}

function cvUpdateMultiBar() {
  const bar = document.getElementById('cv-multi-bar');
  if (!bar) return;
  bar.classList.toggle('hidden', !(cvMultiMode && cvSelected.size > 0));
  document.getElementById('cv-multi-count').textContent = `已選 ${cvSelected.size} 格`;
}

// 批次重繪選中的分鏡
async function cvBatchRedraw() {
  if (!cvSelected.size) return;
  const btn = document.getElementById('cv-batch-btn');
  btn.disabled = true; btn.textContent = `批次重繪中（${cvSelected.size} 格）...`;
  const res = await api.post('/ai/agent/canvas/batch-redraw', {
    panelIds: [...cvSelected],
    prompt: document.getElementById('cv-prompt').value || undefined,
    style: document.getElementById('cv-style').value,
  });
  btn.disabled = false; btn.textContent = '🖌️ 批次重繪選中格';
  if (res.code !== 200) return alert(res.message || '批次重繪失敗');
  const map = Object.fromEntries(res.data.panels.map(p => [p.id, p.imageUrl]));
  cvComic.episodes.forEach(ep => ep.panels.forEach(p => { if (map[p.id]) p.imageUrl = map[p.id]; }));
  cvSelected = new Set();
  cvRender();
  cvToast(res.message);
}

function cvSelect(ei, pi) {
  const p = cvComic.episodes[ei].panels[pi];
  // 多選模式：點擊只切換選中狀態，不打開編輯器
  if (cvMultiMode) {
    if (cvSelected.has(p.id)) cvSelected.delete(p.id); else cvSelected.add(p.id);
    cvRender();
    return;
  }
  cvActivePanel = { ei, pi };
  document.getElementById('cv-editor').classList.remove('hidden');
  document.getElementById('cv-preview').innerHTML = p.imageUrl
    ? `<img src="${p.imageUrl}" class="w-full h-full object-cover">` : '';
  document.getElementById('cv-dialogue').value = p.dialogue || '';
  document.getElementById('cv-speaker').value = p.speaker || '';
  document.getElementById('cv-shot').value = p.shotType;
  document.getElementById('cv-trans').value = p.transition;
  document.getElementById('cv-duration').value = p.duration;
  document.getElementById('cv-panel-label').textContent = `第 ${cvComic.episodes[ei].episodeNumber} 集 · 第 ${p.panelNumber} 格`;
  document.getElementById('canvas-modal').scrollTo({ top: document.getElementById('cv-editor').offsetTop - 80, behavior: 'smooth' });
}

async function cvSave() {
  if (!cvActivePanel) return;
  const p = cvComic.episodes[cvActivePanel.ei].panels[cvActivePanel.pi];
  const res = await api.request('PATCH', '/ai/agent/panels/' + p.id, {
    dialogue: document.getElementById('cv-dialogue').value,
    speaker: document.getElementById('cv-speaker').value,
    shotType: document.getElementById('cv-shot').value,
    transition: document.getElementById('cv-trans').value,
    duration: parseInt(document.getElementById('cv-duration').value),
  });
  if (res.code !== 200) return alert(res.message || '保存失敗');
  Object.assign(p, res.data);
  cvRender();
  cvToast('✅ 分鏡已保存');
}

// AI 重繪當前格
async function cvRedraw() {
  if (!cvActivePanel) return;
  const p = cvComic.episodes[cvActivePanel.ei].panels[cvActivePanel.pi];
  const btn = document.getElementById('cv-redraw-btn');
  btn.disabled = true; btn.textContent = '重繪中...';
  const res = await api.post('/ai/agent/panels/' + p.id + '/redraw', {
    prompt: document.getElementById('cv-prompt').value || undefined,
    style: document.getElementById('cv-style').value,
  });
  btn.disabled = false; btn.textContent = '🖌️ AI 重繪此格';
  if (res.code !== 200) return alert(res.message || '重繪失敗');
  p.imageUrl = res.data.imageUrl;
  document.getElementById('cv-preview').innerHTML = `<img src="${p.imageUrl}" class="w-full h-full object-cover">`;
  cvRender();
  cvToast(res.message);
}

// v6.0 深化：撤銷上一步修改（台詞/重繪皆可回退）
async function cvUndo() {
  if (!cvActivePanel) return;
  const p = cvComic.episodes[cvActivePanel.ei].panels[cvActivePanel.pi];
  const btn = document.getElementById('cv-undo-btn');
  btn.disabled = true;
  const res = await api.post('/ai/agent/panels/' + p.id + '/undo', {});
  btn.disabled = false;
  if (res.code !== 200) { cvToast(res.message || '沒有可撤銷的修改'); return; }
  Object.assign(p, res.data.panel);
  cvSelect(cvActivePanel.ei, cvActivePanel.pi); // 刷新編輯器表單
  cvRender();
  cvToast(`↩️ 已撤銷（還可撤 ${res.data.remaining} 步）`);
}

// 整部換畫風
async function cvRestyle() {
  const style = document.getElementById('cv-style').value;
  if (!confirm(`將整部作品重繪為「${style}」畫風？`)) return;
  const btn = document.getElementById('cv-restyle-btn');
  btn.disabled = true; btn.textContent = '整部重繪中...';
  const res = await api.post('/ai/agent/comics/' + cvComic.id + '/restyle', { style });
  btn.disabled = false; btn.textContent = '🎨 整部換畫風';
  if (res.code !== 200) return alert(res.message || '操作失敗');
  cvToast(res.message);
  await openCanvasEditor(cvComic.id); // 刷新
}

function cvPreviewPlay() {
  closeCanvasEditor();
  openComicPlayer(cvComic.id);
}

function cvToast(msg) {
  const t = document.getElementById('cv-toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 2000);
}

window.openCanvasEditor = openCanvasEditor;
window.closeCanvasEditor = closeCanvasEditor;
window.cvSelect = cvSelect;
window.cvSave = cvSave;
window.cvRedraw = cvRedraw;
window.cvRestyle = cvRestyle;
window.cvPreviewPlay = cvPreviewPlay;
window.cvToggleMulti = cvToggleMulti;
window.cvBatchRedraw = cvBatchRedraw;
window.cvUndo = cvUndo;
