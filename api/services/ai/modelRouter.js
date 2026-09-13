// ===== v6.0 Agent 自動選型 =====
// 按創作場景把任務路由到最合適的模型（利用 MODEL_LIBRARY 的 tags/maxDuration/nativeAudio 元數據）
// 選型結果可被 Agent 工作流、OpenAPI 與前端「智能推薦」共用

// 場景 → 視頻模型
// hints: { dialogueHeavy, longNarrative, anime, cameraControl, cinematic, cheap, seconds }
function pickVideo(hints = {}) {
  const s = hints.seconds || 0;
  if (hints.cinematic) return 'veo31';                       // 4K 電影感大場面
  if (hints.longNarrative || s > 16) return 'seedance25';    // 30s 長敘事旗艦
  if (hints.dialogueHeavy || hints.anime) return 'vidu-q3';  // 多人對話／漫劇專精
  if (hints.cameraControl) return 'runway-g45';              // 導演級運鏡
  if (hints.anime === false && hints.cheap) return 'hailuo23';
  if (hints.cheap) return s > 15 ? 'seedance20-mini' : 'seedance20-mini';
  return 'seedance20-fast';                                  // 默認性價比
}

// 場景 → 圖像模型
// hints: { characterConsistency, typography, quality4k, cinematic, concept, cheap }
function pickImage(hints = {}) {
  if (hints.characterConsistency) return 'flux2';            // 多參考一致性
  if (hints.typography) return 'gpt-image2';                 // 文字／海報
  if (hints.quality4k) return 'nb-pro';                      // 原生 4K
  if (hints.concept || hints.cinematic) return 'mj-v81';     // 概念氛圖
  if (hints.cheap) return 'libnano2';
  return 'seedream5';                                        // 默認角色一致性穩
}

// 場景 → 語音模型
// hints: { multiSpeaker, alignDuration, chinese, music, singing }
function pickTTS(hints = {}) {
  if (hints.music || hints.singing) return 'suno-v55';
  if (hints.alignDuration) return 'indextts2';               // 音畫對齊
  if (hints.multiSpeaker) return 'gemini31-tts';             // 多人對話一次合成
  if (hints.chinese !== false) return 'minimax-speech28';    // 中文配音主力
  return 'eleven-v3';
}

// 場景 → LLM
// hints: { phase: 'draft'|'final'|'structured'|'reasoning', longContext }
function pickLLM(hints = {}) {
  switch (hints.phase) {
    case 'draft': return 'kimi-k26';                         // 快速初稿
    case 'structured': return 'ds-v4-flash';                 // 批量結構化
    case 'reasoning': return 'ds-v4-pro';                    // 深度推理伏筆
    case 'dialogue': return 'claude-opus5';                  // 對白層次
    case 'final':
    default: return 'kimi-k3';                               // 旗艦劇本規劃
  }
}

// 綜合推薦：給一段場景描述，輸出全鏈路選型
function recommend(scene = {}) {
  return {
    llm: pickLLM(scene),
    image: pickImage(scene),
    video: pickVideo(scene),
    tts: pickTTS(scene),
  };
}

module.exports = { pickVideo, pickImage, pickTTS, pickLLM, recommend };
