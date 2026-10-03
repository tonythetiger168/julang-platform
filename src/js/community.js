// ===== v6.0 靈感社區（參考即夢社區）=====
// @ts-check
// 作品流 / 畫風篩選 / 點贊 / 收藏 / 一鍵做同款

let cmSort = 'hot';
let cmStyle = '';
let cmWorks = [];

async function renderCommunity() {
  const grid = document.getElementById('community-grid');
  if (!grid) return;
  grid.innerHTML = '<div class="col-span-2 flex justify-center py-10"><div class="loading-spinner"></div></div>';
  const res = await api.get(`/community/works?sort=${cmSort}&limit=20${cmStyle ? '&style=' + cmStyle : ''}`);
  if (res.code !== 200 || !res.data.list.length) {
    grid.innerHTML = `
      <div class="col-span-2 text-center py-16">
        <p class="text-white/40 mb-4">社區還沒有作品，來發佈第一部吧！</p>
        <button onclick="showAgentStudio()" class="px-6 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-bold">🎬 用 Agent 創作</button>
      </div>`;
    return;
  }
  cmWorks = res.data.list;
  grid.innerHTML = cmWorks.map((w, i) => `
    <div class="rounded-xl overflow-hidden bg-white/5 border border-white/10">
      <div class="aspect-[3/4] relative cursor-pointer" onclick="cmOpenDetail('${w.id}')">
        <img src="${w.cover || ''}" class="w-full h-full object-cover" loading="lazy" alt="${w.title}">
        <div class="absolute top-2 left-2 px-2 py-0.5 rounded bg-purple-500/80 text-white text-[10px] backdrop-blur">${cmStyleName(w.artStyle)}</div>
        ${w.remixOfId ? '<div class="absolute top-2 right-2 px-2 py-0.5 rounded bg-pink-500/80 text-white text-[10px] backdrop-blur">復刻</div>' : ''}
        <div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
          <h4 class="text-white text-sm font-medium truncate">${w.title}</h4>
          <p class="text-white/50 text-[10px] mt-0.5">${w.episodes}集 · 👁 ${w.views}</p>
        </div>
      </div>
      <div class="flex items-center justify-between px-2 py-1.5">
        <button onclick="cmLike('${w.id}', ${i})" class="flex items-center gap-1 text-xs ${w._liked ? 'text-rose-400' : 'text-white/50'} hover:text-rose-400 transition">
          <svg class="w-4 h-4" fill="${w._liked ? 'currentColor' : 'none'}" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"/></svg>
          <span id="cm-like-${w.id}">${w.likes}</span>
        </button>
        <button onclick="cmFav('${w.id}')" class="text-white/50 hover:text-amber-400 transition" title="收藏">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>
        </button>
        <button onclick="cmRemix('${w.id}')" class="px-2 py-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-[10px] font-bold">做同款</button>
      </div>
    </div>`).join('');
}

function cmStyleName(s) {
  return { anime: '日系', ink: '水墨', realistic: '寫實', chibi: 'Q版' }[s] || s;
}

function cmSwitchSort(sort, btn) {
  cmSort = sort;
  document.querySelectorAll('.cm-sort-btn').forEach(b => {
    b.classList.remove('bg-purple-500', 'text-white');
    b.classList.add('bg-white/10', 'text-white/60');
  });
  btn.classList.add('bg-purple-500', 'text-white');
  btn.classList.remove('bg-white/10', 'text-white/60');
  renderCommunity();
}

function cmSwitchStyle(style, btn) {
  cmStyle = style;
  document.querySelectorAll('.cm-style-btn').forEach(b => {
    b.classList.remove('ring-2', 'ring-purple-400', 'text-white');
    b.classList.add('text-white/50');
  });
  btn.classList.add('ring-2', 'ring-purple-400', 'text-white');
  btn.classList.remove('text-white/50');
  renderCommunity();
}

async function cmLike(id, idx) {
  if (!api.isLoggedIn()) return showLogin();
  const res = await api.post(`/community/works/${id}/like`);
  if (res.code !== 200) return;
  const el = document.getElementById('cm-like-' + id);
  const cur = parseInt(el.textContent);
  el.textContent = res.data.liked ? cur + 1 : Math.max(0, cur - 1);
  el.parentElement.classList.toggle('text-rose-400', res.data.liked);
  el.parentElement.classList.toggle('text-white/50', !res.data.liked);
}

async function cmFav(id) {
  if (!api.isLoggedIn()) return showLogin();
  const res = await api.post(`/community/works/${id}/favorite`);
  if (res.code === 200) {
    alert(res.data.favorited ? '⭐ 已收藏（PWA 離線可看）' : '已取消收藏');
  }
}

async function cmRemix(id) {
  if (!api.isLoggedIn()) return showLogin();
  if (!confirm('以這部作品的題材與畫風生成你的同款新作？')) return;
  const res = await api.post(`/community/works/${id}/remix`);
  if (res.code !== 200) return alert(res.message || '復刻失敗');
  alert('🎬 復刻任務已啟動！到「創作中心 → AI 漫劇生成 → 我的生成記錄」查看進度');
}

// ===== v6.0 深化：作品詳情 + 評論區 =====
let cmDetail = null;

async function cmOpenDetail(id) {
  document.getElementById('work-detail-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  document.getElementById('wd-body').innerHTML = '<div class="flex justify-center py-16"><div class="loading-spinner"></div></div>';
  const res = await api.get('/community/works/' + id);
  if (res.code !== 200) { alert(res.message || '加載失敗'); return closeWorkDetail(); }
  cmDetail = res.data;
  cmRenderDetail();
  cmLoadComments(id);
}

function closeWorkDetail() {
  document.getElementById('work-detail-modal').classList.add('hidden');
  document.body.style.overflow = '';
  cmDetail = null;
}

function cmRenderDetail() {
  const w = cmDetail;
  document.getElementById('wd-body').innerHTML = `
    <div class="relative">
      <img src="${w.cover || ''}" class="w-full aspect-[16/10] object-cover" alt="${w.title}">
      <div class="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent"></div>
      <div class="absolute bottom-0 left-0 right-0 p-4">
        <div class="flex items-center gap-2 mb-1">
          <span class="px-2 py-0.5 rounded bg-purple-500/80 text-white text-[10px]">${cmStyleName(w.artStyle)}</span>
          ${w.remixOfId ? '<span class="px-2 py-0.5 rounded bg-pink-500/80 text-white text-[10px]">復刻作品</span>' : ''}
          <span class="text-white/40 text-[10px]">by ${w.creatorName}</span>
        </div>
        <h3 class="text-white text-xl font-bold">${w.title}</h3>
        <p class="text-white/60 text-xs mt-1">${w.episodes.length} 集 · 👁 ${w.views} · ❤️ ${w.likes} · 🔄 ${w.remixCount}</p>
      </div>
    </div>
    <div class="p-4">
      <p class="text-white/70 text-sm leading-relaxed mb-4">${w.desc || ''}</p>
      ${w.characters.length ? `
        <label class="text-white/50 text-xs mb-2 block">角色</label>
        <div class="flex gap-3 overflow-x-auto mb-4 pb-1">
          ${w.characters.map(c => `
            <div class="flex-shrink-0 w-16 text-center">
              <img src="${c.avatar || ''}" class="w-14 h-14 mx-auto rounded-xl object-cover bg-white/10" alt="${c.name}">
              <p class="text-white text-[10px] mt-1 font-medium">${c.name}</p>
              <p class="text-white/40 text-[9px]">${c.role}</p>
            </div>`).join('')}
        </div>` : ''}
      <div class="flex gap-2 mb-5">
        <button onclick="closeWorkDetail(); openComicPlayer('${w.id}')" class="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 text-white font-bold">▶ 立即播放</button>
        <button onclick="cmLike('${w.id}', 0)" class="px-4 py-3 rounded-xl bg-white/10 text-white text-sm">❤️</button>
        <button onclick="cmRemix('${w.id}')" class="px-4 py-3 rounded-xl bg-white/10 text-white text-sm">做同款</button>
      </div>
      ${(w.workflow && w.workflow.length) ? `
      <!-- 創作過程（參考 LibTV 社區：公開工作流，可一鍵做同款） -->
      <div class="border-t border-white/10 pt-4 mb-5">
        <label class="text-white/70 text-sm font-bold mb-3 block">🎬 創作過程</label>
        <div class="space-y-2">
          ${w.workflow.map((s, i) => `
            <div class="flex items-start gap-2.5 p-2.5 rounded-xl bg-white/5 border border-white/10">
              <span class="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">${i + 1}</span>
              <div class="flex-1 min-w-0">
                <p class="text-white/80 text-xs font-medium">${s.icon || '⚙️'} ${s.step}</p>
                <p class="text-white/40 text-[10px] mt-0.5 leading-relaxed">${s.detail}</p>
              </div>
            </div>`).join('')}
        </div>
        <p class="text-white/30 text-[10px] mt-2">點「做同款」即可復用這套工作流開局。</p>
      </div>` : ''}
      <!-- 評論區 -->
      <div class="border-t border-white/10 pt-4">
        <label class="text-white/70 text-sm font-bold mb-3 block">💬 評論（<span id="wd-comment-count">${w.commentCount}</span>）</label>
        <div class="flex gap-2 mb-3">
          <input id="wd-comment-input" placeholder="說點什麼..." maxlength="500"
            class="flex-1 bg-white/10 rounded-xl px-3 py-2.5 text-white text-sm outline-none border border-white/10 focus:border-purple-400">
          <button id="wd-comment-btn" onclick="cmPostComment()" class="px-4 py-2.5 rounded-xl bg-purple-500 text-white text-sm font-bold active:scale-95">發表</button>
        </div>
        <div id="wd-comments" class="space-y-3"></div>
      </div>
    </div>`;
}

async function cmLoadComments(id) {
  const res = await api.get(`/community/works/${id}/comments?limit=30`);
  const box = document.getElementById('wd-comments');
  if (!box) return;
  if (res.code !== 200 || !res.data.list.length) {
    box.innerHTML = '<p class="text-white/30 text-xs text-center py-4">還沒有評論，搶沙發～</p>';
    return;
  }
  box.innerHTML = res.data.list.map(c => `
    <div class="flex gap-2.5">
      <img src="${c.avatar || 'assets/icon-192.png'}" class="w-8 h-8 rounded-full object-cover bg-white/10 flex-shrink-0" alt="">
      <div class="flex-1 min-w-0">
        <div class="flex items-center justify-between">
          <span class="text-purple-300 text-xs font-medium">${c.nickname}</span>
          <span class="text-white/30 text-[10px]">${new Date(c.createdAt).toLocaleDateString('zh-TW')}</span>
        </div>
        <p class="text-white/80 text-sm mt-0.5">${c.content}</p>
        ${c.mine ? `<button onclick="cmDelComment('${c.id}')" class="text-white/30 text-[10px] mt-0.5 hover:text-rose-400">刪除</button>` : ''}
      </div>
    </div>`).join('');
}

async function cmPostComment() {
  if (!api.isLoggedIn()) return showLogin();
  const input = document.getElementById('wd-comment-input');
  const content = input.value.trim();
  if (!content) return;
  const btn = document.getElementById('wd-comment-btn');
  btn.disabled = true;
  const res = await api.post(`/community/works/${cmDetail.id}/comments`, { content });
  btn.disabled = false;
  if (res.code !== 200) return alert(res.message || '發表失敗');
  input.value = '';
  const cnt = document.getElementById('wd-comment-count');
  cnt.textContent = parseInt(cnt.textContent) + 1;
  cmLoadComments(cmDetail.id);
}

async function cmDelComment(commentId) {
  const res = await api.request('DELETE', '/community/comments/' + commentId);
  if (res.code !== 200) return alert(res.message || '刪除失敗');
  const cnt = document.getElementById('wd-comment-count');
  cnt.textContent = Math.max(0, parseInt(cnt.textContent) - 1);
  cmLoadComments(cmDetail.id);
}

window.renderCommunity = renderCommunity;
window.cmSwitchSort = cmSwitchSort;
window.cmSwitchStyle = cmSwitchStyle;
window.cmLike = cmLike;
window.cmFav = cmFav;
window.cmRemix = cmRemix;
window.cmOpenDetail = cmOpenDetail;
window.closeWorkDetail = closeWorkDetail;
window.cmPostComment = cmPostComment;
window.cmDelComment = cmDelComment;
