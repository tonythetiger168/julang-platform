// ===== v6.0 LibTV 參考：模型庫 / 分鏡腳本表 / 圖像工具集 / Slash 命令 / 視頻合成 =====
const { z } = require('zod');
const agentService = require('../services/ai/agentService');
const imageService = require('../services/ai/imageService');
const { success, error } = require('../utils/response');

// ---------- 模型庫（參考 LibTV 多模型選擇） ----------
const MODEL_LIBRARY = {
  image: [
    { id: 'libnano2', name: 'LibNano 2', desc: '通用生圖，速度快，中文文本渲染準確', tags: ['通用', '快速'] },
    { id: 'libnano-pro', name: 'LibNano Pro', desc: '2K/4K 直出，複雜編輯理解力強', tags: ['高清', '編輯'] },
    { id: 'seedream5', name: 'Seedream 5.0 Lite', desc: '角色一致性穩定，空間佈局優秀', tags: ['角色一致性'] },
    { id: 'seedream45', name: 'Seedream 4.5', desc: '中文本土審美，文字版式', tags: ['中文'] },
    { id: 'z-image', name: 'Z Image Turbo', desc: '攝影級真實感，亞洲審美友好', tags: ['寫實'] },
    { id: 'qwen-image', name: 'Qwen Image', desc: '超長文本渲染，海報封面設計', tags: ['文字'] },
    { id: 'gpt-image2', name: 'GPT Image 2', desc: 'OpenAI 榜首：思考型生圖，複雜構圖與中英文字渲染近乎完美', tags: ['榜首', '文字'] },
    { id: 'flux2', name: 'FLUX.2', desc: '最強開源權重，多參考圖控制，角色一致性資產庫首選', tags: ['開源', '角色一致性'] },
    { id: 'mj-v81', name: 'Midjourney V8.1', desc: '美學與電影感標杆，默認 2K，概念圖氛圖利器', tags: ['美學', '概念'] },
    { id: 'nb-pro', name: 'Nano Banana Pro', desc: 'Gemini 3 Pro Image：原生 4K，編輯榜前列，高清放大管線源頭', tags: ['4K', '編輯'] },
  ],
  video: [
    { id: 'seedance25', name: 'Seedance 2.5', desc: '字節旗艦：30s 長敘事直出、原生音畫同步、50 個多模態參考、時間戳局部編輯', tags: ['旗艦', '30s', '原生音頻'], maxDuration: 30, nativeAudio: true },
    { id: 'seedance20-fast', name: 'Seedance 2.0 Fast', desc: '高性價比量產款，720P 低至約 0.6 元/秒', tags: ['快速', '性價比'], maxDuration: 15 },
    { id: 'seedance20-mini', name: 'Seedance 2.0 Mini', desc: '極致低成本試錯款，720P 低至約 0.2 元/秒', tags: ['低成本'], maxDuration: 15 },
    { id: 'kling-o3', name: 'Kling O3', desc: '全能參考生成，元素增刪改換', tags: ['編輯'] },
    { id: 'kling3', name: 'Kling 3.0', desc: '原生音畫同步，多分鏡敘事', tags: ['音畫'] },
    { id: 'vidu-q3', name: 'Vidu Q3', desc: '生數科技：原生音視頻一體直出，16s 長片，多人對話，為漫劇／短劇敘事設計', tags: ['原生音頻', '漫劇'], maxDuration: 16, nativeAudio: true },
    { id: 'veo31', name: 'Veo 3.1', desc: 'Google 綜合質量第一：4K 電影質感、原生音頻、光影色調最頂，片頭／空鏡／大場面首選', tags: ['4K', '電影感', '原生音頻'], nativeAudio: true },
    { id: 'runway-g45', name: 'Runway Gen-4.5', desc: '運鏡與相機控制最強，導演級把控，配合導演台精準運鏡', tags: ['運鏡', '導演級'] },
    { id: 'hailuo23', name: 'MiniMax Hailuo 2.3', desc: '快速便宜，動漫／風格化表現好，漫劇量產鋪量', tags: ['快速', '動漫'] },
    { id: 'pika25', name: 'Pika 2.5', desc: '特效玩法多，社交傳播向短片', tags: ['特效', '社交'] },
    { id: 'wan26', name: 'Wan 2.6', desc: '多角色對話，語音參考', tags: ['對話'] },
  ],
  audio: [
    { id: 'eleven-v3', name: 'Eleven V3', desc: '文本轉語音', tags: ['TTS'] },
    { id: 'gemini31-tts', name: 'Gemini 3.1 Flash TTS', desc: '多說話人對話＋200+ 情緒場景標籤，70+ 語言，雙人對白一次合成', tags: ['對話', '多語言'] },
    { id: 'minimax-speech28', name: 'MiniMax Speech 2.8', desc: '中文表現力強、40+ 語言、性價比高，中文短劇配音主力', tags: ['中文', '配音'] },
    { id: 'indextts2', name: 'IndexTTS-2', desc: '時長可控，音畫對齊，配音精準卡分鏡時長', tags: ['對齊', '配音'] },
    { id: 'mureka-v8', name: 'Mureka V8', desc: '文本生成歌曲或純音樂', tags: ['音樂'] },
    { id: 'suno-v55', name: 'Suno V5.5', desc: '聲紋複製＋自定義模型，主題曲／BGM 生成', tags: ['音樂'] },
  ],
  llm: [
    { id: 'kimi-k3', name: 'Kimi K3', desc: '2.8T 旗艦：長文本劇本與分鏡規劃，100 萬 token 上下文，原生視覺理解', tags: ['劇本', '旗艦'], context: '1M' },
    { id: 'claude-opus5', name: 'Claude Opus 5', desc: '創意寫作榜首（EQ-Bench Creative Writing 第一），角色聲音與對白層次最強', tags: ['創意榜首', '對白'], context: '1M' },
    { id: 'qwen38-max', name: 'Qwen3.8-Max', desc: '阿里旗艦：中文創作強、原生多模態，Vision Arena 前列', tags: ['中文', '多模態'], context: '1M' },
    { id: 'kimi-k26', name: 'Kimi K2.6', desc: '快速對話與劇本初稿，256k 上下文，響應更快', tags: ['快速'], context: '256k' },
    { id: 'glm53', name: 'GLM-5.3', desc: '智譜旗艦：中文強、Agentic 能力佳，價格親民', tags: ['性價比', '中文'] },
    { id: 'minimax-m3', name: 'MiniMax M3', desc: '512k 長上下文，批量結構化任務成本極低', tags: ['長文', '低成本'], context: '512k' },
    { id: 'ds-v4-pro', name: 'DeepSeek V4 Pro', desc: '1.6T 旗艦：深度推理 / Think Max 三檔思考，長線劇情伏筆規劃，1M 上下文', tags: ['深度推理', '旗艦'], context: '1M' },
    { id: 'ds-v4-flash', name: 'DeepSeek V4 Flash', desc: '284B 高吞吐款：批量分鏡表 / 結構化輸出，極致性價比', tags: ['批量', '結構化'], context: '1M' },
  ],
};

async function listModels(_req, res) {
  success(res, MODEL_LIBRARY);
}

// ---------- Agent 自動選型（按場景推薦全鏈路模型） ----------
const recommendSchema = z.object({
  dialogueHeavy: z.boolean().optional(), longNarrative: z.boolean().optional(),
  anime: z.boolean().optional(), cameraControl: z.boolean().optional(),
  cinematic: z.boolean().optional(), cheap: z.boolean().optional(),
  characterConsistency: z.boolean().optional(), typography: z.boolean().optional(),
  quality4k: z.boolean().optional(), concept: z.boolean().optional(),
  multiSpeaker: z.boolean().optional(), alignDuration: z.boolean().optional(),
  chinese: z.boolean().optional(), music: z.boolean().optional(),
  phase: z.enum(['draft', 'final', 'structured', 'reasoning', 'dialogue']).optional(),
  seconds: z.number().min(1).max(60).optional(),
}).partial();

async function recommendModels(req, res) {
  try {
    const modelRouter = require('../services/ai/modelRouter');
    const hints = req.body || {};
    success(res, { hints, models: modelRouter.recommend(hints) });
  } catch (e) {
    error(res, 500, '選型失敗');
  }
}

// ---------- 分鏡腳本表（腳本節點 → 結構化分鏡） ----------
const scriptTableSchema = z.object({
  scriptText: z.string().min(5).max(20000),
  style: z.enum(['anime', 'ink', 'realistic', 'chibi']).optional(),
  rows: z.number().int().min(3).max(30).optional(),
});

const SHOT_NAMES = { close: '特寫', medium: '中景', full: '全身', wide: '遠景' };
const CAMERA_PRESETS = ['固定', '推鏡頭', '拉鏡頭', '搖鏡頭', '跟隨鏡頭', '環繞鏡頭', '俯仰鏡頭'];

async function scriptTable(req, res) {
  try {
    const { scriptText, rows = 8 } = req.validated || req.body;
    // 優先 LLM 生成結構化分鏡表，失敗降級本地切分
    let table = null;
    try {
      const bp = await agentService.parseBlueprint({ scriptText });
      if (bp && bp.acts) {
        table = [];
        let idx = 0;
        for (const act of bp.acts) {
          const beats = [act.hook, act.summary, act.cliffhanger].filter(Boolean);
          for (const b of beats) {
            idx++;
            table.push({
              idx,
              duration: 3 + (idx % 3),
              scene: String(b).slice(0, 60),
              characters: (bp.characters || []).slice(0, 2).map(c => c.name).join('、'),
              shot: ['wide', 'medium', 'close'][idx % 3],
              camera: CAMERA_PRESETS[idx % CAMERA_PRESETS.length],
              dialogue: String(b).slice(0, 40),
            });
          }
        }
      }
    } catch { /* 降級 */ }
    if (!table || !table.length) {
      const segs = (scriptText.match(/[^。\n！？]+[。\n！？]?/g) || [scriptText]).slice(0, rows);
      table = segs.map((s, i) => ({
        idx: i + 1,
        duration: 3 + (i % 3),
        scene: s.trim().slice(0, 60),
        characters: '',
        shot: ['wide', 'medium', 'close'][i % 3],
        camera: CAMERA_PRESETS[i % CAMERA_PRESETS.length],
        dialogue: s.trim().slice(0, 40),
      }));
    }
    success(res, { rows: table.slice(0, rows), shotNames: SHOT_NAMES, cameraPresets: CAMERA_PRESETS }, '分鏡腳本表已生成');
  } catch (e) {
    console.error(e);
    error(res, 500, '生成分鏡腳本失敗');
  }
}

// ---------- 圖像工具集（參考 LibTV 圖像工具） ----------
const imageOpSchema = z.object({
  op: z.enum(['generate', 'upscale', 'expand', 'cutout', 'angle', 'light', 'erase', 'grid9', 'grid25', 'panorama']),
  imageUrl: z.string().max(1000).optional(),
  prompt: z.string().max(500).optional(),
  params: z.record(z.any()).optional(),
});

async function imageOp(req, res) {
  try {
    const { op, prompt, params = {} } = req.validated || req.body;
    const OP_NAMES = {
      generate: '生成圖片', upscale: '高清放大', expand: '擴圖', cutout: '摳圖', angle: '多角度',
      light: '打光', erase: '擦除', grid9: '九宮格切分', grid25: '25 宮格切分', panorama: '720° 全景圖',
    };
    // v6.0：視頻生成請求路由到 videoService（畫布「圖生視頻」走這裡）
    if (params.type === 'video') {
      const videoService = require('../services/ai/videoService');
      const v = await videoService.generateVideo({
        model: params.model || 'seedance20-fast',
        prompt: prompt || params.prompt || 'video scene',
        imageUrl: params.imageUrl || '',
        duration: params.duration || 5,
      });
      return success(res, {
        op: 'generate', opName: '生成視頻', model: v.model,
        imageUrl: '', videoUrl: v.videoUrl, mock: !!v.mock,
      }, v.mock ? '視頻已生成（演示片源，配置模型 Key 後出真片）' : '視頻已生成');
    }
    // 有繪圖 API 時按操作生成；否則返回種子占位
    const img = await imageService.generatePanelImage({
      scene: `${OP_NAMES[op]}: ${prompt || 'image operation'}`,
      artStyle: params.style || 'anime',
      model: params.model || '',
      seedText: `${op}-${prompt || ''}-${Date.now() % 100000}`,
    });
    success(res, { op, opName: OP_NAMES[op], imageUrl: img.imageUrl, mock: !!img.mock }, `${OP_NAMES[op]}完成`);
  } catch (e) {
    console.error(e);
    error(res, 500, '圖像操作失敗');
  }
}

// ---------- Slash 快捷命令（參考 LibTV / 命令） ----------
const slashSchema = z.object({
  command: z.enum(['grid-cameras', 'plot-4', 'char-views', 'grid-25', 'lighting-fix', 'plot-forward', 'plot-backward']),
  prompt: z.string().max(500).optional(),
  style: z.enum(['anime', 'ink', 'realistic', 'chibi']).optional(),
  model: z.string().max(50).optional(),
});

const SLASH_DEFS = {
  'grid-cameras': { name: '多機位九宮格', count: 9, hint: '9 個機位視角' },
  'plot-4': { name: '劇情推演四宮格', count: 4, hint: '4 種劇情走向' },
  'char-views': { name: '角色三視圖', count: 3, hint: '正面/側面/背面' },
  'grid-25': { name: '25 宮格連貫分鏡', count: 25, hint: '連貫敘事分鏡' },
  'lighting-fix': { name: '電影級光影矯正', count: 1, hint: '光影優化' },
  'plot-forward': { name: '畫面推演 +3 秒', count: 1, hint: '向後推演' },
  'plot-backward': { name: '畫面推演 -3 秒', count: 1, hint: '向前推演' },
};

async function slashCommand(req, res) {
  try {
    const { command, prompt, style, model } = req.validated || req.body;
    const def = SLASH_DEFS[command];
    const items = [];
    for (let i = 0; i < def.count; i++) {
      const img = await imageService.generatePanelImage({
        scene: `${def.name} (${i + 1}/${def.count}): ${prompt || 'scene'}`,
        artStyle: style || 'anime',
        model: model || '',
        seedText: `slash-${command}-${i}-${Date.now() % 100000}`,
      });
      items.push({ index: i + 1, imageUrl: img.imageUrl });
    }
    success(res, { command, name: def.name, hint: def.hint, items }, `${def.name}生成完成`);
  } catch (e) {
    console.error(e);
    error(res, 500, '命令執行失敗');
  }
}

// ---------- 視頻合成（時間軸 → ComposeTask 異步任務，ffmpeg 真出片） ----------
const composeSchema = z.object({
  clips: z.array(z.object({
    url: z.string().max(1000),
    start: z.number().min(0).default(0),
    end: z.number().min(0).optional(),
    duration: z.number().min(0.5).max(60).optional(),
    speed: z.number().min(0.25).max(4).optional(),
    title: z.string().max(100).optional(),
  })).min(1).max(50),
  audios: z.array(z.object({
    content: z.string().max(500),
    duration: z.number().optional(),
    speed: z.number().optional(),
  })).max(20).optional(),
  bgm: z.string().max(1000).optional(),
  title: z.string().max(100).optional(),
});


const prisma = require('../utils/prisma');

async function composeVideo(req, res) {
  try {
    const { clips, audios, bgm, title } = req.validated || req.body;
    const totalDuration = Math.round(clips.reduce((s, c) =>
      s + (c.duration != null ? c.duration : ((c.end ?? 5) - c.start)) / (c.speed || 1), 0) * 10) / 10;
    // 建立任務並入隊（異步執行 ffmpeg 合成）
    const task = await prisma.composeTask.create({
      data: { userId: req.user.id, clips, audios: audios || undefined, bgm, title: title || '劇浪短片' },
    });
    require('../workers/composeWorker').enqueue(task.id);
    success(res, {
      taskId: task.id, status: 'queued',
      clips: clips.length, totalDuration,
      message: '合成任務已入隊，輪詢 GET /ai/tools/compose/:taskId 獲取結果',
    }, `已受理 ${clips.length} 個片段的合成任務`);
  } catch (e) {
    console.error(e);
    error(res, 500, '合成失敗');
  }
}

// 輪詢合成任務狀態
async function getComposeTask(req, res) {
  try {
    const task = await prisma.composeTask.findUnique({ where: { id: req.params.taskId } });
    if (!task || task.userId !== req.user.id) return error(res, 404, '任務不存在');
    success(res, {
      taskId: task.id, status: task.status, outputUrl: task.outputUrl,
      error: task.error, title: task.title,
      totalDuration: Math.round((task.clips || []).reduce((s, c) =>
        s + (c.duration != null ? c.duration : ((c.end ?? 5) - (c.start || 0))) / (c.speed || 1), 0) * 10) / 10,
      createdAt: task.createdAt, updatedAt: task.updatedAt,
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '查詢失敗');
  }
}

// ---------- v6.1 編劇工作台：AI 續寫 / 對白潤色 ----------
const scriptAssistSchema = z.object({
  mode: z.enum(['continue', 'polish']),
  text: z.string().min(10).max(5000),
  title: z.string().max(100).optional(),
  genre: z.string().max(20).optional(),
});

async function scriptAssist(req, res) {
  try {
    const { mode, text, title = '未命名劇本', genre = '都市' } = req.validated || req.body;
    const tail = text.slice(-300);
    const llmService = require('../services/ai/llmService');
    if (llmService.isEnabled()) {
      const prompt = mode === 'continue'
        ? `你是短劇編劇。以下是${genre}短劇《${title}》的劇本結尾，請接著續寫一場（含【場景】行、【動作】描述、角色對白「角色：台詞」格式、【旁白】），150字內，只輸出劇本正文：\n${tail}`
        : `你是短劇編劇。請潤色以下劇本片段的對白（保留【場景】/【動作】/【旁白】/「角色：台詞」格式，讓台詞更有情緒張力），只輸出潤色後正文：\n${tail}`;
      try {
        const out = await llmService.callLlm(prompt);
        if (out && out.trim()) return success(res, { mode, text: out.trim() }, mode === 'continue' ? '續寫完成' : '潤色完成');
      } catch { /* 降級模板 */ }
    }
    // 降級：本地模板
    let out;
    if (mode === 'polish') {
      out = tail
        .replace(/([一-龥A-Za-z·]{2,8})：([^\n]+)/g, (m, name, line) => `${name}：${line.trim().replace(/。?$/, '。')}`)
        .replace(/【動作】/g, '【動作】鏡頭緩緩推近——');
    } else {
      out = ['', '【場景】內·舊宅走廊·夜（AI 續寫）', '【動作】長廊盡頭的燈忽明忽暗，腳步聲在寂靜中格外清晰。',
        '【旁白】門縫裡透出一線光，真相就藏在這扇門後。', `【旁白】（《${title}》續寫段落，可自由修改）`].join('\n');
    }
    success(res, { mode, text: out, degraded: true }, mode === 'continue' ? '續寫完成' : '潤色完成');
  } catch (e) {
    console.error(e);
    error(res, 500, 'AI 輔助失敗');
  }
}

module.exports = {
  listModels, recommendModels, scriptTable, imageOp, slashCommand, composeVideo, getComposeTask, scriptAssist,
  scriptTableSchema, imageOpSchema, slashSchema, composeSchema, recommendSchema, scriptAssistSchema,
  MODEL_LIBRARY, SLASH_DEFS,
};
