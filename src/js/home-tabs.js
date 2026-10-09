/* ===== Home tabs (reconstruction-only) =====
 *
 * Matches the DramaBox app home from the reference screenshots:
 *   · a text tab strip (精選 / 新劇 / 排行榜 / 分類 / 獨家 / 漫劇) with an
 *     underline on the active tab, not pill chips
 *   · 精選 renders a 2-column grid of large portrait cards
 *   · 新劇 / 獨家 show the horizontal rows rendered by home-rows.js, which
 *     varies their ordering (and adds a 獨家 badge) by mode
 *   · 排行榜 / 分類 switch to the app's own views
 *
 * Card anatomy taken from the screenshots: cover, corner badge (爆款 / 人氣),
 * 「DramaBox 獨家」watermark, play count bottom-right, 2-line title, genre pill.
 */
(function () {
  function viewsNum(d) {
    var s = String(d.views || '');
    var n = parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
    if (s.indexOf('億') !== -1) return n * 1e8;
    if (s.indexOf('萬') !== -1) return n * 1e4;
    return n;
  }

  function badge(d) {
    if ((d.rating || 0) >= 9.2) return { text: '爆款', cls: 'bg-rose-500' };
    if (viewsNum(d) >= 1.5e8) return { text: '人氣', cls: 'bg-orange-500' };
    return null;
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  function gridCard(d) {
    var b = badge(d);
    var tag = (d.tags && d.tags[0]) || d.category || '';
    return '' +
      '<div class="cursor-pointer active:scale-[.98] transition" onclick="openPlayer(\'' + d.id + '\')">' +
        '<div class="relative aspect-[3/4] rounded-xl overflow-hidden bg-white/5">' +
          '<img src="' + esc(d.cover) + '" alt="' + esc(d.title) + '" loading="lazy" class="w-full h-full object-cover">' +
          (b ? '<span class="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded-md ' + b.cls + ' text-white text-[10px] font-bold">' + b.text + '</span>' : '') +
          '<span class="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white/85 text-[9px]">DramaBox 獨家</span>' +
          '<span class="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/60 text-white/85 text-[10px]">▶ ' + esc(d.views || '') + '</span>' +
        '</div>' +
        '<p class="mt-1.5 text-white text-[13px] leading-snug line-clamp-2">' + esc(d.title) + '</p>' +
        (tag ? '<span class="inline-block mt-1 px-2 py-0.5 rounded-md bg-white/8 border border-white/12 text-white/60 text-[10px]">' + esc(tag) + '</span>' : '') +
      '</div>';
  }

  function setActiveTab(name) {
    var tabs = document.querySelectorAll('#home-tabs [data-tab]');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('tab-active', tabs[i].getAttribute('data-tab') === name);
    }
  }

  // name = 要顯示的 panel（pick = 格狀, rows = 三排）；activeName = 要畫底線的分頁。
  // 兩者不一定相同：新劇／獨家 顯示的是 rows panel，但底線要落在自己的按鈕上
  // （以前直接傳 'rows'，而沒有任何 data-tab="rows"，所以底線整排消失）。
  function showPanel(name, activeName) {
    var grid = document.getElementById('home-grid-wrap');
    var rows = document.getElementById('home-rows-wrap');
    if (!grid || !rows) return;
    var isGrid = name === 'pick';
    grid.classList.toggle('hidden', !isGrid);
    rows.classList.toggle('hidden', isGrid);
    setActiveTab(activeName || name);
  }

  window.homeTab = function (name) {
    // 排行榜 / 分類 會離開首頁畫面，所以底線要跟著移過去，
    // 否則會停在「精選」被選取的狀態卻顯示排行榜。
    if (name === 'rank') { switchTab('rank'); setActiveTab('rank'); return; }
    if (name === 'genres') { switchTab('theater'); setActiveTab('genres'); return; }
    if (name === 'new' || name === 'exclusive') {
      // both show the horizontal rows, but home-rows.js varies their ordering
      // and adds a 獨家 corner badge in exclusive mode — the two tabs must not
      // render the same three rows.
      if (window.__renderHomeRows) window.__renderHomeRows(name);
      // 從排行榜／分類按「新劇」「獨家」時必須先回到首頁，否則 view 仍停在
      // 排行榜、只換了看不到的 panel，看起來像按了沒反應（舊 bug）。
      switchTab('feed');
      showPanel('rows', name);
      return;
    }
    switchTab('feed');
    showPanel('pick');
  };

  async function render() {
    if (!window.api || !window.api.get) return;
    var res;
    try { res = await api.get('/dramas/recommend?limit=50'); } catch (e) { return; }
    var list = (res && res.data && res.data.list) || [];
    if (!list.length) return;
    window.__homeDramas = list;
    var host = document.getElementById('home-grid');
    if (host) host.innerHTML = list.map(gridCard).join('');
    showPanel('pick');
  }

  window.addEventListener('load', function () { setTimeout(render, 500); });
})();
