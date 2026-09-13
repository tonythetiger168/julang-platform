// ===== v5.0 AI 分鏡圖生成服務 =====
// 優先調用 OpenAI 兼容文生圖接口；未配置時降級為種子占位圖

const https = require('https');
const http = require('http');

const IMAGE_CONFIG = {
  apiKey: process.env.AI_IMAGE_API_KEY || '',
  baseUrl: process.env.AI_IMAGE_BASE_URL || 'https://api.openai.com/v1',
  model: process.env.AI_IMAGE_MODEL || 'dall-e-3',
  size: process.env.AI_IMAGE_SIZE || '1024x1792', // 豎版 9:16 適配短劇
  timeout: parseInt(process.env.AI_IMAGE_TIMEOUT || '120000', 10),
};

// 畫風前綴映射
const STYLE_PROMPTS = {
  anime: 'Japanese anime style, vibrant colors, cel shading',
  ink: 'Chinese ink wash painting style, monochrome with red accents',
  realistic: 'realistic digital painting, cinematic lighting, film still',
  chibi: 'cute chibi style, soft pastel colors, kawaii',
};

function isEnabled() {
  return !!IMAGE_CONFIG.apiKey;
}

function postJson(url, headers, body, timeout) {
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
        timeout: timeout || IMAGE_CONFIG.timeout,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            if (res.statusCode >= 400) {
              reject(new Error(json.error?.message || `Image API ${res.statusCode}`));
            } else {
              resolve(json);
            }
          } catch {
            reject(new Error('圖像 API 響應解析失敗'));
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('圖像生成超時')));
    req.write(JSON.stringify(body));
    req.end();
  });
}

// 構造生圖提示詞
function buildImagePrompt(scene, artStyle, characters) {
  const stylePrefix = STYLE_PROMPTS[artStyle] || STYLE_PROMPTS.anime;
  const charHint = characters?.length ? `, featuring ${characters.join(' and ')}` : '';
  return `${stylePrefix}, vertical 9:16 composition${charHint}, ${scene}, high quality, detailed`;
}

// 降級方案：生成穩定的種子占位圖（picsum 支持種子化）
function placeholderImage(seedText) {
  let hash = 0;
  for (let i = 0; i < seedText.length; i++) {
    hash = (hash * 31 + seedText.charCodeAt(i)) >>> 0;
  }
  return `https://picsum.photos/seed/jl${hash % 100000}/720/1280`;
}

// 生成單張分鏡圖，返回圖片 URL
// v6.0：支持指定模型庫中的模型（model 參數），經 providers 接入層路由到真實上游
async function generatePanelImage({ scene, artStyle = 'anime', characters = [], seedText = '', model = '' }) {
  const prompt = buildImagePrompt(scene, artStyle, characters);
  // 指定模型且已配置對應 Key → 走模型路由
  if (model) {
    try {
      const providers = require('./providers');
      const url = await providers.callImage(model, { prompt, size: IMAGE_CONFIG.size });
      if (url) return { imageUrl: url, imagePrompt: prompt, model, mock: false };
    } catch (e) {
      console.warn(`[AI] 圖像模型 ${model} 調用失敗，降級:`, e.message);
    }
  }
  if (isEnabled()) {
    try {
      const res = await postJson(
        `${IMAGE_CONFIG.baseUrl}/images/generations`,
        { Authorization: `Bearer ${IMAGE_CONFIG.apiKey}` },
        { model: IMAGE_CONFIG.model, prompt, n: 1, size: IMAGE_CONFIG.size }
      );
      const url = res.data?.[0]?.url;
      if (url) return { imageUrl: url, imagePrompt: prompt, mock: false };
      throw new Error('圖像 API 未返回 URL');
    } catch (e) {
      console.warn('[AI] 圖像生成失敗，降級為占位圖:', e.message);
    }
  }
  return { imageUrl: placeholderImage(seedText || scene), imagePrompt: prompt, mock: true };
}

// 生成漫劇封面
async function generateCover({ title, theme, artStyle = 'anime' }) {
  const scene = `dramatic poster art for a story about ${theme || title}, no text`;
  return generatePanelImage({ scene, artStyle, seedText: `cover-${title}` });
}

module.exports = { generatePanelImage, generateCover, isEnabled, IMAGE_CONFIG, STYLE_PROMPTS };
