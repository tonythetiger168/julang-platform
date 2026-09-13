// ===== v5.0 AI 漫劇控制器 =====
const { z } = require('zod');

const prisma = require('../utils/prisma');
const comicPipeline = require('../services/ai/comicPipeline');
const ttsService = require('../services/ai/ttsService');
const imageService = require('../services/ai/imageService');
const llmService = require('../services/ai/llmService');
const { success, error } = require('../utils/response');

const createTaskSchema = z.object({
  theme: z.string().min(2).max(200),
  genre: z.string().max(20).optional(),
  style: z.enum(['anime', 'ink', 'realistic', 'chibi']).optional(),
  episodeCount: z.number().int().min(1).max(5).optional(),
  panelsPerEpisode: z.number().int().min(3).max(12).optional(),
  voiceId: z.string().max(30).optional(),
  withVoice: z.boolean().optional(),
  withImages: z.boolean().optional(),
  categoryId: z.string().uuid().optional(),
});

// 創建 AI 漫劇生成任務（需登入）
async function createTask(req, res) {
  try {
    const input = req.validated || req.body;
    const task = await comicPipeline.createComicTask(req.user.userId, input);
    success(res, { taskId: task.id, status: task.status }, 'AI 生成任務已創建');
  } catch (e) {
    console.error(e);
    error(res, 500, '創建生成任務失敗');
  }
}

// 輪詢任務狀態
async function getTaskStatus(req, res) {
  try {
    const task = await comicPipeline.getTask(req.params.id, req.user.userId);
    if (!task) return error(res, 404, '任務不存在');
    success(res, {
      id: task.id,
      status: task.status,
      progress: task.progress,
      stage: task.stage,
      comicId: task.comicId,
      errorMsg: task.errorMsg,
      output: task.output,
      createdAt: task.createdAt,
      finishedAt: task.finishedAt,
    });
  } catch (e) {
    error(res, 500, '查詢任務失敗');
  }
}

// 我的生成任務列表
async function getMyTasks(req, res) {
  try {
    const tasks = await comicPipeline.getUserTasks(req.user.userId);
    success(res, tasks);
  } catch (e) {
    error(res, 500, '獲取任務列表失敗');
  }
}

// AI 能力/配置查詢（畫風、音色、後端可用狀態）
async function getCapabilities(req, res) {
  success(res, {
    styles: [
      { id: 'anime', name: '日系動漫', desc: '色彩鮮豔的日系賽璐璐風格' },
      { id: 'ink', name: '水墨國風', desc: '中式水墨，留白意境' },
      { id: 'realistic', name: '寫實電影', desc: '電影級寫實光影' },
      { id: 'chibi', name: 'Q版萌系', desc: '可愛治癒的 Q 版畫風' },
    ],
    voices: ttsService.VOICES,
    backends: {
      llm: llmService.isEnabled() ? 'api' : 'builtin-template',
      image: imageService.isEnabled() ? 'api' : 'placeholder',
      tts: ttsService.isEnabled() ? 'api' : 'web-speech-fallback',
    },
  });
}

// 漫劇列表（公開）
async function listComics(req, res) {
  try {
    const { page = 1, limit = 10, category } = req.query;
    const where = { status: 1, auditStatus: 'approved' };
    if (category) where.category = { name: category };
    const [list, total] = await Promise.all([
      prisma.comicDrama.findMany({
        where,
        include: { category: true, _count: { select: { episodes: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.comicDrama.count({ where }),
    ]);
    success(res, {
      total,
      page: parseInt(page),
      list: list.map((c) => ({
        id: c.id,
        title: c.title,
        desc: c.desc,
        cover: c.cover,
        category: c.category?.name || 'AI 漫劇',
        artStyle: c.artStyle,
        episodes: c._count.episodes,
        views: c.views.toString(),
        rating: parseFloat(c.rating),
        createdAt: c.createdAt,
      })),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取漫劇列表失敗');
  }
}

// 漫劇詳情（公開，含劇集）
async function getComic(req, res) {
  try {
    const comic = await prisma.comicDrama.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        episodes: {
          orderBy: { episodeNumber: 'asc' },
          select: { id: true, episodeNumber: true, title: true, duration: true, status: true },
        },
      },
    });
    if (!comic) return error(res, 404, '漫劇不存在');
    // 播放量 +1（異步，不阻塞）
    prisma.comicDrama.update({ where: { id: comic.id }, data: { views: { increment: 1 } } }).catch(() => {});
    success(res, {
      id: comic.id,
      title: comic.title,
      desc: comic.desc,
      cover: comic.cover,
      category: comic.category?.name || 'AI 漫劇',
      artStyle: comic.artStyle,
      theme: comic.theme,
      views: (comic.views + 1n).toString(),
      rating: parseFloat(comic.rating),
      episodes: comic.episodes,
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取漫劇詳情失敗');
  }
}

// 劇集分鏡數據（播放器用，公開）
async function getEpisodePanels(req, res) {
  try {
    const episode = await prisma.comicEpisode.findFirst({
      where: { comicId: req.params.id, episodeNumber: parseInt(req.params.n) },
      include: { panels: { orderBy: { panelNumber: 'asc' } } },
    });
    if (!episode) return error(res, 404, '劇集不存在');
    success(res, {
      episodeId: episode.id,
      episodeNumber: episode.episodeNumber,
      title: episode.title,
      duration: episode.duration,
      panels: episode.panels.map((p) => ({
        n: p.panelNumber,
        image: p.imageUrl,
        shot: p.shotType,
        transition: p.transition,
        dialogue: p.dialogue,
        speaker: p.speaker,
        voice: p.voiceUrl,
        duration: p.duration,
      })),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取分鏡失敗');
  }
}

module.exports = {
  createTask,
  getTaskStatus,
  getMyTasks,
  getCapabilities,
  listComics,
  getComic,
  getEpisodePanels,
  createTaskSchema,
};
