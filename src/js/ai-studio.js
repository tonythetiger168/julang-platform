// ===== v5.0 AI 創作工作室 =====
// @ts-check
// 生成向導：創意輸入 → 參數配置 → 任務輪詢 → 完成預覽

let aiCaps = null;
let aiPollingTimer = null;
let aiCurrentTaskId = null;

const AI_GENRES = ['都市', '甜寵', '重生', '玄幻', '穿越', '逆襲', '職場', '懸疑', '古裝'];

async function loadAiCapabilities() {
  if (aiCaps) return aiCaps;
  const res = await api.get('/ai/capabilities');
  if (res.code === 200) aiCaps = res.data;
  return aiCaps;
}

async function showAiStudio() {
  if (!api.isLoggedIn()) return showLogin();
  closeUpload();
  const modal = document.getElementById('ai-studio-modal');
  modal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  aiResetWizard();
  await loadAiCapabilities();
  aiRenderOptions();
  aiLoadMyTasks();
}

function closeAiStudio() {
  document.getElementById('ai-studio-modal').classList.add('hidden');
  document.body.style.overflow = '';
  aiStopPolling();
}

function aiResetWizard() {
  document.getElementById('ai-step-form').classList.remove('hidden');
  document.getElementById('ai-step-progress').classList.add('hidden');
  document.getElementById('ai-step-done').classList.add('hidden');
}

function aiRenderOptions() {
  if (!aiCaps) return;
  // 題材
  document.getElementById('ai-genre').innerHTML = AI_GENRES.map(g =>
    `<option value="${g}">${g}</option>`).join('');
  // 畫風
  document.getElementById('ai-style-list').innerHTML = aiCaps.styles.map((s, i) => `
    <button type="button" onclick="aiPickStyle('${s.id}', this)"
      class="ai-style-btn ${i === 0 ? 'ring-2 ring-purple-400 bg-purple-500/20' : 'bg-white/5'} p-3 rounded-xl text-left transition hover:bg-white/10">
      <div class="text-white text-sm font-bold">${s.name}</div>
      <div class="text-white/40 text-xs mt-1">${s.desc}</div>
    </button>`).join('');
  document.getElementById('ai-style').value = aiCaps.styles[0].id;
  // 音色
  document.getElementById('ai-voice').innerHTML =
    '<option value="">自動分配（依角色性別）</option>' +
    aiCaps.voices.map(v => `<option value="${v.id}">${v.name} — ${v.desc}</option>`).join('');
  // 後端狀態提示
  const b = aiCaps.backends;
  const label = { 'api': 'API', 'builtin-template': '內置模板', 'placeholder': '占位圖', 'web-speech-fallback': '瀏覽器語音' };
  document.getElementById('ai-backend-hint').innerHTML =
    `劇本:<b class="text-purple-300">${label[b.llm]}</b> · 繪圖:<b class="text-purple-300">${label[b.image]}</b> · 配音:<b class="text-purple-300">${label[b.tts]}</b>`;
}

function aiPickStyle(id, btn) {
  document.getElementById('ai-style').value = id;
  document.querySelectorAll('.ai-style-btn').forEach(b => b.classList.remove('ring-2', 'ring-purple-400', 'bg-purple-500/20'));
  btn.classList.add('ring-2', 'ring-purple-400', 'bg-purple-500/20');
}

async function aiSubmitTask() {
  const theme = document.getElementById('ai-theme').value.trim();
  if (theme.length < 2) return alert('請輸入至少 2 個字的創意主題');
  const body = {
    theme,
    genre: document.getElementById('ai-genre').value,
    style: document.getElementById('ai-style').value,
    episodeCount: parseInt(document.getElementById('ai-episodes').value),
    panelsPerEpisode: parseInt(document.getElementById('ai-panels').value),
    voiceId: document.getElementById('ai-voice').value,
    withVoice: document.getElementById('ai-with-voice').checked,
    withImages: true,
  };
  const btn = document.getElementById('ai-submit-btn');
  btn.disabled = true;
  btn.textContent = '提交中...';
  const res = await api.post('/ai/tasks', body);
  btn.disabled = false;
  btn.textContent = '🚀 開始生成';
  if (res.code !== 200) return alert(res.message || '提交失敗');

  aiCurrentTaskId = res.data.taskId;
  document.getElementById('ai-step-form').classList.add('hidden');
  document.getElementById('ai-step-progress').classList.remove('hidden');
  aiStartPolling(res.data.taskId);
}

function aiStartPolling(taskId) {
  aiStopPolling();
  const tick = async () => {
    const res = await api.get('/ai/tasks/' + taskId);
    if (res.code !== 200) return;
    const t = res.data;
    document.getElementById('ai-progress-bar').style.width = t.progress + '%';
    document.getElementById('ai-progress-text').textContent = t.progress + '%';
    document.getElementById('ai-progress-stage').textContent = t.stage || '排隊中...';
    if (t.status === 'success') {
      aiStopPolling();
      aiShowDone(t.comicId, t.output);
    } else if (t.status === 'failed') {
      aiStopPolling();
      document.getElementById('ai-progress-stage').textContent = '❌ 生成失敗：' + (t.errorMsg || '未知錯誤');
      document.getElementById('ai-progress-stage').classList.add('text-rose-400');
    }
  };
  tick();
  aiPollingTimer = setInterval(tick, 2000);
}

function aiStopPolling() {
  if (aiPollingTimer) { clearInterval(aiPollingTimer); aiPollingTimer = null; }
}

function aiShowDone(comicId, output) {
  document.getElementById('ai-step-progress').classList.add('hidden');
  const done = document.getElementById('ai-step-done');
  done.classList.remove('hidden');
  document.getElementById('ai-done-title').textContent = output?.title || '生成完成';
  document.getElementById('ai-done-meta').textContent =
    `${output?.episodes || 0} 集 · ${output?.panels || 0} 格分鏡`;
  document.getElementById('ai-done-watch-btn').onclick = () => {
    closeAiStudio();
    openComicPlayer(comicId);
  };
  aiLoadMyTasks();
}

async function aiLoadMyTasks() {
  const res = await api.get('/ai/tasks');
  const box = document.getElementById('ai-my-tasks');
  if (res.code !== 200 || !res.data.length) {
    box.innerHTML = '<p class="text-white/30 text-xs text-center py-2">暫無生成記錄</p>';
    return;
  }
  const statusMap = { pending: '⏳ 排隊中', processing: '⚙️ 生成中', success: '✅ 完成', failed: '❌ 失敗' };
  box.innerHTML = res.data.slice(0, 5).map(t => `
    <div class="flex items-center justify-between py-2 border-b border-white/5 text-sm">
      <span class="text-white/70 truncate flex-1 mr-2">${(t.input?.theme || '').slice(0, 16)}</span>
      <span class="text-white/40 text-xs">${statusMap[t.status] || t.status}</span>
      ${t.status === 'success' && t.comicId
        ? `<button onclick="closeAiStudio();openComicPlayer('${t.comicId}')" class="ml-2 px-2 py-1 rounded bg-purple-500/80 text-white text-xs">觀看</button>`
        : (t.status === 'processing' || t.status === 'pending'
          ? `<button onclick="aiResumePolling('${t.id}')" class="ml-2 px-2 py-1 rounded bg-white/10 text-white/70 text-xs">進度</button>`
          : '')}
    </div>`).join('');
}

function aiResumePolling(taskId) {
  document.getElementById('ai-step-form').classList.add('hidden');
  document.getElementById('ai-step-done').classList.add('hidden');
  document.getElementById('ai-step-progress').classList.remove('hidden');
  aiStartPolling(taskId);
}

window.showAiStudio = showAiStudio;
window.closeAiStudio = closeAiStudio;
window.aiPickStyle = aiPickStyle;
window.aiSubmitTask = aiSubmitTask;
window.aiResumePolling = aiResumePolling;
