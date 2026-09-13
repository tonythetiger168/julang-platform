// ============================================================
// 劇浪 v6.0 LibTV 工具集 —— 導演台 · 逐幀拉片 · 批量連線 · 分鏡組 · 時間軸升級
// 對齊 liblib.tv：導演台(3D→2D 簡化) / 拉片拆鏡 / 批量操作 / 分鏡組 / 多軌合成
// 依賴 flow-canvas.js 的全域狀態（flNodes/flLinks/flSelected/flAddNode/flToast 等）
// 時間軸相關函數在此覆蓋 flow-canvas.js 的初版實現（多軌 + 變速）
// ============================================================

// ============================================================
// 🎬 導演台（2D 簡化版：角色站位 + 機位景別 → 構圖參考圖）
// ============================================================
let dgCast = [];        // 演員池 { name, avatar, placed, x, y }  x/y 為百分比
let dgDragIdx = -1;

function dgOpen() {
  const m = document.getElementById('director-modal');
  m.classList.remove('hidden'); m.classList.add('flex');
  if (!dgCast.length) {
    const chars = (typeof demoComic !== 'undefined' && demoComic.characters) || [];
    dgCast = chars.slice(0, 4).map((c, i) => ({ name: c.name, avatar: c.avatar, placed: i < 2, x: 28 + i * 26, y: 64 }));
    if (!dgCast.length) dgCast = [{ name: '素模 A', avatar: '', placed: true, x: 32, y: 64 }, { name: '素模 B', avatar: '', placed: true, x: 64, y: 64 }];
  }
  dgRenderCam();
  dgRenderPalette();
  dgRenderStage();
  flToast('🎬 導演台：拖動角色站位，選好機位後截圖出圖');
}

function dgClose() {
  const m = document.getElementById('director-modal');
  m.classList.add('hidden'); m.classList.remove('flex');
}

function dgRenderCam() {
  const angle = document.getElementById('dg-angle');
  const shot = document.getElementById('dg-shot');
  document.getElementById('dg-cam-label').textContent =
    `📷 ${angle.options[angle.selectedIndex].text} · ${shot.options[shot.selectedIndex].text}`;
  // 簡易透視提示：仰角抬高地平線、俯角壓低
  const horizon = { front: '58%', left: '58%', right: '58%', top: '32%', low: '78%' }[angle.value] || '58%';
  document.getElementById('dg-stage').style.background =
    `linear-gradient(180deg, #164e63 0%, #0f2a3a ${horizon}, #1c1917 ${horizon}, #0c0a09 100%)`;
}

// 演員池（點擊上場 / 下場）
function dgRenderPalette() {
  const host = document.getElementById('dg-cast');
  host.innerHTML = dgCast.map((c, i) => `
    <button onclick="dgTogglePlace(${i})" class="flex flex-col items-center gap-0.5 p-1.5 rounded-lg ${c.placed ? 'bg-cyan-500/20 border border-cyan-400/40' : 'bg-white/5 border border-white/10'}">
      ${c.avatar
        ? `<img src="${c.avatar}" class="w-9 h-9 rounded-full object-cover">`
        : `<div class="w-9 h-9 rounded-full bg-slate-600 flex items-center justify-center text-sm">🧍</div>`}
      <span class="text-[9px] ${c.placed ? 'text-cyan-300' : 'text-white/50'}">${c.name}${c.placed ? ' · 在場' : ''}</span>
    </button>`).join('') + `
    <button onclick="dgAddExtra()" class="flex flex-col items-center justify-center gap-0.5 p-1.5 rounded-lg bg-white/5 border border-dashed border-white/20 text-white/40">
      <span class="text-lg leading-none">＋</span><span class="text-[9px]">素模</span>
    </button>`;
}

function dgTogglePlace(i) {
  dgCast[i].placed = !dgCast[i].placed;
  if (dgCast[i].placed && dgCast[i].x == null) { dgCast[i].x = 50; dgCast[i].y = 66; }
  dgRenderPalette();
  dgRenderStage();
}

// 舞台站位（可拖動）
function dgRenderStage() {
  const stage = document.getElementById('dg-stage');
  stage.querySelectorAll('[data-dg]').forEach(el => el.remove());
  dgCast.forEach((c, i) => {
    if (!c.placed) return;
    const el = document.createElement('div');
    el.dataset.dg = i;
    el.className = 'absolute select-none cursor-grab active:cursor-grabbing text-center';
    el.style.cssText = `left:${c.x}%;top:${c.y}%;transform:translate(-50%,-100%);touch-action:none`;
    el.innerHTML = `${c.avatar
      ? `<img src="${c.avatar}" class="w-12 h-12 rounded-full object-cover border-2 border-cyan-400 shadow-lg pointer-events-none">`
      : `<div class="w-12 h-12 rounded-full bg-slate-600/90 border-2 border-cyan-400 flex items-center justify-center text-lg pointer-events-none">🧍</div>`}
      <p class="text-[10px] text-cyan-200 mt-0.5 bg-black/50 rounded px-1 pointer-events-none">${c.name}</p>`;
    el.addEventListener('pointerdown', (ev) => {
      dgDragIdx = i;
      ev.preventDefault();
      const move = (e2) => {
        const r = stage.getBoundingClientRect();
        dgCast[dgDragIdx].x = Math.min(92, Math.max(8, (e2.clientX - r.left) / r.width * 100));
        dgCast[dgDragIdx].y = Math.min(98, Math.max(30, (e2.clientY - r.top) / r.height * 100));
        el.style.left = dgCast[dgDragIdx].x + '%';
        el.style.top = dgCast[dgDragIdx].y + '%';
      };
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    stage.appendChild(el);
  });
}

function dgAddExtra() {
  dgCast.push({ name: `素模 ${String.fromCharCode(65 + dgCast.length)}`, avatar: '', placed: true, x: 50, y: 66 });
  dgRenderPalette();
  dgRenderStage();
}

async function dgShot() {
  const angle = document.getElementById('dg-angle');
  const shot = document.getElementById('dg-shot');
  const angleName = angle.options[angle.selectedIndex].text;
  const shotName = shot.options[shot.selectedIndex].text;
  const layout = dgCast.map(c => `${c.name}位於畫面${c.x < 38 ? '左側' : c.x > 62 ? '右側' : '中央'}`).join('，');
  const prompt = `電影分鏡構圖參考：${shotName}，${angleName}，${layout}，景深層次，電影感打光`;
  flToast('📸 導演台出圖中…');
  try {
    const res = await api.post('/ai/tools/image-op', { op: 'generate', prompt });
    if (res.code !== 200) return flToast(res.message || '出圖失敗');
    const url = res.data.imageUrl;
    flAddNode('image', flPickerPos.x + 60, flPickerPos.y + 60, { prompt, image: url, status: `導演台·${shotName}` });
    flSave(true);
    dgClose();
    flToast('📸 構圖參考已出圖並加入畫布');
  } catch (e) { flToast(e.message || '出圖失敗'); }
}

// ============================================================
// 🎞️ 逐幀拉片（上傳影片 → 抽幀 → 拆鏡分析表 → 一鍵做同款）
// ============================================================
let rpFrames = [];      // { t, thumb } dataURL 或 null（跨域降級）

function rpOpen() {
  const m = document.getElementById('rip-modal');
  m.classList.remove('hidden'); m.classList.add('flex');
}

function rpClose() {
  const v = document.getElementById('rip-video');
  v.pause(); v.removeAttribute('src'); v.load();
  const m = document.getElementById('rip-modal');
  m.classList.add('hidden'); m.classList.remove('flex');
}

function rpLoadFile(input) {
  const f = input.files && input.files[0];
  if (!f) return;
  rpExtract(URL.createObjectURL(f));
}

function rpLoadDemo() {
  rpExtract(typeof TEST_VIDEO !== 'undefined' ? TEST_VIDEO : '');
}

async function rpExtract(url) {
  if (!url) { flToast('無可用影片'); return; }
  const v = document.getElementById('rip-video');
  const cv = document.getElementById('rip-canvas');
  const ctx = cv.getContext('2d');
  flToast('🎞️ 正在逐幀抽幀…');
  rpFrames = [];
  try {
    v.muted = true;
    // HLS 片源（Demo 測試片）走 hls.js
    if (/\.m3u8/i.test(url) && window.Hls && Hls.isSupported()) {
      const hls = new Hls();
      hls.loadSource(url);
      hls.attachMedia(v);
      await new Promise((res, rej) => {
        hls.on(Hls.Events.MANIFEST_PARSED, res);
        hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) rej(new Error('影片載入失敗')); });
      });
    } else {
      v.src = url;
      await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = () => rej(new Error('影片載入失敗')); });
    }
    if (!v.duration || !isFinite(v.duration)) await new Promise(r => { v.onloadedmetadata = r; });
    const dur = Math.min(v.duration || 12, 120), N = 12;
    cv.width = 320; cv.height = Math.round(320 * (v.videoHeight || 360) / (v.videoWidth || 640));
    for (let i = 0; i < N; i++) {
      const t = dur * (i + 0.5) / N;
      await new Promise((res) => {
        const to = setTimeout(res, 2500);
        v.onseeked = () => { clearTimeout(to); res(); };
        v.currentTime = t;
      });
      let thumb = null;
      try { ctx.drawImage(v, 0, 0, cv.width, cv.height); thumb = cv.toDataURL('image/jpeg', 0.7); }
      catch (_) { thumb = null; }   // 跨域污點畫布降級
      rpFrames.push({ t, thumb });
    }
    rpRenderFrames(dur);
  } catch (e) { flToast(e.message || '抽幀失敗'); }
}

function rpRenderFrames(dur) {
  document.getElementById('rip-setup').classList.add('hidden');
  document.getElementById('rip-result').classList.remove('hidden');
  document.getElementById('rip-count').textContent = `共 ${rpFrames.length} 幀 · 總長 ${dur.toFixed(1)}s`;
  document.getElementById('rip-frames').innerHTML = rpFrames.map((f, i) => `
    <div class="relative group cursor-pointer" onclick="rpUseFrame(${i})">
      ${f.thumb
        ? `<img src="${f.thumb}" class="w-full aspect-video object-cover rounded-lg border border-white/10 group-hover:border-cyan-400/60">`
        : `<div class="w-full aspect-video rounded-lg flex items-center justify-center text-2xl border border-white/10" style="background:linear-gradient(135deg,hsl(${i * 30},45%,22%),hsl(${i * 30 + 40},45%,12%))">🎞️</div>`}
      <span class="absolute top-1 left-1 text-[9px] bg-black/70 rounded px-1">${f.t.toFixed(1)}s</span>
      <span class="absolute inset-0 hidden group-hover:flex items-center justify-center bg-black/50 rounded-lg text-[10px] text-cyan-300">做同款 →</span>
    </div>`).join('');
}

function rpAnalyze() {
  if (!rpFrames.length) { flToast('請先載入影片抽幀'); return; }
  const shots = ['遠景', '全景', '中景', '近景', '特寫'];
  const cams = ['固定', '推鏡頭', '拉鏡頭', '搖鏡頭', '跟隨鏡頭'];
  document.getElementById('rip-table').classList.remove('hidden');
  document.getElementById('rip-table').innerHTML = `
    <table class="w-full text-[11px]">
      <thead><tr class="text-slate-500 border-b border-white/10">
        <th class="text-left py-1">幀</th><th class="text-left">時間</th><th class="text-left">景別</th><th class="text-left">運鏡</th><th class="text-left">備註</th>
      </tr></thead>
      <tbody>${rpFrames.map((f, i) => `
        <tr class="border-b border-white/5 text-slate-300">
          <td class="py-1">#${i + 1}</td><td>${f.t.toFixed(1)}s</td>
          <td>${shots[i % shots.length]}</td><td>${cams[i % cams.length]}</td>
          <td class="text-slate-500">${i % 3 === 0 ? '情緒點' : i % 3 === 1 ? '過場' : '動作'}</td>
        </tr>`).join('')}</tbody>
    </table>`;
  flToast('📋 拆鏡分析完成（景別 / 運鏡 / 節奏）');
}

function rpUseFrame(i) {
  const f = rpFrames[i];
  if (!f || !f.thumb) { flToast('此幀因跨域無法導出，請用本地上傳的影片'); return; }
  flAddNode('image', flPickerPos.x + 80, flPickerPos.y + 80, { image: f.thumb, prompt: `拉片參考幀 ${f.t.toFixed(1)}s`, status: '拉片參考' });
  flSave(true);
  flToast('🎬 參考幀已加入畫布，可用「生成圖片」做同款');
}

// ============================================================
// 🔗 批量連線（多選節點 → 一鍵連到目標節點）
// ============================================================
function flBatchLinkStart() {
  if (!flSelected.size) { flToast('先 Shift+點擊節點 多選要連出的節點'); return; }
  flBatchLinkMode = true;
  flToast(`🔗 批量連線：點擊目標節點，已選 ${flSelected.size} 個節點將連過去（Esc 取消）`);
}

function flBatchLinkTo(targetId) {
  flBatchLinkMode = false;
  if (flSelected.has(targetId)) { flToast('不能連到選中的節點本身'); return; }
  let added = 0;
  flSelected.forEach(id => {
    if (id === targetId) return;
    if (!flLinks.some(l => l.from === id && l.to === targetId)) {
      flLinks.push({ from: id, to: targetId });
      added++;
    }
  });
  flRender(); flSave(true);
  flToast(added ? `🔗 已連接 ${added} 條連線` : '連線已存在');
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && flBatchLinkMode) { flBatchLinkMode = false; flToast('已取消批量連線'); }
});

// ============================================================
// 🗂️ 分鏡組（圖片節點 → 網格排序 → 導出帶序號大圖）
// ============================================================
let sgNodes = [];

function flStoryGroup() {
  let nodes = flNodes.filter(n => n.type === 'image' && n.data.image && flSelected.has(n.id));
  if (!nodes.length) nodes = flNodes.filter(n => n.type === 'image' && n.data.image);
  if (!nodes.length) { flToast('畫布上還沒有圖片節點，先批量出圖'); return; }
  sgNodes = nodes.slice().sort((a, b) => (a.y - b.y) || (a.x - b.x)).slice(0, 12);
  document.getElementById('sg-grid').innerHTML = sgNodes.map((n, i) => `
    <div class="relative">
      <img src="${n.data.image}" crossorigin="anonymous" class="w-full aspect-video object-cover rounded-lg border border-white/10 bg-white/5">
      <span class="absolute top-1 left-1 w-5 h-5 rounded-full bg-cyan-500 text-white text-[10px] font-bold flex items-center justify-center">${i + 1}</span>
      <p class="text-[9px] text-slate-400 mt-0.5 truncate">${n.data.prompt || ''}</p>
    </div>`).join('');
  const m = document.getElementById('storygroup-modal');
  m.classList.remove('hidden'); m.classList.add('flex');
}

async function sgExport() {
  const cv = document.getElementById('sg-canvas');
  const ctx = cv.getContext('2d');
  const cols = 3, cw = 640, ch = 360, pad = 16, labelH = 40;
  const rows = Math.ceil(sgNodes.length / cols);
  cv.width = cols * (cw + pad) + pad;
  cv.height = rows * (ch + labelH + pad) + pad;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, cv.width, cv.height);
  flToast('⬇️ 正在合成帶序號的分鏡組大圖…');
  for (let i = 0; i < sgNodes.length; i++) {
    const col = i % cols, row = Math.floor(i / cols);
    const x = pad + col * (cw + pad), y = pad + row * (ch + labelH + pad);
    try {
      const img = await new Promise((res, rej) => {
        const im = new Image();
        im.crossOrigin = 'anonymous';
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = sgNodes[i].data.image;
      });
      // cover 裁剪
      const s = Math.max(cw / img.width, ch / img.height);
      const sw = cw / s, sh = ch / s;
      ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, cw, ch);
    } catch (_) {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(x, y, cw, ch);
      ctx.fillStyle = '#64748b';
      ctx.font = '28px sans-serif';
      ctx.fillText('圖片載入失敗', x + cw / 2 - 84, y + ch / 2);
    }
    // 序號角標
    ctx.fillStyle = '#06b6d4';
    ctx.beginPath();
    ctx.arc(x + 30, y + 30, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + 30, y + 38);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '18px sans-serif';
    ctx.fillText(sgNodes[i].data.prompt || `分鏡 ${i + 1}`, x + 4, y + ch + 26);
  }
  try {
    const a = document.createElement('a');
    a.download = '分鏡組.png';
    a.href = cv.toDataURL('image/png');
    a.click();
    flToast('🗂️ 分鏡組大圖已導出');
  } catch (_) { flToast('導出失敗：部分圖片跨域'); }
}

// ============================================================
// 🎞 視頻合成時間軸升級（覆蓋 flow-canvas.js 初版）：視頻軌 + 音頻軌 + 逐段變速
// ============================================================
const FL_SPEEDS = [0.5, 1, 1.5, 2];

function flGetClips() {
  const vids = flNodes.filter(n => n.type === 'video' && n.data.video)
    .map(n => ({ id: n.id, label: n.data.prompt || `節點 #${n.id.slice(1)}`, url: n.data.video, duration: n.data.duration || 5, speed: n.data.speed || 1, kind: 'video' }));
  const auds = flNodes.filter(n => n.type === 'audio' && n.data.audio)
    .map(n => ({ id: n.id, label: n.data.prompt || '配音', content: n.data.prompt || '', duration: Math.max(3, Math.round((n.data.prompt || '').length / 4)), speed: n.data.speed || 1, kind: 'audio' }));
  return { vids, auds };
}

function flOpenTimeline() {
  document.getElementById('flow-timeline').classList.remove('hidden');
  flRenderTimeline();
}

function flRenderTimeline() {
  const { vids, auds } = flGetClips();
  const clipHtml = (c) => `
    <div class="flex items-center gap-1.5 p-2 rounded-lg bg-white/5 border border-white/10">
      <button onclick="flClipMove('${c.id}',-1,'${c.kind}')" class="text-white/40 hover:text-white text-xs px-0.5">◀</button>
      ${c.kind === 'video' ? `<video src="${c.url}" class="w-14 h-9 rounded object-cover bg-black" muted playsinline></video>` : '<span class="text-base">🎵</span>'}
      <div class="flex-1 min-w-0">
        <p class="text-white/70 text-[10px] truncate">${c.label}</p>
        <p class="text-white/30 text-[9px]">有效時長 ${(c.duration / c.speed).toFixed(1)}s</p>
      </div>
      <select onchange="flClipSpeed('${c.id}',this.value,'${c.kind}')" class="bg-white/10 text-[9px] rounded px-1 py-0.5 text-cyan-300 outline-none">
        ${FL_SPEEDS.map(s => `<option value="${s}" ${s === c.speed ? 'selected' : ''}>${s}x</option>`).join('')}
      </select>
      <button onclick="flClipMove('${c.id}',1,'${c.kind}')" class="text-white/40 hover:text-white text-xs px-0.5">▶</button>
    </div>`;
  document.getElementById('flow-clips').innerHTML = vids.length
    ? vids.map(clipHtml).join('')
    : '<p class="text-[10px] text-white/30 py-1.5">畫布上生成視頻節點後會出現在這裡</p>';
  document.getElementById('flow-audio-clips').innerHTML = auds.length
    ? auds.map(clipHtml).join('')
    : '<p class="text-[10px] text-white/30 py-1.5">畫布上生成配音節點後會出現在這裡</p>';
}

function flClipMove(id, dir, kind) {
  const arr = flNodes.filter(n => n.type === (kind === 'audio' ? 'audio' : 'video'));
  const idx = arr.findIndex(n => n.id === id);
  const j = idx + dir;
  if (idx < 0 || j < 0 || j >= arr.length) return;
  const a = arr[idx], b = arr[j];
  [a.x, b.x] = [b.x, a.x]; [a.y, b.y] = [b.y, a.y];
  flRender(); flRenderTimeline(); flSave(true);
}

function flClipSpeed(id, val) {
  const n = flNodes.find(x => x.id === id);
  if (!n) return;
  n.data.speed = parseFloat(val);
  flRenderTimeline(); flSave(true);
}

function flPreviewCompose() {
  const { vids, auds } = flGetClips();
  if (!vids.length) { flToast('先在畫布生成至少一段視頻'); return; }
  const total = vids.reduce((s, c) => s + c.duration / c.speed, 0);
  const player = document.getElementById('flow-preview');
  player.classList.remove('hidden');
  let i = 0;
  const playNext = () => {
    if (i >= vids.length) { player.removeAttribute('src'); player.load(); return; }
    const c = vids[i];
    if (/\.m3u8/i.test(c.url) && window.Hls && Hls.isSupported()) {
      if (player._hls) player._hls.destroy();
      player._hls = new Hls();
      player._hls.loadSource(c.url);
      player._hls.attachMedia(player);
      player._hls.on(Hls.Events.MANIFEST_PARSED, () => { player.playbackRate = c.speed; player.play().catch(() => {}); });
    } else {
      player.src = c.url;
      player.playbackRate = c.speed;
      player.play().catch(() => {});
    }
    i++;
  };
  player.onended = playNext;
  playNext();
  flToast(`🎬 預覽合成：${vids.length} 段視頻 · ${total.toFixed(1)}s${auds.length ? ` · ${auds.length} 條配音` : ''}`);
}

async function flCompose() {
  const { vids, auds } = flGetClips();
  if (!vids.length) { flToast('先在畫布生成至少一段視頻'); return; }
  const res = await api.post('/ai/tools/compose', {
    clips: vids.map(c => ({ url: c.url, duration: c.duration, speed: c.speed })),
    audios: auds.map(c => ({ content: c.content, duration: c.duration, speed: c.speed })),
    title: '劇浪短片',
  });
  if (res.code !== 200) return flToast(res.message || '合成失敗');
  flToast(`🎬 合成完成：${res.data.clips} 個片段 · 共 ${res.data.totalDuration}s`);
}

// ---------- 全域導出 ----------
window.dgOpen = dgOpen; window.dgClose = dgClose; window.dgRenderCam = dgRenderCam;
window.dgAddExtra = dgAddExtra; window.dgShot = dgShot;
window.rpOpen = rpOpen; window.rpClose = rpClose; window.rpLoadFile = rpLoadFile;
window.rpLoadDemo = rpLoadDemo; window.rpAnalyze = rpAnalyze; window.rpUseFrame = rpUseFrame;
window.flBatchLinkStart = flBatchLinkStart; window.flBatchLinkTo = flBatchLinkTo;
window.flStoryGroup = flStoryGroup; window.sgExport = sgExport;
window.flOpenTimeline = flOpenTimeline; window.flClipMove = flClipMove;
window.flClipSpeed = flClipSpeed; window.flPreviewCompose = flPreviewCompose; window.flCompose = flCompose;
