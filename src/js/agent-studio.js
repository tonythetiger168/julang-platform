// ===== v6.0 短劇 Agent 工作流（參考小雲雀）=====
// @ts-check
// 五步向導：① 劇本上傳 → ② 故事藍圖 → ③ 角色設定 → ④ 分鏡預覽 → ⑤ 一鍵成片

let agBlueprint = null;
let agCards = null;
let agStep = 1;

function showAgentStudio() {
  if (!api.isLoggedIn()) return showLogin();
  closeUpload();
  document.getElementById('agent-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  agGotoStep(1);
}

function closeAgentStudio() {
  document.getElementById('agent-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

function agGotoStep(n) {
  agStep = n;
  for (let i = 1; i <= 5; i++) {
    document.getElementById('ag-step-' + i).classList.toggle('hidden', i !== n);
    const dot = document.getElementById('ag-dot-' + i);
    dot.className = 'flex-1 h-1 rounded-full ' + (i <= n ? 'bg-gradient-to-r from-purple-500 to-pink-500' : 'bg-white/10');
  }
  const labels = ['劇本', '藍圖', '角色', '分鏡', '成片'];
  document.getElementById('ag-step-label').textContent = `第 ${n}/5 步 · ${labels[n - 1]}`;
}

// ---------- ① → ② 劇本解析為藍圖 ----------
async function agParseScript() {
  const text = document.getElementById('ag-script').value.trim();
  if (text.length < 10) return alert('請輸入至少 10 個字的劇本或故事梗概');
  const btn = document.getElementById('ag-parse-btn');
  btn.disabled = true; btn.textContent = 'AI 解析中...';
  const res = await api.post('/ai/agent/blueprint', {
    scriptText: text,
    genre: document.getElementById('ag-genre').value,
    style: document.getElementById('ag-style').value,
  });
  btn.disabled = false; btn.textContent = '🧠 解析為故事藍圖';
  if (res.code !== 200) return alert(res.message || '解析失敗');
  agBlueprint = res.data;
  agRenderBlueprint();
  agGotoStep(2);
}

function agRenderBlueprint() {
  const b = agBlueprint;
  document.getElementById('ag-bp-title').value = b.title;
  document.getElementById('ag-bp-logline').value = b.logline || '';
  const rev = document.getElementById('ag-bp-revision');
  if (rev) {
    rev.classList.toggle('hidden', !b._revision);
    rev.textContent = `第 ${b._revision || 0} 版修訂`;
  }
  document.getElementById('ag-bp-acts').innerHTML = b.acts.map(a => `
    <div class="p-3 rounded-xl bg-white/5 border border-white/10">
      <div class="flex items-center gap-2 mb-1">
        <span class="w-5 h-5 rounded-full bg-purple-500/30 text-purple-300 text-xs flex items-center justify-center font-bold">${a.act}</span>
        <span class="text-white text-sm font-medium">第 ${a.act} 集</span>
      </div>
      <p class="text-white/60 text-xs leading-relaxed">${escapeHtml(a.summary)}</p>
      <p class="text-white/30 text-[10px] mt-1">鉤子：${escapeHtml(a.hook)} · 懸念：${escapeHtml(a.cliffhanger)}</p>
    </div>`).join('');
  document.getElementById('ag-bp-emotion').innerHTML = (b.emotionCurve || []).map(e =>
    `<span class="px-2 py-1 rounded-full bg-pink-500/20 text-pink-300 text-xs">${e}</span>`).join('');
}

// ---------- ② 多輪改稿：輸入修改意見，AI 修訂藍圖 ----------
async function agRevise() {
  const input = document.getElementById('ag-revise-input');
  const feedback = input.value.trim();
  if (feedback.length < 2) return alert('請輸入修改意見，例如「加重反派戲份」「結局改成悲劇」');
  const btn = document.getElementById('ag-revise-btn');
  btn.disabled = true; btn.textContent = 'AI 改稿中...';
  const res = await api.post('/ai/agent/blueprint/revise', { blueprint: agBlueprint, feedback });
  btn.disabled = false; btn.textContent = '✏️ 送出改稿';
  if (res.code !== 200) return alert(res.message || '改稿失敗');
  agBlueprint = res.data;
  // 保留用戶手動改過的標題/梗概
  agBlueprint.title = document.getElementById('ag-bp-title').value;
  agRenderBlueprint();
  input.value = '';
  const log = document.getElementById('ag-revise-log');
  const time = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
  log.insertAdjacentHTML('afterbegin', `<p class="text-white/40 text-[10px]">[${time}] ${escapeHtml(feedback)} → 已修訂為第 ${agBlueprint._revision || 1} 版</p>`);
}

// ---------- ② → ③ 生成角色卡 ----------
async function agGenCharacters() {
  agBlueprint.title = document.getElementById('ag-bp-title').value;
  agBlueprint.logline = document.getElementById('ag-bp-logline').value;
  const btn = document.getElementById('ag-char-btn');
  btn.disabled = true; btn.textContent = 'AI 設計角色中...';
  const res = await api.post('/ai/agent/characters', {
    characters: agBlueprint.characters,
    style: document.getElementById('ag-style').value,
  });
  btn.disabled = false; btn.textContent = '👥 生成角色卡';
  if (res.code !== 200) return alert(res.message || '生成失敗');
  agCards = res.data;
  agRenderCards();
  agGotoStep(3);
}

function agRenderCards() {
  document.getElementById('ag-cards').innerHTML = agCards.map((c, i) => `
    <div class="flex gap-3 p-3 rounded-xl bg-white/5 border border-white/10">
      <div class="flex-shrink-0">
        <img src="${c.avatar || ''}" class="w-16 h-16 rounded-xl object-cover bg-white/10" alt="${c.name}">
        <button onclick="agRegenAvatar(${i})" class="mt-1 w-full py-1 rounded-lg bg-white/10 text-white/60 text-[10px] hover:bg-white/20 active:scale-95">🎨 重繪頭像</button>
      </div>
      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="text-white font-bold text-sm">${c.name}</span>
          <span class="px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 text-[10px]">${c.role}</span>
        </div>
        <input value="${(c.persona || '').replace(/"/g, '&quot;')}" onchange="agCards[${i}].persona=this.value" placeholder="編輯人設一句話..."
          class="w-full mt-1 bg-white/10 rounded-lg px-2 py-1 text-xs text-white/80 border border-white/10 outline-none focus:border-purple-400">
        <select onchange="agCards[${i}].voiceId=this.value" class="mt-1.5 bg-white/10 rounded-lg px-2 py-1 text-xs text-white border-none outline-none">
          <option value="">自動音色</option>
          <option value="alloy">清悦（女）</option>
          <option value="nova">柔婉（女）</option>
          <option value="onyx">低沉（男）</option>
          <option value="echo">沉穩（男）</option>
        </select>
      </div>
    </div>`).join('');
}

// ---------- v6.0 深化：重繪單角色頭像 ----------
async function agRegenAvatar(i) {
  const c = agCards[i];
  const res = await api.post('/ai/agent/characters', {
    characters: [{ name: c.name, role: c.role, persona: c.persona, gender: c.gender }],
    style: document.getElementById('ag-style').value,
  });
  if (res.code !== 200) return alert(res.message || '重繪失敗');
  agCards[i] = { ...c, avatar: res.data[0].avatar, appearancePrompt: res.data[0].appearancePrompt };
  agRenderCards();
}

// ---------- ③ → ④ 分鏡預覽（由藍圖生成腳本預覽） ----------
function agPreviewScript() {
  const acts = agBlueprint.acts;
  const chars = agBlueprint.characters.map(c => c.name);
  const main = chars[0] || '主角';
  const beats = [
    { shot: 'wide', label: '遠景', fn: a => a.hook },
    { shot: 'medium', label: '中景', fn: a => a.summary },
    { shot: 'close', label: '特寫', fn: () => '事情，沒有那麼簡單……' },
    { shot: 'medium', label: '中景', fn: a => a.cliffhanger },
    { shot: 'close', label: '特寫', fn: () => '這一次，我不會再退讓。' },
    { shot: 'full', label: '全景', fn: a => '【懸念】' + (a.cliffhanger || '未完待續') },
  ];
  document.getElementById('ag-storyboard').innerHTML = acts.map(a => `
    <div class="mb-3">
      <h5 class="text-white/70 text-xs font-bold mb-2">第 ${a.act} 集</h5>
      <div class="grid grid-cols-3 gap-1.5">
        ${beats.map((b, i) => `
          <div class="aspect-[9/16] rounded-lg bg-gradient-to-br ${i % 2 ? 'from-purple-900/60 to-gray-800' : 'from-pink-900/40 to-gray-800'} border border-white/10 p-1.5 flex flex-col justify-between">
            <span class="text-[9px] text-purple-300">${b.label} #${i + 1}</span>
            <p class="text-[9px] text-white/60 leading-tight line-clamp-3">${(b.fn(a) || '').slice(0, 30)}</p>
          </div>`).join('')}
      </div>
    </div>`).join('');
  agGotoStep(4);
}

// ---------- ④ → ⑤ 一鍵成片 ----------
async function agProduce() {
  const btn = document.getElementById('ag-produce-btn');
  btn.disabled = true; btn.textContent = '提交成片任務中...';
  const res = await api.post('/ai/agent/produce', {
    blueprint: agBlueprint,
    characterCards: agCards,
    style: document.getElementById('ag-style').value,
    genre: document.getElementById('ag-genre').value,
    panelsPerEpisode: parseInt(document.getElementById('ag-panels').value),
    withVoice: true,
    isPublic: document.getElementById('ag-public').checked,
  });
  btn.disabled = false; btn.textContent = '🎬 一鍵成片';
  if (res.code !== 200) return alert(res.message || '提交失敗');
  agGotoStep(5);
  // 複用 v5.0 的輪詢邏輯
  document.getElementById('ag-progress-wrap').classList.remove('hidden');
  agPoll(res.data.taskId);
}

async function agPoll(taskId) {
  const timer = setInterval(async () => {
    const r = await api.get('/ai/tasks/' + taskId);
    if (r.code !== 200) return;
    const t = r.data;
    document.getElementById('ag-progress-bar').style.width = t.progress + '%';
    document.getElementById('ag-progress-stage').textContent = t.stage || '';
    if (t.status === 'success') {
      clearInterval(timer);
      document.getElementById('ag-progress-wrap').classList.add('hidden');
      document.getElementById('ag-done').classList.remove('hidden');
      document.getElementById('ag-done-title').textContent = t.output?.title || agBlueprint.title;
      document.getElementById('ag-watch-btn').onclick = () => { closeAgentStudio(); openComicPlayer(t.comicId); };
      document.getElementById('ag-canvas-btn').onclick = () => { closeAgentStudio(); openCanvasEditor(t.comicId); };
    } else if (t.status === 'failed') {
      clearInterval(timer);
      document.getElementById('ag-progress-stage').textContent = '❌ 失敗：' + (t.errorMsg || '');
    }
  }, 2000);
}

window.showAgentStudio = showAgentStudio;
window.closeAgentStudio = closeAgentStudio;
window.agParseScript = agParseScript;
window.agGenCharacters = agGenCharacters;
window.agPreviewScript = agPreviewScript;
window.agProduce = agProduce;
window.agGotoStep = agGotoStep;
window.agRevise = agRevise;
window.agRegenAvatar = agRegenAvatar;
