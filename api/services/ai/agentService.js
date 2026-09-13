// ===== v6.0 短劇 Agent 服務（參考小雲雀工作流）=====
// 劇本上傳 → 故事藍圖 → 角色設定 → 分鏡腳本 → 一鍵成片


const prisma = require('../../utils/prisma');
const llmService = require('./llmService');
const imageService = require('./imageService');

// ---------- 步驟一：解析劇本為故事藍圖 ----------
// 輸入原始劇本文本，輸出：故事梗概、分集大綱、角色列表、情緒曲線
async function parseBlueprint({ scriptText, style = 'anime', genre = '都市' }) {
  if (llmService.isEnabled()) {
    try {
      const prompt = `你是專業短劇策劃。請將以下劇本解析為故事藍圖，嚴格輸出 JSON：
{
  "title": "作品標題",
  "logline": "一句話梗概",
  "characters": [{"name":"角色名","role":"主角/配角/反派","persona":"人設一句話","gender":"male/female"}],
  "acts": [{"act":1,"summary":"本集劇情摘要","hook":"開場鉤子","cliffhanger":"結尾懸念"}],
  "emotionCurve": ["緊張","反轉","爆點"]
}
要求：acts 最多 5 集；角色不超過 4 個。

【題材】${genre}
【劇本】
${scriptText.slice(0, 6000)}`;
      const blueprint = await callBlueprintLlm(prompt);
      blueprint._mock = false;
      return blueprint;
    } catch (e) {
      console.warn('[Agent] 藍圖解析失敗，降級為內置解析:', e.message);
    }
  }
  return mockBlueprint(scriptText, genre);
}

// 直接調用底層 LLM（自定義提示詞）
async function callBlueprintLlm(prompt) {
  const https = require('https');
  const http = require('http');
  const cfg = llmService.LLM_CONFIG;
  const body = JSON.stringify({
    model: cfg.model,
    messages: [
      { role: 'system', content: '你是專業短劇策劃，只輸出 JSON。' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
  });
  return new Promise((resolve, reject) => {
    const u = new URL(`${cfg.baseUrl}/chat/completions`);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request({
      hostname: u.hostname, port: u.port || 443, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      timeout: cfg.timeout,
    }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const content = json.choices?.[0]?.message?.content || '';
          const m = content.match(/\{[\s\S]*\}/);
          if (!m) return reject(new Error('藍圖 JSON 解析失敗'));
          resolve(JSON.parse(m[0]));
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// 內置降級解析器：從文本提取角色，切分集數
function mockBlueprint(scriptText, genre) {
  const text = scriptText || '';
  // 嘗試提取「角色：」行，否則用默認角色
  const roleMatches = [...text.matchAll(/([\u4e00-\u9fa5]{2,4})[：:]/g)].map(m => m[1]);
  const names = [...new Set(roleMatches)].filter(n => !['旁白', '字幕', '第幾', '場景'].includes(n)).slice(0, 4);
  const chars = names.length ? names : ['林晚', '顧沉'];
  const characters = chars.map((name, i) => ({
    name,
    role: i === 0 ? '主角' : (i === chars.length - 1 && chars.length > 2 ? '反派' : '配角'),
    persona: i === 0 ? '堅韌隱忍，逆襲復仇' : '身份神秘，亦正亦邪',
    gender: /沉|琛|少|爺|王|帝|總裁/.test(name) ? 'male' : 'female',
  }));
  const acts = [1, 2, 3].map(n => ({
    act: n,
    summary: text.slice((n - 1) * 60, n * 60) || `第${n}幕：衝突升級`,
    hook: n === 1 ? '主角遭遇重大變故' : '新證據出現',
    cliffhanger: '神秘人物現身',
  }));
  return {
    title: `《${genre}風雲：逆襲》`,
    logline: text.slice(0, 40) || '一段關於逆襲與救贖的故事',
    characters,
    acts,
    emotionCurve: ['壓抑', '蓄力', '爆發'],
    _mock: true,
  };
}

// ---------- 步驟二：生成角色卡（含 AI 頭像與外觀提示詞）----------
async function buildCharacterCards(characters, artStyle = 'anime') {
  const styleMap = imageService.STYLE_PROMPTS;
  const prefix = styleMap[artStyle] || styleMap.anime;
  return Promise.all(characters.map(async (c) => {
    const genderHint = c.gender === 'male'
      ? 'handsome young man, sharp features, elegant suit'
      : 'beautiful young woman, expressive eyes, modern outfit';
    const appearancePrompt = `${prefix}, character portrait of ${genderHint}, named ${c.name}, ${c.persona || ''}, consistent character design, upper body, clean background`;
    const img = await imageService.generatePanelImage({
      scene: appearancePrompt,
      artStyle,
      seedText: `char-${c.name}-${artStyle}`,
    });
    return { ...c, appearancePrompt, avatar: img.imageUrl };
  }));
}

// ---------- 步驟三：由藍圖生成每集分鏡腳本 ----------
async function blueprintToScript(blueprint, { panelsPerEpisode = 6 }) {
  // 有 LLM 時可再調用一次生成完整分鏡；此處用藍圖 acts 驅動模板生成
  const chars = blueprint.characters.map(c => c.name);
  const mainChar = chars[0] || '主角';
  const episodes = blueprint.acts.map((act) => {
    const panels = [];
    const beats = [
      { shot: 'wide', line: act.hook || act.summary, speaker: '' },
      { shot: 'medium', line: act.summary, speaker: mainChar },
      { shot: 'close', line: '事情，沒有那麼簡單……', speaker: chars[1] || '' },
      { shot: 'medium', line: act.cliffhanger || '真相即將揭曉。', speaker: mainChar },
      { shot: 'close', line: '這一次，我不會再退讓。', speaker: mainChar },
      { shot: 'full', line: act.cliffhanger ? `【懸念】${act.cliffhanger}` : '未完待續……', speaker: '' },
    ];
    for (let i = 0; i < Math.min(panelsPerEpisode, beats.length); i++) {
      panels.push({
        panelNumber: i + 1,
        shotType: beats[i].shot,
        scene: `${beats[i].shot} shot, dramatic scene: ${beats[i].line}`,
        dialogue: beats[i].line.slice(0, 40),
        speaker: beats[i].speaker,
      });
    }
    return { episodeNumber: act.act, title: `第${act.act}集`, panels };
  });
  return {
    title: blueprint.title,
    desc: blueprint.logline,
    characters: chars,
    episodes,
    _mock: true,
  };
}

// ---------- 角色入庫 ----------
async function saveCharacters(comicId, characterCards) {
  for (const c of characterCards) {
    await prisma.character.upsert({
      where: { comicId_name: { comicId, name: c.name } },
      update: { persona: c.persona, appearancePrompt: c.appearancePrompt, avatar: c.avatar, voiceId: c.voiceId || null, role: c.role },
      create: {
        comicId, name: c.name, role: c.role || '配角',
        persona: c.persona, appearancePrompt: c.appearancePrompt,
        avatar: c.avatar, voiceId: c.voiceId || null,
      },
    });
  }
  return prisma.character.findMany({ where: { comicId } });
}

// ---------- v6.0 深化：藍圖多輪改稿 ----------
// 用戶對已有藍圖提出修改意見，LLM 保留結構只改內容；無 LLM 時本地合併
async function reviseBlueprint(blueprint, feedback) {
  if (!blueprint || !feedback) return blueprint;
  if (llmService.isEnabled()) {
    try {
      const prompt = `你是專業短劇策劃。以下是現有故事藍圖 JSON 與用戶修改意見。
請根據意見修改藍圖，保持原有 JSON 結構不變（title/logline/characters/acts/emotionCurve），嚴格輸出 JSON。

【現有藍圖】
${JSON.stringify(blueprint).slice(0, 5000)}

【修改意見】
${feedback.slice(0, 500)}`;
      const revised = await callBlueprintLlm(prompt);
      revised._mock = false;
      revised._revision = (blueprint._revision || 0) + 1;
      return revised;
    } catch (e) {
      console.warn('[Agent] 改稿失敗，降級為本地合併:', e.message);
    }
  }
  // 本地降級：把意見融入 logline 與最後一幕懸念，並標記修訂次數
  const revised = JSON.parse(JSON.stringify(blueprint));
  revised.logline = `${(revised.logline || '').slice(0, 30)}（依「${feedback.slice(0, 20)}」調整）`;
  if (revised.acts && revised.acts.length) {
    const last = revised.acts[revised.acts.length - 1];
    last.cliffhanger = `${feedback.slice(0, 24)}……`;
  }
  revised._mock = true;
  revised._revision = (blueprint._revision || 0) + 1;
  return revised;
}

// ---------- v6.0 深化：單角色頭像重生成 ----------
async function regenerateCharacterAvatar(character, artStyle = 'anime') {
  const cards = await buildCharacterCards([character], artStyle);
  return cards[0];
}

module.exports = { parseBlueprint, buildCharacterCards, blueprintToScript, saveCharacters, reviseBlueprint, regenerateCharacterAvatar };
