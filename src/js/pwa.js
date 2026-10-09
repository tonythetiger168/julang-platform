// ===== v6.0 PWA 支持（安裝 / 離線 / 觀看歷史）=====
// @ts-check

// ---------- Service Worker 註冊 ----------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

// ---------- 安裝提示 ----------
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  const banner = document.getElementById('pwa-install-banner');
  if (banner && !localStorage.getItem('pwa_install_dismissed')) banner.classList.remove('hidden');
});

async function pwaInstall() {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.getElementById('pwa-install-banner')?.classList.add('hidden');
}

function pwaDismissInstall() {
  document.getElementById('pwa-install-banner')?.classList.add('hidden');
  localStorage.setItem('pwa_install_dismissed', '1');
}

// ---------- 本地觀看歷史（LibreTV 式，localStorage） ----------
const HISTORY_KEY = 'julang_watch_history';

function pwaRecordHistory(item) {
  // item: { id, type: 'drama'|'comic', title, cover, progress? }
  let list = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  list = list.filter(x => !(x.id === item.id && x.type === item.type));
  list.unshift({ ...item, at: Date.now() });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 50)));
}

function pwaGetHistory() {
  return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
}

function pwaClearHistory() {
  if (!confirm('清空全部觀看歷史？')) return;
  localStorage.removeItem(HISTORY_KEY);
  renderMinePanel();
}

// v6.0 深化：刪除單條歷史（同時清除其播放進度記憶）
function pwaRemoveHistory(id, type, ev) {
  if (ev) ev.stopPropagation();
  const list = pwaGetHistory().filter(x => !(x.id === id && x.type === type));
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
  const map = JSON.parse(localStorage.getItem('julang_play_progress') || '{}');
  delete map[id];
  localStorage.setItem('julang_play_progress', JSON.stringify(map));
  renderMinePanel();
}

// ---------- 我的頁（歷史 + 收藏） ----------
async function renderMinePanel() {
  const box = document.getElementById('mine-panel');
  if (!box) return;
  const history = pwaGetHistory();
  let favs = [];
  if (api.isLoggedIn()) {
    const res = await api.get('/community/favorites');
    if (res.code === 200) favs = res.data;
  }
  box.innerHTML = `
    <div class="px-4 py-3">
      <div class="flex items-center justify-between mb-3">
        <h4 class="text-white font-bold text-sm">📺 觀看歷史</h4>
        ${history.length ? '<button onclick="pwaClearHistory()" class="text-white/30 text-xs">清空</button>' : ''}
      </div>
      ${history.length ? `<div class="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
        ${history.map(h => {
          const prog = JSON.parse(localStorage.getItem('julang_play_progress') || '{}')[h.id];
          return `
          <div class="flex-shrink-0 w-24 relative cursor-pointer group" onclick="${h.type === 'comic' ? `openComicPlayer('${h.id}')` : `openPlayer('${h.id}')`}">
            <img src="${h.cover || ''}" class="w-24 h-32 rounded-lg object-cover bg-white/10" loading="lazy">
            ${prog ? `<span class="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-purple-500/90 text-white text-[8px]">續播 E${prog.epIndex + 1}·${prog.panelIndex + 1}格</span>` : ''}
            <button onclick="pwaRemoveHistory('${h.id}', '${h.type}', event)" title="刪除記錄"
              class="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white/60 text-[10px] flex items-center justify-center hover:text-rose-400">✕</button>
            <p class="text-white/70 text-[10px] mt-1 truncate">${h.title}</p>
          </div>`;
        }).join('')}
      </div>` : '<p class="text-white/30 text-xs py-3">暫無觀看記錄</p>'}
      <h4 class="text-white font-bold text-sm mt-4 mb-3">⭐ 我的收藏</h4>
      ${favs.length ? `<div class="grid grid-cols-3 gap-2">
        ${favs.map(f => `
          <div class="cursor-pointer" onclick="openComicPlayer('${f.id}')">
            <img src="${f.cover || ''}" class="w-full aspect-[3/4] rounded-lg object-cover bg-white/10" loading="lazy">
            <p class="text-white/70 text-[10px] mt-1 truncate">${f.title}</p>
          </div>`).join('')}
      </div>` : '<p class="text-white/30 text-xs py-3">暫無收藏，去靈感社區逛逛吧</p>'}
    </div>`;
}

window.pwaInstall = pwaInstall;
window.pwaDismissInstall = pwaDismissInstall;
window.pwaRecordHistory = pwaRecordHistory;
window.pwaGetHistory = pwaGetHistory;
window.pwaClearHistory = pwaClearHistory;
window.pwaRemoveHistory = pwaRemoveHistory;
window.renderMinePanel = renderMinePanel;
