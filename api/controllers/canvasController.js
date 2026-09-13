// ===== v6.0 智能畫布編輯控制器（參考即夢）=====
// 分鏡編輯：台詞修改、AI 重繪、換畫風、運鏡/轉場控制

const { z } = require('zod');

const prisma = require('../utils/prisma');
const imageService = require('../services/ai/imageService');
const { success, error } = require('../utils/response');

const editPanelSchema = z.object({
  dialogue: z.string().max(200).optional(),
  speaker: z.string().max(20).optional(),
  shotType: z.enum(['close', 'medium', 'full', 'wide']).optional(),
  transition: z.enum(['fade', 'slide', 'zoom', 'none']).optional(),
  duration: z.number().int().min(1).max(15).optional(),
});

const redrawSchema = z.object({
  prompt: z.string().max(500).optional(),
  style: z.enum(['anime', 'ink', 'realistic', 'chibi']).optional(),
});

// 校驗作品所有權
async function ownComic(userId, comicId) {
  const comic = await prisma.comicDrama.findUnique({ where: { id: comicId }, include: { creator: true } });
  if (!comic) return { ok: false, msg: '作品不存在' };
  if (comic.creator && comic.creator.userId !== userId) return { ok: false, msg: '無權編輯此作品' };
  return { ok: true, comic };
}

// v6.0 深化：修改前把當前狀態壓入撤銷堆疊（最多保留 10 步）
function pushHistory(panel) {
  const stack = Array.isArray(panel.history) ? panel.history.slice(-9) : [];
  stack.push({
    imageUrl: panel.imageUrl, imagePrompt: panel.imagePrompt,
    dialogue: panel.dialogue, speaker: panel.speaker,
    shotType: panel.shotType, transition: panel.transition, duration: panel.duration,
    at: new Date().toISOString(),
  });
  return stack;
}

// 編輯分鏡屬性（台詞/鏡頭/轉場/時長）
async function editPanel(req, res) {
  try {
    const panel = await prisma.comicPanel.findUnique({
      where: { id: req.params.panelId },
      include: { episode: true },
    });
    if (!panel) return error(res, 404, '分鏡不存在');
    const own = await ownComic(req.user.userId, panel.episode.comicId);
    if (!own.ok) return error(res, 403, own.msg);

    const data = req.validated || req.body;
    const updated = await prisma.comicPanel.update({
      where: { id: panel.id },
      data: {
        dialogue: data.dialogue,
        speaker: data.speaker,
        shotType: data.shotType,
        transition: data.transition,
        duration: data.duration,
        history: pushHistory(panel),
      },
    });
    success(res, updated, '分鏡已更新');
  } catch (e) {
    console.error(e);
    error(res, 500, '更新分鏡失敗');
  }
}

// AI 重繪分鏡（可改提示詞）
async function redrawPanel(req, res) {
  try {
    const panel = await prisma.comicPanel.findUnique({
      where: { id: req.params.panelId },
      include: { episode: { include: { comic: true } } },
    });
    if (!panel) return error(res, 404, '分鏡不存在');
    const own = await ownComic(req.user.userId, panel.episode.comicId);
    if (!own.ok) return error(res, 403, own.msg);

    const { prompt, style } = req.validated || req.body;
    const comic = panel.episode.comic;
    const chars = await prisma.character.findMany({ where: { comicId: comic.id } });
    const img = await imageService.generatePanelImage({
      scene: prompt || panel.imagePrompt || panel.dialogue || 'dramatic scene',
      artStyle: style || comic.artStyle,
      characters: chars.map(c => c.name),
      seedText: `redraw-${panel.id}-${Date.now()}`,
    });
    const updated = await prisma.comicPanel.update({
      where: { id: panel.id },
      data: { imageUrl: img.imageUrl, imagePrompt: img.imagePrompt, history: pushHistory(panel) },
    });
    success(res, updated, img.mock ? '已生成占位圖（未配置繪圖 API）' : '重繪完成');
  } catch (e) {
    console.error(e);
    error(res, 500, '重繪失敗');
  }
}

// ===== v6.0 深化：批次重繪 + 單格撤銷 =====
const batchRedrawSchema = z.object({
  panelIds: z.array(z.string().uuid()).min(1).max(20),
  prompt: z.string().max(500).optional(),
  style: z.enum(['anime', 'ink', 'realistic', 'chibi']).optional(),
});

// 批次重繪：一次重繪多格分鏡
async function batchRedraw(req, res) {
  try {
    const { panelIds, prompt, style } = req.validated || req.body;
    const panels = await prisma.comicPanel.findMany({
      where: { id: { in: panelIds } },
      include: { episode: { include: { comic: true } } },
    });
    if (!panels.length) return error(res, 404, '分鏡不存在');
    const comicId = panels[0].episode.comicId;
    if (panels.some(p => p.episode.comicId !== comicId)) return error(res, 400, '只能批次重繪同一部作品');
    const own = await ownComic(req.user.userId, comicId);
    if (!own.ok) return error(res, 403, own.msg);

    const chars = await prisma.character.findMany({ where: { comicId } });
    const results = [];
    for (const p of panels) {
      const img = await imageService.generatePanelImage({
        scene: prompt || p.imagePrompt || p.dialogue || 'dramatic scene',
        artStyle: style || p.episode.comic.artStyle,
        characters: chars.map(c => c.name),
        seedText: `redraw-${p.id}-${Date.now()}`,
      });
      const updated = await prisma.comicPanel.update({
        where: { id: p.id },
        data: { imageUrl: img.imageUrl, imagePrompt: img.imagePrompt, history: pushHistory(p) },
      });
      results.push({ id: updated.id, imageUrl: updated.imageUrl });
    }
    success(res, { redrawn: results.length, panels: results }, `已批次重繪 ${results.length} 格`);
  } catch (e) {
    console.error(e);
    error(res, 500, '批次重繪失敗');
  }
}

// 單格撤銷：回退到上一狀態
async function undoPanel(req, res) {
  try {
    const panel = await prisma.comicPanel.findUnique({
      where: { id: req.params.panelId },
      include: { episode: true },
    });
    if (!panel) return error(res, 404, '分鏡不存在');
    const own = await ownComic(req.user.userId, panel.episode.comicId);
    if (!own.ok) return error(res, 403, own.msg);

    const stack = Array.isArray(panel.history) ? [...panel.history] : [];
    if (!stack.length) return error(res, 400, '沒有可撤銷的修改');
    const prev = stack.pop();
    const updated = await prisma.comicPanel.update({
      where: { id: panel.id },
      data: {
        imageUrl: prev.imageUrl, imagePrompt: prev.imagePrompt,
        dialogue: prev.dialogue, speaker: prev.speaker,
        shotType: prev.shotType, transition: prev.transition, duration: prev.duration,
        history: stack,
      },
    });
    success(res, { panel: updated, remaining: stack.length }, '已撤銷上一步修改');
  } catch (e) {
    console.error(e);
    error(res, 500, '撤銷失敗');
  }
}

// 整部作品換畫風
async function restyleComic(req, res) {
  try {
    const { style } = req.validated || req.body;
    const comic = await prisma.comicDrama.findUnique({ where: { id: req.params.comicId } });
    if (!comic) return error(res, 404, '作品不存在');
    const own = await ownComic(req.user.userId, comic.id);
    if (!own.ok) return error(res, 403, own.msg);

    await prisma.comicDrama.update({ where: { id: comic.id }, data: { artStyle: style } });
    const panels = await prisma.comicPanel.findMany({
      where: { episode: { comicId: comic.id } },
      include: { episode: true },
    });
    // 逐格按新畫風重繪（降級時為新種子占位圖）
    let done = 0;
    for (const p of panels) {
      const img = await imageService.generatePanelImage({
        scene: p.imagePrompt || p.dialogue || 'dramatic scene',
        artStyle: style,
        seedText: `restyle-${p.id}-${style}`,
      });
      await prisma.comicPanel.update({
        where: { id: p.id },
        data: { imageUrl: img.imageUrl },
      });
      done++;
    }
    success(res, { restyled: done, style }, `已按新畫風重繪 ${done} 格分鏡`);
  } catch (e) {
    console.error(e);
    error(res, 500, '換畫風失敗');
  }
}

// 獲取畫布編輯數據（整部作品的分鏡全量）
async function getCanvasData(req, res) {
  try {
    const comic = await prisma.comicDrama.findUnique({
      where: { id: req.params.comicId },
      include: {
        characters: true,
        episodes: {
          orderBy: { episodeNumber: 'asc' },
          include: { panels: { orderBy: { panelNumber: 'asc' } } },
        },
      },
    });
    if (!comic) return error(res, 404, '作品不存在');
    success(res, comic);
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取畫布數據失敗');
  }
}

module.exports = {
  editPanel,
  redrawPanel,
  restyleComic,
  getCanvasData,
  batchRedraw,
  undoPanel,
  editPanelSchema,
  redrawSchema,
  batchRedrawSchema,
};
