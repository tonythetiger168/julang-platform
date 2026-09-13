// ===== v5.0 AI 劇本生成服務 =====
// 優先調用 OpenAI 兼容接口（Moonshot/Kimi、OpenAI、DeepSeek 等均可接入）
// 未配置 API Key 時自動降級為內置模板生成器，保證全流程可演示

const https = require('https');
const http = require('http');

const LLM_CONFIG = {
  apiKey: process.env.AI_LLM_API_KEY || '',
  baseUrl: process.env.AI_LLM_BASE_URL || 'https://api.moonshot.cn/v1',
  model: process.env.AI_LLM_MODEL || 'moonshot-v1-8k',
  timeout: parseInt(process.env.AI_LLM_TIMEOUT || '60000', 10),
};

function isEnabled() {
  return !!LLM_CONFIG.apiKey;
}

// 通用 HTTP JSON POST
function postJson(url, headers, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        timeout: LLM_CONFIG.timeout,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject(new Error(json.error?.message || `LLM API ${res.statusCode}`));
            } else {
              resolve(json);
            }
          } catch (e) {
            reject(new Error('LLM 響應解析失敗'));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('LLM 請求超時')));
    req.write(JSON.stringify(body));
    req.end();
  });
}

// 構造劇本生成提示詞
function buildScriptPrompt({ theme, style, episodeCount, panelsPerEpisode, genre }) {
  return `你是專業短劇編劇。請根據以下要求創作一部${genre || '都市'}題材的動態漫劇劇本：

【創意主題】${theme}
【敘事風格】${style || '緊湊反轉'}
【集數】${episodeCount} 集
【每集分鏡數】${panelsPerEpisode} 格

要求：
1. 每集有標題和完整的分鏡腳本
2. 每格分鏡包含：鏡頭類型(close特写/medium中景/full全身/wide远景)、畫面描述(用於AI繪圖)、台詞、說話角色(旁白則為空)
3. 台詞簡短有力，符合短劇節奏，每格台詞不超過40字
4. 劇情要有鉤子和反轉，第一集前3格必須抓住觀眾

嚴格按以下 JSON 格式輸出（不要輸出任何其他文字）：
{
  "title": "漫劇標題",
  "desc": "一句話簡介",
  "characters": ["角色1", "角色2"],
  "episodes": [
    {
      "episodeNumber": 1,
      "title": "集標題",
      "panels": [
        {
          "panelNumber": 1,
          "shotType": "medium",
          "scene": "畫面描述（英文繪圖提示詞風格更佳）",
          "dialogue": "台詞內容",
          "speaker": "角色名或空"
        }
      ]
    }
  ]
}`;
}

// 從 LLM 響應中安全提取 JSON
function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM 未返回有效 JSON');
  return JSON.parse(match[0]);
}

// 調用真實 LLM
// v6.0：支持指定模型庫 LLM（modelId），經 providers 接入層路由；失敗回退默認配置
async function callLlm(prompt, modelId = '') {
  if (modelId) {
    try {
      const providers = require('./providers');
      const content = await providers.callChat(modelId, [
        { role: 'system', content: '你是專業短劇編劇，只輸出 JSON 格式內容。' },
        { role: 'user', content: prompt },
      ]);
      if (content) return extractJson(content);
    } catch (e) {
      console.warn(`[AI] LLM 模型 ${modelId} 調用失敗，回退默認:`, e.message);
    }
  }
  const res = await postJson(
    `${LLM_CONFIG.baseUrl}/chat/completions`,
    { Authorization: `Bearer ${LLM_CONFIG.apiKey}` },
    {
      model: LLM_CONFIG.model,
      messages: [
        { role: 'system', content: '你是專業短劇編劇，只輸出 JSON 格式內容。' },
        { role: 'user', content: prompt },
      ],
      temperature: 0.8,
    }
  );
  const content = res.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM 返回內容為空');
  return extractJson(content);
}

// ============ 內置模板生成器（無 API Key 降級方案） ============
const MOCK_TEMPLATES = [
  {
    titles: ['逆襲', '重生', '覺醒'],
    chars: ['林晚', '顧沉'],
    beats: [
      { shot: 'wide', scene: ' bustling city street at dusk, neon lights, cinematic anime style', line: '三年前，我被趕出家門，身無分文。', speaker: '' },
      { shot: 'close', scene: 'close-up of determined young woman eyes, tears glistening, anime style', line: '我發誓，總有一天要讓他們後悔！', speaker: '林晚' },
      { shot: 'medium', scene: 'handsome man in black suit stepping out of luxury car, anime style', line: '這位小姐，我們又見面了。', speaker: '顧沉' },
      { shot: 'medium', scene: 'woman shocked expression, rain falling, dramatic lighting, anime style', line: '是你？當年那個……', speaker: '林晚' },
      { shot: 'close', scene: 'man smirking mysteriously, city lights bokeh background, anime style', line: '從今天起，我來護你周全。', speaker: '顧沉' },
      { shot: 'full', scene: 'two figures standing together under umbrella, city night, romantic anime style', line: '這一次，命運由我自己改寫。', speaker: '' },
    ],
  },
  {
    titles: ['契約', '閃婚', '心動'],
    chars: ['蘇念', '陸景琛'],
    beats: [
      { shot: 'wide', scene: 'luxurious office interior, floor to ceiling windows, anime style', line: '一紙契約，我嫁給了全城最危險的男人。', speaker: '' },
      { shot: 'close', scene: 'nervous young woman clutching contract papers, anime style', line: '只是演戲而已……對吧？', speaker: '蘇念' },
      { shot: 'medium', scene: 'cold handsome CEO loosening tie, smirk, anime style', line: '演戲？我陸景琛從不演戲。', speaker: '陸景琛' },
      { shot: 'close', scene: 'woman blushing, heartbeat visual effect, anime style', line: '他的眼神，好像認真了……', speaker: '' },
      { shot: 'medium', scene: 'man gently holding woman hand, warm lighting, anime style', line: '契約第一條：不許離開我。', speaker: '陸景琛' },
      { shot: 'full', scene: 'couple silhouette against sunset window, romantic atmosphere, anime style', line: '原來心動，從不需要契約。', speaker: '' },
    ],
  },
];

function mockGenerate({ theme, episodeCount, panelsPerEpisode }) {
  const tpl = MOCK_TEMPLATES[Math.floor(Math.random() * MOCK_TEMPLATES.length)];
  const titleWord = tpl.titles[Math.floor(Math.random() * tpl.titles.length)];
  const episodes = [];
  for (let e = 1; e <= episodeCount; e++) {
    const panels = [];
    for (let p = 1; p <= panelsPerEpisode; p++) {
      const beat = tpl.beats[(p - 1) % tpl.beats.length];
      panels.push({
        panelNumber: p,
        shotType: beat.shot,
        scene: beat.scene,
        dialogue: beat.line,
        speaker: beat.speaker,
      });
    }
    episodes.push({ episodeNumber: e, title: `第${e}集 ${titleWord}·啟`, panels });
  }
  return {
    title: `《${titleWord}：${(theme || '命運').slice(0, 12)}》`.replace(/[《》]/g, ''),
    desc: `AI 生成漫劇：${theme || '一段逆襲與心動的故事'}`,
    characters: tpl.chars,
    episodes,
    _mock: true,
  };
}

// 對外主接口：生成結構化劇本
async function generateScript(params) {
  const { theme, style, episodeCount = 1, panelsPerEpisode = 6, genre } = params;
  if (isEnabled()) {
    try {
      const script = await callLlm(buildScriptPrompt(params));
      script._mock = false;
      return script;
    } catch (e) {
      console.warn('[AI] LLM 調用失敗，降級為模板生成:', e.message);
    }
  }
  return mockGenerate({ theme, style, episodeCount, panelsPerEpisode });
}

module.exports = { generateScript, isEnabled, callLlm, LLM_CONFIG };
