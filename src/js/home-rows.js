/* ===== Home rows (reconstruction-only) =====
 *
 * DramaBox's home is a vertical page of three horizontally-scrolling rows —
 * 必看好劇 / 當前熱播 / 精彩劇集, each with a 更多 link — rather than one
 * full-bleed swipe feed. This renders those three rows from the same demo data
 * the app already fetches.
 *
 * The app's own feed container (#feed-container) stays in the DOM because the
 * bundle renders into it, but it is hidden on the home view.
 *
 * MODES — home-tabs.js calls __renderHomeRows(mode) so 新劇 and 獨家 are not the
 * same three rows as 精選:
 *   default   必看好劇 / 當前熱播 / 精彩劇集  (rating desc / views desc / rating asc)
 *   new       最新上線 / 新劇熱播 / 新劇口碑  (newest first, then views, then rating)
 *   exclusive 獨家首播 / 獨家高分 / 獨家推薦  (same ordering as default, plus a 獨家 corner badge)
 *
 * The demo drama records carry no date field (only the AI comics do), so
 * "newest" is approximated by the numeric part of the id, descending. That is a
 * stable, documented proxy rather than a real publish date — see HANDOFF.md.
 *
 * Loaded after demo-videos.js; runs on window load so the API and the demo
 * layer are ready.
 */
(function () {
  // '億' = 1e8, '萬' = 1e4 — the mock stores view counts as display strings
  function viewsNum(d) {
    var s = String(d.views || '');
    var n = parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
    if (s.indexOf('億') !== -1) return n * 1e8;
    if (s.indexOf('萬') !== -1) return n * 1e4;
    return n;
  }

  // no publish dates in the demo data: 'd12' is newer than 'd9'
  function idNum(d) {
    var m = String(d.id || '').match(/(\d+)/);
    return m ? parseInt(m[1], 10) : 0;
  }

  function byRatingDesc(a, b) { return (b.rating || 0) - (a.rating || 0); }
  function byRatingAsc(a, b) { return (a.rating || 0) - (b.rating || 0); }
  function byViewsDesc(a, b) { return viewsNum(b) - viewsNum(a); }
  function byNewest(a, b) { return idNum(b) - idNum(a); }

  var ROW_IDS = ['row-must', 'row-trending', 'row-gems'];
  var MORES = ["switchTab('theater')", "switchTab('rank')", "switchTab('manju')"];

  var MODES = {
    default: {
      titles: ['必看好劇', '當前熱播', '精彩劇集'],
      sorts: [byRatingDesc, byViewsDesc, byRatingAsc],
      badge: false,
    },
    new: {
      titles: ['最新上線', '新劇熱播', '新劇口碑'],
      sorts: [byNewest, byViewsDesc, byRatingDesc],
      badge: false,
    },
    exclusive: {
      titles: ['獨家首播', '獨家高分', '獨家推薦'],
      sorts: [byRatingDesc, byViewsDesc, byRatingAsc],
      badge: true,
    },
  };

  function card(d, badge) {
    var tags = (d.tags || [d.category]).slice(0, 2).join(' · ');
    var eps = typeof d.episodes === 'number' ? d.episodes : (d.episodes || []).length;
    return '' +
      '<div class="flex-shrink-0 w-[118px] cursor-pointer active:scale-95 transition" onclick="openPlayer(\'' + d.id + '\')">' +
        '<div class="relative aspect-[3/4] rounded-xl overflow-hidden bg-white/5">' +
          '<img src="' + (d.cover || '') + '" alt="' + d.title + '" loading="lazy" class="w-full h-full object-cover">' +
          (badge ? '<span class="absolute top-1 left-1 px-1.5 py-0.5 rounded-md bg-amber-400 text-black text-[10px] font-bold">獨家</span>' : '') +
          '<span class="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/70 text-[10px] text-white/90">' + eps + '集</span>' +
        '</div>' +
        '<p class="mt-1.5 text-white text-xs font-medium truncate">' + d.title + '</p>' +
        '<p class="text-white/40 text-[10px] truncate">' + tags + '</p>' +
      '</div>';
  }

  async function render(mode) {
    var m = MODES[mode] || MODES.default;
    if (!window.api || !window.api.get) return;
    var res;
    try { res = await api.get('/dramas/recommend?limit=50'); } catch (e) { return; }
    var list = (res && res.data && res.data.list) || [];
    if (!list.length) return;

    window.__homeRowsMode = mode || 'default';

    for (var i = 0; i < ROW_IDS.length; i++) {
      var host = document.getElementById(ROW_IDS[i]);
      if (host) {
        host.innerHTML = list.slice().sort(m.sorts[i]).map(function (d) {
          return card(d, m.badge);
        }).join('');
      }
      var title = document.getElementById(ROW_IDS[i] + '-title');
      if (title) title.textContent = m.titles[i];
      var more = document.querySelector('[data-more="' + ROW_IDS[i] + '"]');
      if (more) more.setAttribute('onclick', MORES[i]);
    }
  }

  window.__renderHomeRows = render;
  window.addEventListener('load', function () { setTimeout(function () { render('default'); }, 400); });
})();
