// ===== v6.0 無限創作畫布（參考 LibTV 節點工作流）=====
// @ts-check
// 五種節點：文本/腳本/圖片/視頻/音頻 · 拖曳移動 · 連線編排 · 一鍵執行 · 時間軸合成

// ---------- 狀態 ----------
let flNodes = [];        // [{id,type,x,y,data}]
let flLinks = [];        // [{from,to}]
let flView = { x: 0, y: 0, scale: 1 };
let flSeq = 1;
let flPickerPos = { x: 200, y: 200 };
let flModels = null;
let flSelected = new Set();   // LibTV 批量操作：多選節點
let flBatchLinkMode = false;  // 批量連線模式
const FL_SAVE_KEY = 'julang_flow_canvas';
const FL_TYPES = {
  text: { icon: '📝', name: '文本', color: 'border-slate-400/40' },
  script: { icon: '🎬', name: '腳本', color: 'border-purple-400/40' },
  image: { icon: '🖼️', name: '圖片', color: 'border-pink-400/40' },
  video: { icon: '🎥', name: '視頻', color: 'border-cyan-400/40' },
  audio: { icon: '🎵', name: '音頻', color: 'border-amber-400/40' },
};

// ---------- 開關 ----------
async function showFlowCanvas() {
  if (!api.isLoggedIn()) return showLogin();
  closeUpload();
  document.getElementById('flow-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  flLoadModels();
  if (!flNodes.length) flRestore();
  flRender();
}

function closeFlowCanvas() {
  document.getElementById('flow-modal').classList.add('hidden');
  document.body.style.overflow = '';
  flSave(true);
}

async function flLoadModels() {
  if (flModels) return;
  const res = await api.get('/ai/tools/models');
  if (res.code !== 200) return;
  flModels = res.data;
  document.getElementById('flow-img-model').innerHTML =
    flModels.image.map(m => `<option value="${m.id}">🖼 ${m.name}</option>`).join('');
  document.getElementById('flow-vid-model').innerHTML =
    flModels.video.map(m => `<option value="${m.id}">🎥 ${m.name}</option>`).join('');
}

// ---------- 視圖：平移 / 縮放 ----------
function flApplyView() {
  document.getElementById('flow-canvas').style.transform =
    `translate(${flView.x}px, ${flView.y}px) scale(${flView.scale})`;
}
function flZoom(d) {
  flView.scale = Math.min(2, Math.max(0.4, flView.scale + d));
  flApplyView();
}
function flResetView() { flView = { x: 0, y: 0, scale: 1 }; flApplyView(); }

function flToCanvas(cx, cy) {
  const r = document.getElementById('flow-viewport').getBoundingClientRect();
  return { x: (cx - r.left - flView.x) / flView.scale, y: (cy - r.top - flView.y) / flView.scale };
}

// ---------- 節點操作 ----------
function flAddNode(type, x, y, data = {}) {
  const node = { id: 'n' + (flSeq++), type, x: x ?? flPickerPos.x, y: y ?? flPickerPos.y, data };
  flNodes.push(node);
  flHidePicker();
  flRender();
  return node;
}

function flDelNode(id) {
  flNodes = flNodes.filter(n => n.id !== id);
  flLinks = flLinks.filter(l => l.from !== id && l.to !== id);
  flRender();
}

function flUpstream(node) {
  // 取上游節點（文本/腳本/圖片）的輸出內容
  const link = flLinks.find(l => l.to === node.id);
  if (!link) return null;
  return flNodes.find(n => n.id === link.from) || null;
}

// ---------- 渲染 ----------
function flRender() {
  const box = document.getElementById('flow-nodes');
  box.innerHTML = flNodes.map(n => flNodeHtml(n)).join('');
  flRenderLinks();
  flBindNodeEvents();
  flApplyView();
}

function flNodeHtml(n) {
  const t = FL_TYPES[n.type];
  return `
  <div class="flow-node absolute w-56 rounded-xl bg-[#15151f]/95 border ${t.color} shadow-xl ${flSelected.has(n.id) ? 'ring-2 ring-cyan-400' : ''}" data-id="${n.id}" style="left:${n.x}px;top:${n.y}px">
    <div class="flex items-center justify-between px-3 py-2 border-b border-white/10 cursor-move node-drag">
      <span class="text-white text-xs font-bold">${t.icon} ${t.name} <span class="text-white/30 font-normal">#${n.id.slice(1)}</span></span>
      <button onclick="flDelNode('${n.id}')" class="text-white/30 hover:text-rose-400 text-xs px-1">✕</button>
    </div>
    <div class="p-2.5 node-body" data-type="${n.type}">${flNodeBody(n)}</div>
    <div class="flow-port-in absolute -left-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white/30 border-2 border-[#15151f] cursor-crosshair" data-port="in" data-id="${n.id}" title="輸入"></div>
    <div class="flow-port-out absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-cyan-400 border-2 border-[#15151f] cursor-crosshair" data-port="out" data-id="${n.id}" title="輸出"></div>
    <div class="node-status text-[9px] px-2.5 pb-2 text-white/40">${n.data.status || ''}</div>
  </div>`;
}

function flNodeBody(n) {
  const d = n.data;
  switch (n.type) {
    case 'text':
      return `<textarea rows="3" placeholder="輸入創意 / 劇本..." onchange="flNodeData('${n.id}','text',this.value)"
        class="w-full bg-white/5 rounded-lg px-2 py-1.5 text-white text-xs outline-none resize-none border border-white/10 focus:border-slate-400">${d.text || ''}</textarea>`;
    case 'script':
      return `
        <textarea rows="2" placeholder="輸入劇本或連接文本節點..." onchange="flNodeData('${n.id}','text',this.value)"
          class="w-full bg-white/5 rounded-lg px-2 py-1.5 text-white text-xs outline-none resize-none border border-white/10 focus:border-purple-400">${d.text || ''}</textarea>
        <button onclick="flScriptTable('${n.id}')" class="w-full mt-1.5 py-1.5 rounded-lg bg-purple-500/30 text-purple-200 text-xs font-medium hover:bg-purple-500/50">📋 生成分鏡腳本表</button>
        ${d.table ? `<div class="mt-1.5 text-[10px] text-white/60">已生成 ${d.table.length} 行分鏡</div>
        <button onclick="flBatchPanels('${n.id}')" class="w-full mt-1 py-1.5 rounded-lg bg-pink-500/30 text-pink-200 text-xs font-medium hover:bg-pink-500/50">🖼️ 批量生成分鏡圖</button>` : ''}`;
    case 'image':
      return `
        <div class="relative">
          <input placeholder="畫面提示詞（輸入 / 調用快捷命令）" value="${(d.prompt || '').replace(/"/g, '&quot;')}"
            onchange="flNodeData('${n.id}','prompt',this.value)" oninput="flSlashCheck(event,'${n.id}')"
            class="w-full bg-white/5 rounded-lg px-2 py-1.5 text-white text-xs outline-none border border-white/10 focus:border-pink-400">
        </div>
        <button onclick="flGenImage('${n.id}')" class="w-full mt-1.5 py-1.5 rounded-lg bg-pink-500/30 text-pink-200 text-xs font-medium hover:bg-pink-500/50">✨ 生成圖片</button>
        ${d.image ? `<img src="${d.image}" class="w-full mt-1.5 rounded-lg object-cover aspect-[3/4] bg-white/5">
        <div class="grid grid-cols-5 gap-1 mt-1.5">
          <button onclick="flImageOp('${n.id}','upscale')" title="高清放大" class="py-1 rounded bg-white/10 text-[9px] text-white/70">放大</button>
          <button onclick="flImageOp('${n.id}','expand')" title="擴圖" class="py-1 rounded bg-white/10 text-[9px] text-white/70">擴圖</button>
          <button onclick="flImageOp('${n.id}','cutout')" title="摳圖" class="py-1 rounded bg-white/10 text-[9px] text-white/70">摳圖</button>
          <button onclick="flImageOp('${n.id}','angle')" title="多角度" class="py-1 rounded bg-white/10 text-[9px] text-white/70">角度</button>
          <button onclick="flImageOp('${n.id}','light')" title="打光" class="py-1 rounded bg-white/10 text-[9px] text-white/70">打光</button>
        </div>` : ''}`;
    case 'video':
      return `
        <input placeholder="運鏡 / 動作提示詞" value="${(d.prompt || '').replace(/"/g, '&quot;')}" onchange="flNodeData('${n.id}','prompt',this.value)"
          class="w-full bg-white/5 rounded-lg px-2 py-1.5 text-white text-xs outline-none border border-white/10 focus:border-cyan-400">
        <button onclick="flGenVideo('${n.id}')" class="w-full mt-1.5 py-1.5 rounded-lg bg-cyan-500/30 text-cyan-200 text-xs font-medium hover:bg-cyan-500/50">🎥 圖生視頻</button>
        ${d.video ? `<video src="${d.video}" class="w-full mt-1.5 rounded-lg aspect-video bg-black" muted loop autoplay playsinline></video>` : ''}`;
    case 'audio':
      return `
        <input placeholder="配音文本 / 音樂描述" value="${(d.prompt || '').replace(/"/g, '&quot;')}" onchange="flNodeData('${n.id}','prompt',this.value)"
          class="w-full bg-white/5 rounded-lg px-2 py-1.5 text-white text-xs outline-none border border-white/10 focus:border-amber-400">
        <button onclick="flGenAudio('${n.id}')" class="w-full mt-1.5 py-1.5 rounded-lg bg-amber-500/30 text-amber-200 text-xs font-medium hover:bg-amber-500/50">🎵 生成音頻</button>
        ${d.audio === 'speech' ? '<div class="mt-1.5 text-[10px] text-amber-300">🔊 TTS 已合成（Web Speech 播放）</div>' : ''}
        ${d.audio && d.audio !== 'speech' ? `<audio src="${d.audio}" controls class="w-full mt-1.5 h-8 rounded-lg"></audio>` : ''}`;
    default: return '';
  }
}

function flNodeData(id, key, val) {
  const n = flNodes.find(x => x.id === id);
  if (n) n.data[key] = val;
}

// ---------- 連線 ----------
function flRenderLinks() {
  const svg = document.getElementById('flow-links');
  svg.innerHTML = flLinks.map(l => {
    const a = flNodes.find(n => n.id === l.from), b = flNodes.find(n => n.id === l.to);
    if (!a || !b) return '';
    const x1 = a.x + 224, y1 = a.y + 60, x2 = b.x, y2 = b.y + 60;
    const mx = (x1 + x2) / 2;
    return `<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" stroke="#22d3ee88" stroke-width="2" fill="none"/>`;
  }).join('');
}

let flDragLink = null; // {from, x2, y2}

// ---------- 節點事件綁定（拖動 / 連線 / 平移） ----------
function flBindNodeEvents() {
  document.querySelectorAll('.flow-node .node-drag').forEach(bar => {
    bar.onpointerdown = (ev) => {
      ev.stopPropagation();
      const el = bar.closest('.flow-node');
      const node = flNodes.find(n => n.id === el.dataset.id);
      // 批量連線模式：點擊節點即選為目標
      if (flBatchLinkMode) { flBatchLinkTo(node.id); return; }
      // Shift+點擊：多選（LibTV 框選的移動端替代）
      if (ev.shiftKey) {
        if (flSelected.has(node.id)) flSelected.delete(node.id); else flSelected.add(node.id);
        flRender();
        flToast(`已選 ${flSelected.size} 個節點`);
        return;
      }
      const start = flToCanvas(ev.clientX, ev.clientY);
      const ox = node.x - start.x, oy = node.y - start.y;
      const move = (e) => {
        const p = flToCanvas(e.clientX, e.clientY);
        node.x = p.x + ox; node.y = p.y + oy;
        el.style.left = node.x + 'px'; el.style.top = node.y + 'px';
        flRenderLinks();
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  });
  document.querySelectorAll('.flow-port-out').forEach(port => {
    port.onpointerdown = (ev) => {
      ev.stopPropagation();
      flDragLink = { from: port.dataset.id };
      const move = (e) => {
        const p = flToCanvas(e.clientX, e.clientY);
        flDragLink.x2 = p.x; flDragLink.y2 = p.y;
        flRenderLinks();
        const a = flNodes.find(n => n.id === flDragLink.from);
        if (a) {
          const svg = document.getElementById('flow-links');
          const x1 = a.x + 224, y1 = a.y + 60;
          svg.innerHTML += `<path d="M${x1},${y1} C${(x1 + p.x) / 2},${y1} ${(x1 + p.x) / 2},${p.y} ${p.x},${p.y}" stroke="#22d3ee" stroke-width="2" fill="none" stroke-dasharray="4 3"/>`;
        }
      };
      const up = (e) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        const t = document.elementFromPoint(e.clientX, e.clientY);
        const inPort = t && t.closest ? t.closest('.flow-port-in') : null;
        if (inPort && flDragLink && inPort.dataset.id !== flDragLink.from) {
          const to = inPort.dataset.id;
          if (!flLinks.some(l => l.from === flDragLink.from && l.to === to)) {
            flLinks.push({ from: flDragLink.from, to });
            flToast('🔗 已連接');
          }
        }
        flDragLink = null;
        flRender();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    };
  });
}

// 畫布平移 + 雙擊新建
(function flBindViewport() {
  document.addEventListener('DOMContentLoaded', () => {
    const vp = document.getElementById('flow-viewport');
    if (!vp) return;
    vp.addEventListener('pointerdown', (ev) => {
      if (ev.target !== vp && !ev.target.closest('#flow-canvas')) return;
      if (ev.target.closest('.flow-node')) return;
      const sx = ev.clientX - flView.x, sy = ev.clientY - flView.y;
      const move = (e) => { flView.x = e.clientX - sx; flView.y = e.clientY - sy; flApplyView(); };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    vp.addEventListener('dblclick', (ev) => {
      if (ev.target.closest('.flow-node')) return;
      const p = flToCanvas(ev.clientX, ev.clientY);
      flPickerPos = p;
      const picker = document.getElementById('flow-picker');
      picker.style.left = Math.min(ev.clientX, window.innerWidth - 180) + 'px';
      picker.style.top = Math.min(ev.clientY, window.innerHeight - 220) + 'px';
      picker.classList.remove('hidden');
    });
    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('#flow-picker')) flHidePicker();
      if (!ev.target.closest('#flow-slash')) document.getElementById('flow-slash')?.classList.add('hidden');
    });
  });
})();

function flHidePicker() { document.getElementById('flow-picker')?.classList.add('hidden'); }

// ---------- 節點執行 ----------
async function flRun(id, action) {
  const n = flNodes.find(x => x.id === id);
  if (!n) return;
  n.data.status = '⏳ 執行中...';
  flRenderNodeStatus(n);
  try {
    await action(n);
    n.data.status = '✅ 完成';
  } catch (e) {
    n.data.status = '❌ 失敗';
  }
  flRender();
}

function flRenderNodeStatus(n) {
  const el = document.querySelector(`.flow-node[data-id="${n.id}"] .node-status`);
  if (el) el.textContent = n.data.status;
}

// 腳本節點 → 分鏡腳本表
async function flScriptTable(id) {
  const n = flNodes.find(x => x.id === id);
  const up = flUpstream(n);
  const text = n.data.text || up?.data?.text || '';
  if (text.length < 5) return flToast('請輸入劇本內容（或連接文本節點）');
  await flRun(id, async () => {
    const res = await api.post('/ai/tools/script-table', { scriptText: text, rows: 9 });
    if (res.code !== 200) throw new Error(res.message);
    n.data.table = res.data.rows;
    flToast(`📋 分鏡腳本表已生成（${res.data.rows.length} 行）`);
  });
}

// 腳本節點 → 批量生成分鏡圖（為每行創建圖片節點）
async function flBatchPanels(id) {
  const n = flNodes.find(x => x.id === id);
  if (!n?.data?.table?.length) return;
  flToast('🖼️ 批量生成分鏡圖中...');
  let row = 0;
  for (const r of n.data.table.slice(0, 6)) {
    const img = flAddNode('image', n.x + 280, n.y + row * 240, {
      prompt: `${r.scene}（${r.camera}）`,
    });
    flLinks.push({ from: n.id, to: img.id });
    row++;
    const res = await api.post('/ai/tools/image-op', { op: 'generate', prompt: img.data.prompt });
    if (res.code === 200) img.data.image = res.data.imageUrl;
    flRender();
  }
  flToast(`✅ 已生成 ${row} 個分鏡圖節點`);
}

// 圖片節點 → 生成
async function flGenImage(id) {
  const n = flNodes.find(x => x.id === id);
  const up = flUpstream(n);
  const prompt = n.data.prompt || up?.data?.text || '';
  if (!prompt) return flToast('請輸入畫面提示詞');
  await flRun(id, async () => {
    const res = await api.post('/ai/tools/image-op', {
      op: 'generate', prompt,
      params: { model: document.getElementById('flow-img-model').value },
    });
    if (res.code !== 200) throw new Error(res.message);
    n.data.image = res.data.imageUrl;
    flToast('✨ 圖片已生成');
  });
}

// 圖像工具集
async function flImageOp(id, op) {
  const n = flNodes.find(x => x.id === id);
  const names = { upscale: '高清放大', expand: '擴圖', cutout: '摳圖', angle: '多角度', light: '打光' };
  await flRun(id, async () => {
    const res = await api.post('/ai/tools/image-op', { op, imageUrl: n.data.image, prompt: n.data.prompt });
    if (res.code !== 200) throw new Error(res.message);
    n.data.image = res.data.imageUrl;
    flToast(`${names[op]}完成`);
  });
}

// 視頻節點 → 圖生視頻
async function flGenVideo(id) {
  const n = flNodes.find(x => x.id === id);
  const up = flUpstream(n);
  if (!up?.data?.image && !n.data.prompt) return flToast('請連接圖片節點或輸入提示詞');
  await flRun(id, async () => {
    const res = await api.post('/ai/tools/image-op', {
      op: 'generate', prompt: n.data.prompt || up?.data?.prompt || 'video scene',
      params: { model: document.getElementById('flow-vid-model').value, type: 'video' },
    });
    if (res.code !== 200) throw new Error(res.message);
    n.data.video = res.data.videoUrl || res.data.imageUrl;
    flToast('🎥 視頻已生成');
  });
}

// 音頻節點 → TTS / 音樂
async function flGenAudio(id) {
  const n = flNodes.find(x => x.id === id);
  const up = flUpstream(n);
  const text = n.data.prompt || up?.data?.text || '';
  if (!text) return flToast('請輸入配音文本');
  n.data.status = '🔊 合成中...';
  flRenderNodeStatus(n);
  if ('speechSynthesis' in window) {
    const u = new SpeechSynthesisUtterance(text.slice(0, 100));
    u.lang = 'zh-TW';
    window.speechSynthesis.speak(u);
  }
  n.data.audio = 'speech';
  n.data.status = '✅ 完成';
  flRender();
  flToast('🎵 音頻已合成（TTS 播放中）');
}

// ---------- Slash 命令面板 ----------
const FL_SLASH = [
  { cmd: 'grid-cameras', name: '多機位九宮格' },
  { cmd: 'plot-4', name: '劇情推演四宮格' },
  { cmd: 'char-views', name: '角色三視圖' },
  { cmd: 'grid-25', name: '25 宮格連貫分鏡' },
  { cmd: 'lighting-fix', name: '電影級光影矯正' },
  { cmd: 'plot-forward', name: '畫面推演 +3 秒' },
  { cmd: 'plot-backward', name: '畫面推演 -3 秒' },
];

function flSlashCheck(ev, nodeId) {
  const box = document.getElementById('flow-slash');
  if (ev.target.value === '/') {
    document.getElementById('flow-slash-list').innerHTML = FL_SLASH.map(s =>
      `<button onclick="flSlashRun('${nodeId}','${s.cmd}')" class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-purple-500/20 text-white text-xs">/${s.cmd} <span class="text-white/40">${s.name}</span></button>`
    ).join('');
    box.style.left = Math.min(ev.target.getBoundingClientRect().left, window.innerWidth - 220) + 'px';
    box.style.top = (ev.target.getBoundingClientRect().bottom + 6) + 'px';
    box.classList.remove('hidden');
    ev.target.value = '';
  } else {
    box.classList.add('hidden');
  }
}

async function flSlashRun(nodeId, cmd) {
  document.getElementById('flow-slash').classList.add('hidden');
  const n = flNodes.find(x => x.id === nodeId);
  if (!n) return;
  flToast('⚡ 執行 /' + cmd + '...');
  const res = await api.post('/ai/tools/slash', { command: cmd, prompt: n.data.prompt || 'scene' });
  if (res.code !== 200) return flToast(res.message || '命令失敗');
  // 生成結果以圖片節點組呈現
  const items = res.data.items.slice(0, 4);
  items.forEach((it, i) => {
    const img = flAddNode('image', n.x + 280 + (i % 2) * 240, n.y + Math.floor(i / 2) * 240, {
      prompt: `${res.data.name} #${it.index}`, image: it.imageUrl,
    });
    flLinks.push({ from: n.id, to: img.id });
  });
  flRender();
  flToast(`✅ ${res.data.name}完成（生成 ${items.length} 個節點）`);
}

// ---------- 一鍵執行工作流（按連線拓撲序） ----------
async function flRunWorkflow() {
  if (!flNodes.length) return flToast('畫布是空的，雙擊新建節點開始創作');
  flToast('▶ 工作流開始執行...');
  const done = new Set();
  const sources = flNodes.filter(n => !flLinks.some(l => l.to === n.id));
  const queue = [...sources];
  while (queue.length) {
    const n = queue.shift();
    if (done.has(n.id)) continue;
    done.add(n.id);
    if (n.type === 'script' && (n.data.text || flUpstream(n)?.data?.text) && !n.data.table) await flScriptTable(n.id);
    else if (n.type === 'image' && !n.data.image) await flGenImage(n.id);
    else if (n.type === 'video' && !n.data.video) await flGenVideo(n.id);
    else if (n.type === 'audio' && !n.data.audio) await flGenAudio(n.id);
    flLinks.filter(l => l.from === n.id).forEach(l => {
      const t = flNodes.find(x => x.id === l.to);
      if (t && !done.has(t.id)) queue.push(t);
    });
  }
  flToast('🎉 工作流執行完畢');
}

// ---------- 視頻合成時間軸 ----------
function flOpenTimeline() {
  const vids = flNodes.filter(n => n.type === 'video' && n.data.video);
  if (vids.length < 2) return flToast('至少需要 2 個已生成視頻的節點');
  const box = document.getElementById('flow-clips');
  box.innerHTML = vids.map((v, i) => `
    <div class="flex items-center gap-2 p-2 rounded-lg bg-white/5 border border-white/10" data-clip="${v.id}">
      <span class="text-white/40 text-xs w-5">${i + 1}</span>
      <video src="${v.data.video}" class="w-16 h-10 rounded object-cover bg-black" muted></video>
      <span class="flex-1 text-white/70 text-xs truncate">節點 #${v.id.slice(1)} ${v.data.prompt || ''}</span>
      <label class="text-white/40 text-[9px]">起<input type="number" value="0" min="0" step="0.5" class="clip-start w-10 bg-white/10 rounded px-1 text-white text-[10px] ml-1"></label>
      <label class="text-white/40 text-[9px]">止<input type="number" value="5" min="0.5" step="0.5" class="clip-end w-10 bg-white/10 rounded px-1 text-white text-[10px] ml-1"></label>
      <button onclick="flClipMove('${v.id}',-1)" class="text-white/50 text-xs px-1">↑</button>
      <button onclick="flClipMove('${v.id}',1)" class="text-white/50 text-xs px-1">↓</button>
    </div>`).join('');
  document.getElementById('flow-timeline').classList.remove('hidden');
}

function flClipMove(id, dir) {
  const box = document.getElementById('flow-clips');
  const rows = [...box.children];
  const i = rows.findIndex(r => r.dataset.clip === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= rows.length) return;
  if (dir < 0) box.insertBefore(rows[i], rows[j]); else box.insertBefore(rows[j], rows[i]);
  [...box.children].forEach((r, k) => r.firstElementChild.textContent = k + 1);
}

function flGetClips() {
  return [...document.getElementById('flow-clips').children].map(r => {
    const v = flNodes.find(n => n.id === r.dataset.clip);
    return {
      url: v.data.video, title: v.data.prompt || '',
      start: parseFloat(r.querySelector('.clip-start').value) || 0,
      end: parseFloat(r.querySelector('.clip-end').value) || 5,
    };
  });
}

async function flPreviewCompose() {
  const clips = flGetClips();
  if (clips.length < 2) return;
  const player = document.getElementById('flow-preview');
  player.classList.remove('hidden');
  let i = 0;
  const playNext = () => {
    if (i >= clips.length) { player.removeAttribute('src'); player.load(); return; }
    player.src = clips[i].url;
    player.currentTime = clips[i].start;
    player.play().catch(() => {});
    i++;
  };
  player.onended = playNext;
  playNext();
}

async function flCompose() {
  const clips = flGetClips();
  const res = await api.post('/ai/tools/compose', { clips });
  if (res.code !== 200) return flToast(res.message || '合成失敗');
  flToast(`🎬 合成完成：${res.data.clips} 個片段 · 共 ${res.data.totalDuration}s`);
}

// ---------- 保存 / 恢復（localStorage） ----------
function flSave(silent) {
  localStorage.setItem(FL_SAVE_KEY, JSON.stringify({ nodes: flNodes, links: flLinks, seq: flSeq }));
  if (!silent) flToast('💾 畫布已保存到本地');
}

function flRestore() {
  try {
    const s = JSON.parse(localStorage.getItem(FL_SAVE_KEY) || 'null');
    if (s && s.nodes) {
      flNodes = s.nodes; flLinks = s.links || []; flSeq = s.seq || 1;
      return;
    }
  } catch { /* 忽略損壞數據 */ }
  // 首次打開：給一個示例工作流
  const t = flAddNode('text', 80, 120, { text: '清晨，林晚站在豪門大宅門前，眼神堅定。' });
  const s2 = flAddNode('script', 360, 120);
  const img = flAddNode('image', 640, 120, { prompt: '豪門大宅門前，堅定眼神的少女' });
  const vid = flAddNode('video', 920, 120, { prompt: '推鏡頭' });
  flLinks.push({ from: t.id, to: s2.id }, { from: s2.id, to: img.id }, { from: img.id, to: vid.id });
}

function flToast(msg) {
  const t = document.getElementById('flow-toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2200);
}

window.showFlowCanvas = showFlowCanvas;
window.closeFlowCanvas = closeFlowCanvas;
window.flAddNode = flAddNode;
window.flDelNode = flDelNode;
window.flNodeData = flNodeData;
window.flScriptTable = flScriptTable;
window.flBatchPanels = flBatchPanels;
window.flGenImage = flGenImage;
window.flImageOp = flImageOp;
window.flGenVideo = flGenVideo;
window.flGenAudio = flGenAudio;
window.flSlashCheck = flSlashCheck;
window.flSlashRun = flSlashRun;
window.flRunWorkflow = flRunWorkflow;
window.flOpenTimeline = flOpenTimeline;
window.flClipMove = flClipMove;
window.flPreviewCompose = flPreviewCompose;
window.flCompose = flCompose;
window.flSave = flSave;
window.flZoom = flZoom;
window.flResetView = flResetView;
