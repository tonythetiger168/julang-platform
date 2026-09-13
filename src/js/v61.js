// ===== v6.1 增補：聚合搜索升級 + 體檢修復 =====
// @ts-check
// 覆寫 doSearch：改用 /search/all 聚合接口，短劇 + 漫劇 + 創作者分區呈現

// 搜索防抖
let searchDebounceTimer = null;
function debouncedSearch() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => doSearch(), 350);
}

async function doSearch() {
  clearTimeout(searchDebounceTimer);
  const q = document.getElementById('search-input').value.trim();
  if (!q) return;
  const res = await api.get('/search/all?q=' + encodeURIComponent(q));
  document.getElementById('search-default').classList.add('hidden');
  document.getElementById('search-results').classList.remove('hidden');
  const list = document.getElementById('search-result-list');
  if (res.code !== 200) {
    list.innerHTML = '<p class="text-center text-white/40 py-10">搜索失敗，請稍後重試</p>';
    return;
  }
  const { dramas = [], comics = [], creators = [] } = res.data;
  if (!dramas.length && !comics.length && !creators.length) {
    list.innerHTML = '<p class="text-center text-white/40 py-10">暫無結果</p>';
    return;
  }
  saveSearchHistory(q);
  let html = '';
  if (dramas.length) {
    html += '<h5 class="text-white/50 text-xs font-bold mt-2 mb-2">🎬 短劇</h5>' + dramas.map(d => `
      <div class="flex gap-3 p-3 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10 transition mb-2" onclick="openPlayer('${d.id}');closeSearch()">
        <img src="${d.cover}" class="w-16 h-20 rounded-lg object-cover bg-white/10" loading="lazy">
        <div class="flex-1 min-w-0">
          <h4 class="text-white font-medium text-sm">${d.title}</h4>
          <p class="text-white/40 text-xs">${d.category} · ${d.episodes}集</p>
          <p class="text-rose-400 text-xs mt-1">${d.views}</p>
        </div>
      </div>`).join('');
  }
  if (comics.length) {
    html += '<h5 class="text-white/50 text-xs font-bold mt-4 mb-2">🎨 漫劇</h5>' + comics.map(w => `
      <div class="flex gap-3 p-3 rounded-xl bg-white/5 cursor-pointer hover:bg-white/10 transition mb-2" onclick="closeSearch();openComicPlayer('${w.id}')">
        <img src="${w.cover}" class="w-16 h-20 rounded-lg object-cover bg-white/10" loading="lazy">
        <div class="flex-1 min-w-0">
          <h4 class="text-white font-medium text-sm">${w.title}</h4>
          <p class="text-white/40 text-xs">${w.category || ''} · ${w.episodes}集 · ${typeof window.cmStyleName === 'function' ? window.cmStyleName(w.artStyle) : w.artStyle}</p>
          <p class="text-purple-400 text-xs mt-1">❤️ ${w.likes || 0} · 👀 ${w.views || ''}</p>
        </div>
      </div>`).join('');
  }
  if (creators.length) {
    html += '<h5 class="text-white/50 text-xs font-bold mt-4 mb-2">👤 創作者</h5>' + creators.map(c => `
      <div class="flex items-center gap-3 p-3 rounded-xl bg-white/5 mb-2">
        <img src="${c.avatar}" class="w-10 h-10 rounded-full bg-white/10" loading="lazy">
        <div class="flex-1 min-w-0">
          <h4 class="text-white font-medium text-sm">${c.name}</h4>
          <p class="text-white/40 text-xs truncate">${c.bio || ''}</p>
        </div>
        <button class="px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs">+ 關注</button>
      </div>`).join('');
  }
  list.innerHTML = html;
}

window.doSearch = doSearch;
