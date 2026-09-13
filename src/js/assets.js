// ===== v6.1 我的素材庫（IndexedDB 統一管理 + 插入創作畫布）=====
// @ts-check
// 支持圖片 / 視頻 / 音頻 / 劇本文件上傳；可預覽、插入畫布、解析進編劇台、刪除、下載

const ASSET_DB = 'julang-assets';
const ASSET_STORE = 'assets';
let assetDb = null;
let assetCache = [];       // [{id,name,type,mime,size,createdAt}]（不含 blob）
let assetFilter = 'all';

// ---------- IndexedDB ----------
function assetOpenDb() {
  if (assetDb) return Promise.resolve(assetDb);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ASSET_DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => { assetDb = req.result; resolve(assetDb); };
    req.onerror = () => reject(req.error);
  });
}

async function assetAdd(file) {
  const db = await assetOpenDb();
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  const type = file.type.startsWith('image/') ? 'image'
    : file.type.startsWith('video/') ? 'video'
    : file.type.startsWith('audio/') ? 'audio'
    : ['txt', 'md', 'docx', 'pdf'].includes(ext) ? 'script' : 'other';
  const rec = {
    id: 'as' + Date.now() + Math.floor(Math.random() * 1000),
    name: file.name, type, mime: file.type || 'application/octet-stream',
    size: file.size, createdAt: new Date().toISOString(), blob: file,
  };
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readwrite');
    tx.objectStore(ASSET_STORE).put(rec);
    tx.oncomplete = () => resolve(rec);
    tx.onerror = () => {
      const err = tx.error;
      if (err && (err.name === 'QuotaExceededError' || err.name === 'QuotaExceeded')) {
        assetToast('⚠️ 存儲空間不足，請刪除舊素材後再試');
      } else {
        assetToast('❌ 保存失敗：' + (err?.message || '未知錯誤'));
      }
      reject(err);
    };
  });
}

async function assetList() {
  const db = await assetOpenDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readonly');
    const req = tx.objectStore(ASSET_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function assetRemove(id) {
  const db = await assetOpenDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ASSET_STORE, 'readwrite');
    tx.objectStore(ASSET_STORE).delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}

// ---------- UI ----------
const ASSET_TYPE_NAME = { image: '圖片', video: '視頻', audio: '音頻', script: '劇本文件', other: '其他' };
const ASSET_TYPE_ICON = { image: '🖼️', video: '🎥', audio: '🎵', script: '📄', other: '📦' };

async function showAssetLib(autoPick) {
  if (!api.isLoggedIn()) return showLogin();
  closeUpload();
  document.getElementById('assets-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  await assetRenderList();
  if (autoPick) assetPickFiles();
}

function closeAssetLib() {
  document.getElementById('assets-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function assetPickFiles() {
  const inp = document.getElementById('asset-file-input');
  inp.onchange = async () => {
    const files = [...(inp.files || [])];
    inp.value = '';
    if (!files.length) return;
    let ok = 0;
    for (const f of files) {
      if (f.size > 30 * 1024 * 1024) { assetToast(`⚠️ ${f.name} 超過 30MB 上限，已跳過`); continue; }
      try { await assetAdd(f); ok++; } catch { assetToast(`⚠️ ${f.name} 保存失敗`); }
    }
    if (ok) assetToast(`✅ 已入庫 ${ok} 個素材`);
    assetRenderList();
  };
  inp.click();
}

async function assetRenderList() {
  const box = document.getElementById('assets-grid');
  // 清理舊 ObjectURL，防止內存洩漏
  assetObjectURLs.forEach(url => { try { URL.revokeObjectURL(url); } catch (_) {} });
  assetObjectURLs.clear();
  box.innerHTML = '<div class="col-span-3 flex justify-center py-8"><div class="loading-spinner"></div></div>';
  try {
    assetCache = (await assetList()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    box.innerHTML = '<p class="col-span-3 text-center text-white/40 text-sm py-8">素材庫初始化失敗（瀏覽器不支持 IndexedDB）</p>';
    return;
  }
  const totalSize = assetCache.reduce((s, a) => s + (a.size || 0), 0);
  document.getElementById('assets-meta').textContent =
    `共 ${assetCache.length} 個素材 · ${(totalSize / 1024 / 1024).toFixed(1)} MB（存於本機瀏覽器）`;
  const list = assetCache.filter(a => assetFilter === 'all' || a.type === assetFilter);
  if (!list.length) {
    box.innerHTML = `<div class="col-span-3 text-center py-10">
      <p class="text-white/40 text-sm mb-3">${assetCache.length ? '此分類暫無素材' : '素材庫是空的，上傳第一批素材吧'}</p>
      <button onclick="assetPickFiles()" class="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-500 text-white text-sm font-bold">📤 上傳素材</button>
    </div>`;
    return;
  }
  box.innerHTML = list.map(a => {
    const url = URL.createObjectURL(a.blob);
    assetObjectURLs.add(url);
    const thumb = a.type === 'image' ? `<img src="${url}" class="w-full aspect-square object-cover rounded-t-xl bg-white/5" loading="lazy">`
      : a.type === 'video' ? `<video src="${url}" class="w-full aspect-square object-cover rounded-t-xl bg-black" muted playsinline preload="metadata"></video>`
      : `<div class="w-full aspect-square rounded-t-xl bg-white/5 flex items-center justify-center text-4xl">${ASSET_TYPE_ICON[a.type]}</div>`;
    return `
    <div class="rounded-xl bg-white/5 border border-white/10 overflow-hidden">
      ${thumb}
      <div class="p-2">
        <p class="text-white/80 text-[10px] truncate" title="${a.name}">${a.name}</p>
        <p class="text-white/30 text-[9px]">${ASSET_TYPE_NAME[a.type]} · ${(a.size / 1024).toFixed(0)}KB</p>
        <div class="grid grid-cols-3 gap-1 mt-1.5">
          ${a.type === 'script'
            ? `<button onclick="assetToScriptwriter('${a.id}')" class="py-1 rounded bg-amber-500/20 text-amber-300 text-[9px] font-bold">編劇台</button>`
            : `<button onclick="assetToCanvas('${a.id}')" class="py-1 rounded bg-cyan-500/20 text-cyan-300 text-[9px] font-bold">入畫布</button>`}
          <button onclick="assetDownload('${a.id}')" class="py-1 rounded bg-white/10 text-white/60 text-[9px]">下載</button>
          <button onclick="assetDelete('${a.id}')" class="py-1 rounded bg-white/10 text-white/40 text-[9px] hover:text-rose-400">刪除</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function assetSetFilter(f, btn) {
  assetFilter = f;
  document.querySelectorAll('.asset-filter-btn').forEach(b => {
    b.className = 'asset-filter-btn px-3 py-1.5 rounded-full text-xs whitespace-nowrap ' +
      (b === btn ? 'bg-cyan-500 text-white font-bold' : 'bg-white/10 text-white/60');
  });
  assetRenderList();
}

// ---------- 操作 ----------
function assetFind(id) { return assetCache.find(a => a.id === id); }

async function assetToCanvas(id) {
  const a = assetFind(id);
  if (!a) return;
  const url = URL.createObjectURL(a.blob);
  closeAssetLib();
  await showFlowCanvas();
  const data = { prompt: a.name, status: '📂 來自素材庫（本機）' };
  if (a.type === 'image') data.image = url;
  else if (a.type === 'video') data.video = url;
  else if (a.type === 'audio') data.audio = url;
  else { flToast('僅圖片/視頻/音頻可入畫布'); return; }
  const n = flAddNode(a.type, 120 + (flNodes.length % 5) * 40, 420 + (flNodes.length % 3) * 60, data);
  flRender();
  flToast(`📂 素材「${a.name}」已作為${ASSET_TYPE_NAME[a.type]}節點入畫布`);
  return n;
}

async function assetToScriptwriter(id) {
  const a = assetFind(id);
  if (!a) return;
  assetToast('📂 解析劇本文件中...');
  try {
    const text = await jlParseScriptFile(a.blob instanceof File ? a.blob : new File([a.blob], a.name, { type: a.mime }));
    const title = a.name.replace(/\.(txt|md|docx|pdf)$/i, '');
    swCreateScript(title, text, '都市');
    closeAssetLib();
    showScriptwriter();
    swToast(`✅ 《${title}》已解析進編劇台`);
  } catch (e) {
    assetToast('❌ 解析失敗（docx/pdf 需聯網加載解析庫）');
  }
}

function assetDownload(id) {
  const a = assetFind(id);
  if (!a) return;
  const url = URL.createObjectURL(a.blob);
  const el = document.createElement('a');
  el.href = url; el.download = a.name; el.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function assetDelete(id) {
  const a = assetFind(id);
  if (!a || !confirm(`刪除素材「${a.name}」？`)) return;
  await assetRemove(id);
  assetToast('🗑️ 已刪除');
  assetRenderList();
}

// 從創作畫布直接上傳（flow-picker 入口）
function assetPickForCanvas() {
  const inp = document.getElementById('asset-file-input');
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    inp.value = '';
    if (!f) return;
    try {
      const rec = await assetAdd(f);
      assetCache = [];
      const url = URL.createObjectURL(rec.blob);
      const data = { prompt: rec.name, status: '📂 上傳素材（本機）' };
      if (rec.type === 'image') data.image = url;
      else if (rec.type === 'video') data.video = url;
      else if (rec.type === 'audio') data.audio = url;
      else { flToast('已入素材庫；圖片/視頻/音頻才能直接入畫布'); return; }
      flAddNode(rec.type, undefined, undefined, data);
      flToast('📂 已上傳並加入畫布');
    } catch { flToast('上傳失敗'); }
  };
  inp.click();
}

function assetToast(msg) {
  const t = document.getElementById('assets-toast');
  if (!t) return alert(msg);
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2200);
}

window.showAssetLib = showAssetLib;
window.closeAssetLib = closeAssetLib;
window.assetPickFiles = assetPickFiles;
window.assetSetFilter = assetSetFilter;
window.assetToCanvas = assetToCanvas;
window.assetToScriptwriter = assetToScriptwriter;
window.assetDownload = assetDownload;
window.assetDelete = assetDelete;
window.assetPickForCanvas = assetPickForCanvas;
