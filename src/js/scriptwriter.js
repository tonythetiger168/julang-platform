// ===== v6.1 編劇工作台（獨立劇本寫作模組）=====
// @ts-check
// 分場大綱 + 對白格式化 + AI 輔助（大綱/續寫/潤色）+ 一鍵送入 Agent 成片
// 數據存 localStorage：劇本多草稿管理

const SW_STORE = 'julang_scripts_v1';
const SW_CUR = 'julang_scripts_cur';
let swScripts = [];      // [{id,title,genre,content,createdAt,updatedAt}]
let swCurrentId = null;
let swTab = 'write';     // write | outline | ai
let swPreviewOn = false;
let swAiResult = null;   // {mode, text} 待插入的 AI 結果

// ---------- 存取 ----------
function swLoadAll() {
  try { swScripts = JSON.parse(localStorage.getItem(SW_STORE) || '[]'); } catch { swScripts = []; }
  swCurrentId = localStorage.getItem(SW_CUR) || (swScripts[0] && swScripts[0].id) || null;
}
function swPersist() {
  localStorage.setItem(SW_STORE, JSON.stringify(swScripts));
  if (swCurrentId) localStorage.setItem(SW_CUR, swCurrentId);
}
function swCurrent() { return swScripts.find(s => s.id === swCurrentId) || null; }

function swCreateScript(title, content, genre) {
  const s = {
    id: 'sc' + Date.now(),
    title: title || '未命名劇本',
    genre: genre || '都市',
    content: content || '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  swScripts.unshift(s);
  swCurrentId = s.id;
  swPersist();
  return s;
}

// ---------- 開關 ----------
function showScriptwriter() {
  if (!api.isLoggedIn()) return showLogin();
  closeUpload();
  swLoadAll();
  if (!swScripts.length) swCreateScript('我的第一部短劇', '', '都市');
  const m = document.getElementById('scriptwriter-modal');
  m.classList.remove('hidden'); m.classList.add('flex');
  document.body.style.overflow = 'hidden';
  swSwitchTab('write');
  swRenderAll();
}

function closeScriptwriter() {
  swSyncFromEditor();
  swPersist();
  document.getElementById('scriptwriter-modal').classList.add('hidden');
  document.body.style.overflow = '';
}

// ---------- 頁簽 ----------
function swSwitchTab(tab) {
  swTab = tab;
  ['write', 'outline', 'ai'].forEach(t => {
    document.getElementById('sw-pane-' + t).classList.toggle('hidden', t !== tab);
    const btn = document.getElementById('sw-tab-' + t);
    btn.className = 'flex-1 py-2 rounded-lg text-xs font-medium transition ' +
      (t === tab ? 'bg-amber-500 text-black' : 'bg-white/10 text-white/60 hover:bg-white/20');
  });
  if (tab === 'outline') swRenderOutline();
  if (tab === 'write') swRenderPreview();
}

// ---------- 寫作頁 ----------
function swRenderAll() {
  swRenderScriptBar();
  swSyncToEditor();
  swRenderStats();
  swRenderPreview();
}

function swRenderScriptBar() {
  const cur = swCurrent();
  const sel = document.getElementById('sw-script-select');
  sel.innerHTML = swScripts.map(s =>
    `<option value="${s.id}" ${s.id === swCurrentId ? 'selected' : ''}>${s.title}</option>`).join('');
  document.getElementById('sw-title').value = cur ? cur.title : '';
  document.getElementById('sw-genre').value = cur ? cur.genre : '都市';
}

function swSwitchScript(id) {
  swSyncFromEditor();
  swCurrentId = id;
  swPersist();
  swRenderAll();
  if (swTab === 'outline') swRenderOutline();
}

function swNewScript() {
  const title = prompt('新劇本標題：', '未命名劇本');
  if (title === null) return;
  swSyncFromEditor();
  swCreateScript(title.trim() || '未命名劇本', '', '都市');
  swRenderAll();
  swToast('📄 已新建劇本');
}

function swDeleteScript() {
  const cur = swCurrent();
  if (!cur) return;
  if (!confirm(`刪除劇本《${cur.title}》？此操作無法復原。`)) return;
  swScripts = swScripts.filter(s => s.id !== cur.id);
  swCurrentId = swScripts[0] ? swScripts[0].id : null;
  if (!swCurrentId) swCreateScript('我的第一部短劇', '', '都市');
  swPersist();
  swRenderAll();
  swToast('🗑️ 已刪除');
}

function swRenameScript() {
  const cur = swCurrent();
  if (!cur) return;
  cur.title = document.getElementById('sw-title').value.trim() || cur.title;
  cur.genre = document.getElementById('sw-genre').value;
  cur.updatedAt = new Date().toISOString();
  swPersist();
  swRenderScriptBar();
}

function swSyncToEditor() {
  const cur = swCurrent();
  document.getElementById('sw-editor').value = cur ? cur.content : '';
}

function swSyncFromEditor() {
  const cur = swCurrent();
  const el = document.getElementById('sw-editor');
  if (cur && el) {
    cur.content = el.value;
    cur.updatedAt = new Date().toISOString();
    swPersist();
  }
}

// ---------- 格式化插入（劇本格式模板）----------
const SW_SNIPPETS = {
  scene: '\n【場景】內·地點·夜\n',
  dialogue: '\n角色名：台詞……\n',
  narrate: '\n【旁白】……\n',
  action: '\n【動作】……\n',
};

function swInsert(kind) {
  const el = document.getElementById('sw-editor');
  const text = SW_SNIPPETS[kind] || '';
  const start = el.selectionStart ?? el.value.length;
  el.value = el.value.slice(0, start) + text + el.value.slice(el.selectionEnd ?? start);
  el.focus();
  el.selectionStart = el.selectionEnd = start + text.length;
  swSyncFromEditor();
  swRenderStats();
  swRenderPreview();
}

// ---------- 行類型判定（劇本格式化渲染）----------
function swLineType(line) {
  const t = line.trim();
  if (!t) return 'empty';
  if (/^【場景】/.test(t) || /^第[0-9一二三四五六七八九十百]+場/.test(t) || /^[內外][·\s]/.test(t)) return 'scene';
  if (/^【旁白】/.test(t)) return 'narrate';
  if (/^【動作】/.test(t)) return 'action';
  if (/^[一-龥A-Za-z·]{2,8}[：:]/.test(t)) return 'dialogue';
  return 'action';
}

function swRenderPreview() {
  const box = document.getElementById('sw-preview');
  if (!box) return;
  box.classList.toggle('hidden', !swPreviewOn);
  document.getElementById('sw-editor').classList.toggle('hidden', swPreviewOn);
  const btn = document.getElementById('sw-preview-btn');
  if (btn) btn.textContent = swPreviewOn ? '✏️ 編輯' : '👁 預覽';
  if (!swPreviewOn) return;
  const cur = swCurrent();
  const lines = (cur ? cur.content : '').split('\n');
  box.innerHTML = lines.map(line => {
    const type = swLineType(line);
    const esc = line.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    if (type === 'empty') return '<div class="h-3"></div>';
    if (type === 'scene') return `<p class="text-amber-300 font-bold text-sm mt-2 border-l-2 border-amber-400 pl-2">${esc}</p>`;
    if (type === 'narrate') return `<p class="text-white/45 text-xs italic pl-4">${esc}</p>`;
    if (type === 'dialogue') {
      const i = esc.indexOf('：') >= 0 ? esc.indexOf('：') : esc.indexOf(':');
      return `<p class="text-sm pl-4"><span class="text-pink-300 font-bold">${esc.slice(0, i)}：</span><span class="text-white/85">${esc.slice(i + 1)}</span></p>`;
    }
    return `<p class="text-white/60 text-xs pl-4">${esc}</p>`;
  }).join('') || '<p class="text-white/30 text-sm text-center py-10">開始寫作，或載入範例劇本</p>';
}

function swTogglePreview() {
  swSyncFromEditor();
  swPreviewOn = !swPreviewOn;
  swRenderPreview();
}

// ---------- 統計 ----------
function swRenderStats() {
  const cur = swCurrent();
  const text = cur ? cur.content : '';
  const lines = text.split('\n').filter(l => l.trim());
  let dialogueChars = 0, scenes = 0;
  const chars = new Set();
  lines.forEach(l => {
    const type = swLineType(l);
    if (type === 'scene') scenes++;
    if (type === 'dialogue') {
      dialogueChars += l.replace(/^[一-龥A-Za-z·]{2,8}[：:]/, '').trim().length;
      const m = l.trim().match(/^([一-龥A-Za-z·]{2,8})[：:]/);
      if (m && !['旁白', '字幕', '場景'].includes(m[1])) chars.add(m[1]);
    }
  });
  const totalChars = text.replace(/\s/g, '').length;
  const estSec = Math.round(dialogueChars / 4.5 + scenes * 2.5);
  document.getElementById('sw-stats').textContent =
    `共 ${totalChars} 字 · ${scenes} 場 · ${chars.size} 角色 · 預估成片 ${estSec >= 60 ? Math.floor(estSec / 60) + '分' + (estSec % 60) + '秒' : estSec + '秒'}`;
}

// ---------- 分場大綱頁 ----------
function swParseScenes() {
  const cur = swCurrent();
  const lines = (cur ? cur.content : '').split('\n');
  const scenes = [];
  let pre = [];
  lines.forEach(l => {
    if (swLineType(l) === 'scene') scenes.push({ heading: l.trim(), body: [] });
    else if (scenes.length) scenes[scenes.length - 1].body.push(l);
    else pre.push(l);
  });
  return { pre: pre.join('\n'), scenes };
}

function swRenderOutline() {
  const { scenes } = swParseScenes();
  const box = document.getElementById('sw-outline-list');
  if (!scenes.length) {
    box.innerHTML = `<div class="text-center py-10">
      <p class="text-white/40 text-sm mb-3">尚未分場。用工具列「＋場景」或到 AI 助手生成分場大綱。</p>
      <button onclick="swSwitchTab('ai')" class="px-4 py-2 rounded-xl bg-amber-500 text-black text-xs font-bold">🤖 去生成大綱</button>
    </div>`;
    return;
  }
  box.innerHTML = scenes.map((s, i) => {
    const dlg = s.body.filter(l => swLineType(l) === 'dialogue').length;
    const summary = (s.body.find(l => l.trim()) || '').trim().slice(0, 40);
    return `
    <div class="p-3 rounded-xl bg-white/5 border border-white/10">
      <div class="flex items-center gap-2">
        <span class="w-5 h-5 rounded-full bg-amber-500/30 text-amber-300 text-xs flex items-center justify-center font-bold flex-shrink-0">${i + 1}</span>
        <p class="flex-1 text-white text-xs font-bold truncate">${s.heading.replace(/^【場景】/, '')}</p>
        <button onclick="swMoveScene(${i},-1)" class="text-white/40 text-xs px-1 ${i === 0 ? 'invisible' : ''}">↑</button>
        <button onclick="swMoveScene(${i},1)" class="text-white/40 text-xs px-1 ${i === scenes.length - 1 ? 'invisible' : ''}">↓</button>
        <button onclick="swDeleteScene(${i})" class="text-white/30 hover:text-rose-400 text-xs px-1">✕</button>
      </div>
      <p class="text-white/40 text-[10px] mt-1 pl-7 truncate">${summary || '（空場景）'} · ${dlg} 句對白</p>
      <button onclick="swLocateScene(${i})" class="mt-1.5 ml-7 px-2.5 py-1 rounded-lg bg-white/10 text-white/60 text-[10px] hover:bg-white/20">📍 定位到編輯器</button>
    </div>`;
  }).join('');
}

function swRebuild(pre, scenes) {
  const cur = swCurrent();
  if (!cur) return;
  cur.content = (pre ? pre.replace(/\n+$/, '') + '\n' : '') +
    scenes.map(s => s.heading + '\n' + s.body.join('\n').replace(/^\n+|\n+$/g, '')).join('\n\n') + '\n';
  cur.updatedAt = new Date().toISOString();
  swPersist();
  swSyncToEditor();
  swRenderStats();
  swRenderOutline();
}

function swMoveScene(i, dir) {
  const { pre, scenes } = swParseScenes();
  const j = i + dir;
  if (j < 0 || j >= scenes.length) return;
  [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
  swRebuild(pre, scenes);
}

function swDeleteScene(i) {
  if (!confirm('刪除這一場（含場內所有台詞）？')) return;
  const { pre, scenes } = swParseScenes();
  scenes.splice(i, 1);
  swRebuild(pre, scenes);
  swToast('🗑️ 已刪除場景');
}

function swLocateScene(i) {
  const cur = swCurrent();
  if (!cur) return;
  const { scenes } = swParseScenes();
  const idx = cur.content.indexOf(scenes[i].heading);
  swSwitchTab('write');
  if (swPreviewOn) { swPreviewOn = false; swRenderPreview(); }
  const el = document.getElementById('sw-editor');
  el.focus();
  if (idx >= 0) { el.selectionStart = el.selectionEnd = idx; }
}

// ---------- AI 助手 ----------
async function swAiOutline() {
  const logline = document.getElementById('sw-ai-logline').value.trim();
  if (logline.length < 5) return swToast('請先輸入故事一句話（至少 5 字）');
  const btn = document.getElementById('sw-ai-outline-btn');
  btn.disabled = true; btn.textContent = '🧠 AI 生成中...';
  const res = await api.post('/ai/agent/blueprint', {
    scriptText: logline,
    genre: document.getElementById('sw-genre').value,
    style: 'anime',
  });
  btn.disabled = false; btn.textContent = '🧠 生成分場大綱';
  if (res.code !== 200) return swToast(res.message || '生成失敗');
  const b = res.data;
  const text = `\n【旁白】${b.logline || logline}\n` + (b.acts || []).map(a =>
    `\n【場景】第${a.act}集·${(a.hook || '關鍵場').slice(0, 12)}\n【旁白】${a.summary}\n【動作】鉤子：${a.hook}；懸念：${a.cliffhanger}\n`
  ).join('');
  swAiResult = { mode: '分場大綱', text };
  swRenderAiResult();
  swToast('🧠 大綱已生成，點「插入劇本」應用');
}

async function swAiAssist(mode) {
  const cur = swCurrent();
  const content = cur ? cur.content.trim() : '';
  if (content.length < 10) return swToast('劇本內容太少，先寫一點再讓 AI 接力');
  const btn = document.getElementById(mode === 'continue' ? 'sw-ai-continue-btn' : 'sw-ai-polish-btn');
  btn.disabled = true; btn.textContent = 'AI 處理中...';
  const res = await api.post('/ai/tools/script-assist', {
    mode,
    text: content.slice(-600),
    title: cur.title,
    genre: cur.genre,
  });
  btn.disabled = false;
  btn.textContent = mode === 'continue' ? '✍️ AI 續寫下一段' : '✨ AI 潤色對白';
  if (res.code !== 200) return swToast(res.message || 'AI 處理失敗');
  swAiResult = { mode: mode === 'continue' ? '續寫' : '潤色', text: res.data.text };
  swRenderAiResult();
}

function swRenderAiResult() {
  const box = document.getElementById('sw-ai-result');
  if (!swAiResult) { box.classList.add('hidden'); return; }
  box.classList.remove('hidden');
  document.getElementById('sw-ai-result-label').textContent = `AI ${swAiResult.mode}結果`;
  document.getElementById('sw-ai-result-text').textContent = swAiResult.text;
}

function swInsertAiResult() {
  if (!swAiResult) return;
  swSyncFromEditor();
  const cur = swCurrent();
  cur.content = cur.content.replace(/\n*$/, '') + '\n' + swAiResult.text;
  cur.updatedAt = new Date().toISOString();
  swPersist();
  swAiResult = null;
  swRenderAiResult();
  swRenderAll();
  if (swTab === 'outline') swRenderOutline();
  swToast('✅ 已插入劇本');
}

// ---------- 範例劇本 ----------
const SW_DEMO_SCRIPT = `【旁白】三年前，林晚被逐出家門；三年後，她回來了。

【場景】內·顧家大宅客廳·夜
【動作】水晶燈下賓客滿堂，林晚一襲紅裙緩步走進大廳，全場安靜。
林晚：三年了，這個家，一點都沒變。
顧沉：這位小姐，我們又見面了。
林晚：是你？當年那個救我的人……
【旁白】她沒想到，今晚第一個和她說話的，會是他。

【場景】內·大宅書房·夜
【動作】顧沉把一份文件推到林晚面前，神色凝重。
顧沉：你父親當年的車禍，不是意外。
林晚：你手上有證據？
顧沉：證據在你身上。從今天起，我來護你周全。
【旁白】窗外的雨聲漸大，一場風暴即將來臨。

【場景】外·大宅門前·日
【動作】林晚站在台階上回頭望去，眼神堅定。
林晚：這一次，命運由我自己改寫。
【旁白】逆襲，才剛剛開始。`;

function swLoadDemo() {
  if (!confirm('載入範例劇本會覆蓋當前劇本內容，確定？')) return;
  const cur = swCurrent();
  cur.content = SW_DEMO_SCRIPT;
  cur.title = cur.title === '未命名劇本' ? '逆襲：命運重啟（範例）' : cur.title;
  cur.updatedAt = new Date().toISOString();
  swPersist();
  swRenderAll();
  if (swTab === 'outline') swRenderOutline();
  swToast('📄 範例劇本已載入');
}

// ---------- 導出 / 送入 Agent ----------
function swExportTxt() {
  const cur = swCurrent();
  if (!cur || !cur.content.trim()) return swToast('劇本是空的');
  swSyncFromEditor();
  const blob = new Blob([cur.title + '\n\n' + cur.content], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = cur.title + '.txt';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  swToast('⬇️ 已導出 .txt');
}

function swSendToAgent() {
  swSyncFromEditor();
  const cur = swCurrent();
  if (!cur || cur.content.trim().length < 10) return swToast('劇本至少 10 個字才能成片');
  closeScriptwriter();
  showAgentStudio();
  document.getElementById('ag-script').value = cur.content;
  document.getElementById('ag-genre').value = cur.genre || '都市';
  swToast('🎬 劇本已送入 Agent 工作流');
}

function swToast(msg) {
  const t = document.getElementById('sw-toast');
  if (!t) return alert(msg);
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2200);
}

window.showScriptwriter = showScriptwriter;
window.closeScriptwriter = closeScriptwriter;
window.swSwitchTab = swSwitchTab;
window.swSwitchScript = swSwitchScript;
window.swNewScript = swNewScript;
window.swDeleteScript = swDeleteScript;
window.swRenameScript = swRenameScript;
window.swInsert = swInsert;
window.swSyncFromEditor = swSyncFromEditor;
window.swRenderStats = swRenderStats;
window.swTogglePreview = swTogglePreview;
window.swMoveScene = swMoveScene;
window.swDeleteScene = swDeleteScene;
window.swLocateScene = swLocateScene;
window.swAiOutline = swAiOutline;
window.swAiAssist = swAiAssist;
window.swInsertAiResult = swInsertAiResult;
window.swDiscardAiResult = () => { swAiResult = null; swRenderAiResult(); };
window.swLoadDemo = swLoadDemo;
window.swExportTxt = swExportTxt;
window.swSendToAgent = swSendToAgent;
window.swCreateScript = swCreateScript;
