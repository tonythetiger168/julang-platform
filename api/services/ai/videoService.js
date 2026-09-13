// ===== v6.0 視頻生成服務 =====
// 經 providers 接入層調用真實視頻模型（Seedance/Vidu/Kling/Veo/Runway/Hailuo/Pika/Wan）
// 未配置對應 API Key 時降級為演示片源，保證全流程可演示

const providers = require('./providers');

const DEMO_VIDEO = process.env.DEMO_VIDEO_URL || 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8';

// 生成視頻：返回 { videoUrl, model, mock }
async function generateVideo({ model = 'seedance20-fast', prompt = '', imageUrl = '', duration = 5 }) {
  if (providers.isModelEnabled(model)) {
    try {
      const url = await providers.callVideo(model, { prompt, imageUrl, duration });
      if (url) return { videoUrl: url, model, mock: false };
    } catch (e) {
      console.warn(`[AI] 視頻模型 ${model} 調用失敗，降級演示片源:`, e.message);
    }
  }
  return { videoUrl: DEMO_VIDEO, model, mock: true };
}

module.exports = { generateVideo, DEMO_VIDEO };
