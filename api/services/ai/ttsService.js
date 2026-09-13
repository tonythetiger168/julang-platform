// ===== v5.0 AI 配音服務（TTS） =====
// 優先調用 OpenAI 兼容語音合成接口；未配置時返回 null，
// 前端漫劇播放器自動降級為 Web Speech API 或純字幕模式

const https = require('https');
const http = require('http');

const TTS_CONFIG = {
  apiKey: process.env.AI_TTS_API_KEY || '',
  baseUrl: process.env.AI_TTS_BASE_URL || 'https://api.openai.com/v1',
  model: process.env.AI_TTS_MODEL || 'tts-1',
  timeout: parseInt(process.env.AI_TTS_TIMEOUT || '60000', 10),
};

// 可用音色列表（供前端選擇）
const VOICES = [
  { id: 'alloy', name: '清悦（女）', gender: 'female', desc: '年輕清亮，適合甜寵女主' },
  { id: 'nova', name: '柔婉（女）', gender: 'female', desc: '溫柔成熟，適合旁白' },
  { id: 'onyx', name: '低沉（男）', gender: 'male', desc: '磁性低沉，適合霸總男主' },
  { id: 'echo', name: '沉穩（男）', gender: 'male', desc: '沉穩敘事，適合懸疑' },
  { id: 'fable', name: '靈動（中性）', gender: 'neutral', desc: '活潑靈動，適合喜劇' },
];

function isEnabled() {
  return !!TTS_CONFIG.apiKey;
}

// 二進制 POST，返回 Buffer
function postBinary(url, headers, body) {
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
        timeout: TTS_CONFIG.timeout,
      },
      (res) => {
        if (res.statusCode >= 400) {
          let data = '';
          res.on('data', (c) => (data += c));
          res.on('end', () => reject(new Error(`TTS API ${res.statusCode}: ${data.slice(0, 200)}`)));
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('TTS 請求超時')));
    req.write(JSON.stringify(body));
    req.end();
  });
}

// 根據角色分配音色（簡單策略：男主/女主/旁白）
function pickVoice(speaker, defaultVoice) {
  if (!speaker) return defaultVoice || 'nova'; // 旁白
  const maleNames = ['沉', '琛', '總裁', '少', '爺', '王', '帝'];
  const isMale = maleNames.some((k) => speaker.includes(k));
  return isMale ? 'onyx' : 'alloy';
}

// 合成單段台詞，返回可訪問的 URL 或 data URI
// v6.0：支持指定模型庫語音模型（model 參數），經 providers 接入層路由
async function synthesize({ text, speaker = '', voiceId = '', comicId = '', panelRef = '', model = '' }) {
  if (!text || !text.trim()) return { voiceUrl: null, mock: true };
  if (model) {
    try {
      const providers = require('./providers');
      const url = await providers.callSpeech(model, { text: text.slice(0, 500), voice: voiceId || pickVoice(speaker) });
      if (url) return { voiceUrl: url, model, mock: false };
    } catch (e) {
      console.warn(`[AI] 語音模型 ${model} 調用失敗，降級:`, e.message);
    }
  }
  if (!isEnabled()) {
    return { voiceUrl: null, mock: true, reason: 'TTS 未配置，前端將使用 Web Speech 降級' };
  }
  try {
    const voice = voiceId || pickVoice(speaker);
    const audio = await postBinary(
      `${TTS_CONFIG.baseUrl}/audio/speech`,
      { Authorization: `Bearer ${TTS_CONFIG.apiKey}` },
      { model: TTS_CONFIG.model, voice, input: text.slice(0, 500) }
    );
    // 以 data URI 形式返回，免對象存儲配置；生產環境建議上傳 OSS/S3 後存 URL
    const dataUri = `data:audio/mpeg;base64,${audio.toString('base64')}`;
    return { voiceUrl: dataUri, mock: false };
  } catch (e) {
    console.warn('[AI] TTS 合成失敗:', e.message);
    return { voiceUrl: null, mock: true, reason: e.message };
  }
}

module.exports = { synthesize, pickVoice, isEnabled, VOICES, TTS_CONFIG };
