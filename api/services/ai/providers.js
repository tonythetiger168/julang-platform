// ===== v6.0 模型 Provider 接入層 =====
// 統一管理 35 款模型的上游路由：Provider 註冊表 + 模型路由 + 通用調用
// 所有調用在未配置對應 API Key 時返回 null，由調用方降級為演示數據
//
// 環境變量規律（兩級，均可選）：
//   1) Provider 級：MOONSHOT_API_KEY / ARK_API_KEY / OPENAI_API_KEY ...
//   2) 模型級覆蓋：MODEL_<ID大寫>_API_KEY / MODEL_<ID大寫>_BASE_URL（- 轉 _）

const https = require('https');
const http = require('http');

// ---------- Provider 註冊表 ----------
const PROVIDERS = {
  moonshot:   { baseUrl: 'https://api.moonshot.cn/v1',              keyEnv: 'MOONSHOT_API_KEY',   type: 'openai' },
  anthropic:  { baseUrl: 'https://api.anthropic.com/v1',            keyEnv: 'ANTHROPIC_API_KEY',  type: 'openai-compat-proxy' },
  aliyun:     { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', keyEnv: 'DASHSCOPE_API_KEY', type: 'openai' },
  zhipu:      { baseUrl: 'https://open.bigmodel.cn/api/paas/v4',    keyEnv: 'ZHIPU_API_KEY',      type: 'openai' },
  minimax:    { baseUrl: 'https://api.minimaxi.com/v1',             keyEnv: 'MINIMAX_API_KEY',    type: 'openai' },
  deepseek:   { baseUrl: 'https://api.deepseek.com/v1',             keyEnv: 'DEEPSEEK_API_KEY',   type: 'openai' },
  volcengine: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', keyEnv: 'ARK_API_KEY',       type: 'ark' },
  google:     { baseUrl: 'https://generativelanguage.googleapis.com/v1beta', keyEnv: 'GEMINI_API_KEY', type: 'gemini' },
  openai:     { baseUrl: 'https://api.openai.com/v1',               keyEnv: 'OPENAI_API_KEY',     type: 'openai' },
  kling:      { baseUrl: 'https://api.klingai.com',                 keyEnv: 'KLING_API_KEY',      type: 'task' },
  vidu:       { baseUrl: 'https://api.vidu.com/ent/v2',             keyEnv: 'VIDU_API_KEY',       type: 'task' },
  runway:     { baseUrl: 'https://api.dev.runwayml.com/v1',         keyEnv: 'RUNWAY_API_KEY',     type: 'task' },
  pika:       { baseUrl: 'https://api.pika.art/v1',                 keyEnv: 'PIKA_API_KEY',       type: 'task' },
  shengshu:   { baseUrl: 'https://openai-api.shengshulianmeng.com/v1', keyEnv: 'SHENGSHU_API_KEY', type: 'openai' },
  elevenlabs: { baseUrl: 'https://api.elevenlabs.io/v1',            keyEnv: 'ELEVENLABS_API_KEY', type: 'task' },
  suno:       { baseUrl: 'https://api.sunoapi.org/api/v1',          keyEnv: 'SUNO_API_KEY',       type: 'task' },
  bfl:        { baseUrl: 'https://api.bfl.ml/v1',                   keyEnv: 'BFL_API_KEY',        type: 'task' },
};

// ---------- 模型路由（我們的模型 id → 上游） ----------
const MODEL_ROUTES = {
  // LLM
  'kimi-k3':         { provider: 'moonshot',   upstream: 'kimi-k3' },
  'kimi-k26':        { provider: 'moonshot',   upstream: 'kimi-k2.6' },
  'claude-opus5':    { provider: 'anthropic',  upstream: 'claude-opus-5' },
  'qwen38-max':      { provider: 'aliyun',     upstream: 'qwen3.8-max' },
  'glm53':           { provider: 'zhipu',      upstream: 'glm-5.3' },
  'minimax-m3':      { provider: 'minimax',    upstream: 'MiniMax-M3' },
  'ds-v4-pro':       { provider: 'deepseek',   upstream: 'deepseek-v4-pro' },
  'ds-v4-flash':     { provider: 'deepseek',   upstream: 'deepseek-v4-flash' },
  // 圖像
  'libnano2':        { provider: 'shengshu',   upstream: 'libnano-2' },
  'libnano-pro':     { provider: 'shengshu',   upstream: 'libnano-pro' },
  'seedream5':       { provider: 'volcengine', upstream: 'doubao-seedream-5-0-lite' },
  'seedream45':      { provider: 'volcengine', upstream: 'doubao-seedream-4-5' },
  'z-image':         { provider: 'aliyun',     upstream: 'z-image-turbo' },
  'qwen-image':      { provider: 'aliyun',     upstream: 'qwen-image' },
  'gpt-image2':      { provider: 'openai',     upstream: 'gpt-image-2' },
  'flux2':           { provider: 'bfl',        upstream: 'flux-2-pro' },
  'mj-v81':          { provider: 'openai',     upstream: 'midjourney-v8.1' }, // 經代理
  'nb-pro':          { provider: 'google',     upstream: 'gemini-3-pro-image' },
  // 視頻
  'seedance25':      { provider: 'volcengine', upstream: 'doubao-seedance-2-5' },
  'seedance20-fast': { provider: 'volcengine', upstream: 'doubao-seedance-2-0-fast' },
  'seedance20-mini': { provider: 'volcengine', upstream: 'doubao-seedance-2-0-mini' },
  'kling-o3':        { provider: 'kling',      upstream: 'kling-o3' },
  'kling3':          { provider: 'kling',      upstream: 'kling-v3' },
  'vidu-q3':         { provider: 'vidu',       upstream: 'viduq3' },
  'veo31':           { provider: 'google',     upstream: 'veo-3.1-generate' },
  'runway-g45':      { provider: 'runway',     upstream: 'gen4.5' },
  'hailuo23':        { provider: 'minimax',    upstream: 'MiniMax-Hailuo-2.3' },
  'pika25':          { provider: 'pika',       upstream: 'pika-2.5' },
  'wan26':           { provider: 'aliyun',     upstream: 'wan2.6-t2v-plus' },
  // 音頻
  'eleven-v3':       { provider: 'elevenlabs', upstream: 'eleven_v3' },
  'gemini31-tts':    { provider: 'google',     upstream: 'gemini-3.1-flash-tts' },
  'minimax-speech28':{ provider: 'minimax',    upstream: 'speech-2.8-hd' },
  'indextts2':       { provider: 'openai',     upstream: 'indextts-2' },
  'mureka-v8':       { provider: 'openai',     upstream: 'mureka-v8' },
  'suno-v55':        { provider: 'suno',       upstream: 'suno-v5.5' },
};

// ---------- 點數成本（每次調用扣點；按上游公開定價折算的演示值） ----------
const MODEL_COSTS = {
  'kimi-k3': 8, 'kimi-k26': 3, 'claude-opus5': 20, 'qwen38-max': 10,
  'glm53': 5, 'minimax-m3': 2, 'ds-v4-pro': 4, 'ds-v4-flash': 1,
  'libnano2': 2, 'libnano-pro': 5, 'seedream5': 6, 'seedream45': 4, 'z-image': 3,
  'qwen-image': 3, 'gpt-image2': 10, 'flux2': 6, 'mj-v81': 8, 'nb-pro': 8,
  'seedance25': 60, 'seedance20-fast': 20, 'seedance20-mini': 8,
  'kling-o3': 40, 'kling3': 35, 'vidu-q3': 30, 'veo31': 80,
  'runway-g45': 45, 'hailuo23': 15, 'pika25': 12, 'wan26': 25,
  'eleven-v3': 4, 'gemini31-tts': 3, 'minimax-speech28': 2, 'indextts2': 2,
  'mureka-v8': 10, 'suno-v55': 12,
};

// ---------- 通用 HTTP JSON ----------
function postJson(url, headers, body, timeout = 120000) {
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
        timeout,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 400) reject(new Error(json.error?.message || json.message || `API ${res.statusCode}`));
            else resolve(json);
          } catch { reject(new Error('API 響應解析失敗')); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('API 請求超時')));
    req.write(JSON.stringify(body));
    req.end();
  });
}

function getJson(url, headers, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      { hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: 'GET', headers, timeout },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try { resolve(JSON.parse(data)); } catch { reject(new Error('API 響應解析失敗')); }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('API 請求超時')));
    req.end();
  });
}

// ---------- 路由解析 ----------
// 返回 { apiKey, baseUrl, upstream, provider, type } 或 null（無 key → 降級）
function resolveModel(modelId) {
  const route = MODEL_ROUTES[modelId];
  if (!route) return null;
  const p = PROVIDERS[route.provider];
  const envId = modelId.toUpperCase().replace(/[-.]/g, '_');
  const apiKey = process.env[`MODEL_${envId}_API_KEY`] || process.env[p.keyEnv] || '';
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: process.env[`MODEL_${envId}_BASE_URL`] || p.baseUrl,
    upstream: route.upstream,
    provider: route.provider,
    type: p.type,
  };
}

function isModelEnabled(modelId) {
  return !!resolveModel(modelId);
}

// ---------- LLM（OpenAI 兼容 chat/completions） ----------
async function callChat(modelId, messages, opts = {}) {
  const r = resolveModel(modelId);
  if (!r) return null;
  const res = await postJson(
    `${r.baseUrl}/chat/completions`,
    { Authorization: `Bearer ${r.apiKey}` },
    { model: r.upstream, messages, temperature: opts.temperature ?? 0.8, ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}) }
  );
  return res.choices?.[0]?.message?.content || null;
}

// ---------- 圖像（OpenAI 兼容 images/generations） ----------
async function callImage(modelId, { prompt, size = '1024x1792' }) {
  const r = resolveModel(modelId);
  if (!r || r.type !== 'openai') return null;
  const res = await postJson(
    `${r.baseUrl}/images/generations`,
    { Authorization: `Bearer ${r.apiKey}` },
    { model: r.upstream, prompt, n: 1, size }
  );
  return res.data?.[0]?.url || null;
}

// ---------- TTS（OpenAI 兼容 audio/speech） ----------
async function callSpeech(modelId, { text, voice = 'alloy' }) {
  const r = resolveModel(modelId);
  if (!r || r.type !== 'openai') return null;
  // 返回音頻 URL 或 base64 由上游決定；此處按兼容接口請求
  const res = await postJson(
    `${r.baseUrl}/audio/speech`,
    { Authorization: `Bearer ${r.apiKey}` },
    { model: r.upstream, input: text, voice, response_format: 'mp3' }
  );
  return res.url || res.data?.[0]?.url || null;
}

// ---------- 視頻（任務制：創建 → 輪詢；ARK / Kling / Vidu / Runway 通用形態） ----------
async function callVideo(modelId, { prompt, imageUrl, duration = 5 }, { pollMs = 5000, maxWaitMs = 300000 } = {}) {
  const r = resolveModel(modelId);
  if (!r) return null;
  const auth = { Authorization: `Bearer ${r.apiKey}` };
  let createUrl, body, extractTaskId, statusUrl, extractVideo;

  if (r.provider === 'volcengine') {          // 火山方舟 Seedance
    createUrl = `${r.baseUrl}/contents/generations/tasks`;
    body = { model: r.upstream, content: [{ type: 'text', text: `${prompt} --duration ${duration}` }] };
    if (imageUrl) body.content.push({ type: 'image_url', image_url: { url: imageUrl } });
    extractTaskId = (j) => j.id;
    statusUrl = (id) => `${r.baseUrl}/contents/generations/tasks/${id}`;
    extractVideo = (j) => j.content?.video_url || null;
  } else if (r.provider === 'vidu') {          // Vidu
    createUrl = `${r.baseUrl}/text2video`;
    body = { model: r.upstream, prompt, duration };
    if (imageUrl) { createUrl = `${r.baseUrl}/img2video`; body.images = [imageUrl]; }
    extractTaskId = (j) => j.task_id;
    statusUrl = (id) => `${r.baseUrl}/tasks/${id}/creations`;
    extractVideo = (j) => j.creations?.[0]?.url || null;
  } else {                                     // 其他任務制 provider 的通用形態
    createUrl = `${r.baseUrl}/generations`;
    body = { model: r.upstream, prompt, image_url: imageUrl, duration };
    extractTaskId = (j) => j.id || j.task_id;
    statusUrl = (id) => `${r.baseUrl}/generations/${id}`;
    extractVideo = (j) => j.video_url || j.output?.video_url || j.data?.video_url || null;
  }

  const created = await postJson(createUrl, auth, body);
  const taskId = extractTaskId(created);
  if (!taskId) throw new Error('視頻任務創建失敗');
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    await new Promise((res2) => setTimeout(res2, pollMs));
    const st = await getJson(statusUrl(taskId), auth);
    const url = extractVideo(st);
    if (url) return url;
    if (['failed', 'error'].includes((st.status || '').toLowerCase())) throw new Error('視頻生成失敗');
  }
  throw new Error('視頻生成超時');
}

function modelCost(modelId) {
  return MODEL_COSTS[modelId] ?? 5;
}

module.exports = {
  PROVIDERS, MODEL_ROUTES, MODEL_COSTS,
  postJson, getJson, resolveModel, isModelEnabled,
  callChat, callImage, callSpeech, callVideo, modelCost,
};
