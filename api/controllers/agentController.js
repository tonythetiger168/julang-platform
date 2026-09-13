// ===== v6.0 短劇 Agent 控制器（參考小雲雀）=====
const { z } = require('zod');

const prisma = require('../utils/prisma');
const agentService = require('../services/ai/agentService');
const comicPipeline = require('../services/ai/comicPipeline');
const { success, error } = require('../utils/response');

const blueprintSchema = z.object({
  scriptText: z.string().min(10).max(20000),
  genre: z.string().max(20).optional(),
  style: z.enum(['anime', 'ink', 'realistic', 'chibi']).optional(),
});

const characterSchema = z.object({
  characters: z.array(z.object({
    name: z.string().min(1).max(20),
    role: z.string().max(10).optional(),
    persona: z.string().max(200).optional(),
    gender: z.enum(['male', 'female']).optional(),
    voiceId: z.string().max(30).optional(),
  })).min(1).max(6),
  style: z.enum(['anime', 'ink', 'realistic', 'chibi']).optional(),
});

const produceSchema = z.object({
  blueprint: z.object({
    title: z.string(),
    logline: z.string().optional(),
    characters: z.array(z.any()),
    acts: z.array(z.any()),
  }),
  characterCards: z.array(z.any()).optional(),
  style: z.enum(['anime', 'ink', 'realistic', 'chibi']).optional(),
  genre: z.string().max(20).optional(),
  panelsPerEpisode: z.number().int().min(3).max(12).optional(),
  voiceId: z.string().max(30).optional(),
  withVoice: z.boolean().optional(),
  isPublic: z.boolean().optional(),
  categoryId: z.string().uuid().optional(),
});

// 步驟一：劇本 → 故事藍圖
async function createBlueprint(req, res) {
  try {
    const input = req.validated || req.body;
    const blueprint = await agentService.parseBlueprint(input);
    success(res, blueprint, '藍圖解析完成');
  } catch (e) {
    console.error(e);
    error(res, 500, '藍圖解析失敗');
  }
}

// 步驟二：藍圖角色 → 角色卡（AI 頭像 + 外觀提示詞）
async function createCharacterCards(req, res) {
  try {
    const { characters, style } = req.validated || req.body;
    const cards = await agentService.buildCharacterCards(characters, style || 'anime');
    success(res, cards, '角色卡生成完成');
  } catch (e) {
    console.error(e);
    error(res, 500, '角色卡生成失敗');
  }
}

// 步驟五：一鍵成片（藍圖 + 角色卡 → 生成任務）
async function produce(req, res) {
  try {
    const input = req.validated || req.body;
    const script = agentService.blueprintToScript(input.blueprint, {
      panelsPerEpisode: input.panelsPerEpisode || 6,
    });
    const task = await comicPipeline.createComicTask(req.user.userId, {
      theme: input.blueprint.logline || input.blueprint.title,
      style: input.style,
      genre: input.genre,
      voiceId: input.voiceId,
      withVoice: input.withVoice,
      categoryId: input.categoryId,
      script,
      characterCards: input.characterCards,
      isPublic: input.isPublic ?? true,
    });
    success(res, { taskId: task.id, status: task.status }, '成片任務已創建');
  } catch (e) {
    console.error(e);
    error(res, 500, '創建成片任務失敗');
  }
}

// 獲取作品的角色卡
async function getCharacters(req, res) {
  try {
    const chars = await prisma.character.findMany({ where: { comicId: req.params.comicId } });
    success(res, chars);
  } catch (e) {
    error(res, 500, '獲取角色卡失敗');
  }
}

// ===== v6.0 深化：多輪改稿 / 角色卡編輯 =====
const reviseSchema = z.object({
  blueprint: z.object({
    title: z.string(),
    logline: z.string().optional(),
    characters: z.array(z.any()),
    acts: z.array(z.any()),
  }).passthrough(),
  feedback: z.string().min(2).max(500),
});

const updateCharacterSchema = z.object({
  role: z.string().max(10).optional(),
  persona: z.string().max(200).optional(),
  appearancePrompt: z.string().max(1000).optional(),
  voiceId: z.string().max(30).nullable().optional(),
});

// 多輪改稿：藍圖 + 修改意見 → 修訂版藍圖
async function reviseBlueprint(req, res) {
  try {
    const { blueprint, feedback } = req.validated || req.body;
    const revised = await agentService.reviseBlueprint(blueprint, feedback);
    success(res, revised, `改稿完成（第 ${revised._revision || 1} 版）`);
  } catch (e) {
    console.error(e);
    error(res, 500, '改稿失敗');
  }
}

// 校驗作品所有權（與 canvasController 相同規則）
async function ownComic(userId, comicId) {
  const comic = await prisma.comicDrama.findUnique({ where: { id: comicId }, include: { creator: true } });
  if (!comic) return { ok: false, msg: '作品不存在' };
  if (comic.creator && comic.creator.userId !== userId) return { ok: false, msg: '無權編輯此作品' };
  return { ok: true, comic };
}

// 編輯角色卡（人設/外觀提示詞/音色）
async function updateCharacter(req, res) {
  try {
    const own = await ownComic(req.user.userId, req.params.comicId);
    if (!own.ok) return error(res, own.msg === '作品不存在' ? 404 : 403, own.msg);
    const char = await prisma.character.findUnique({ where: { id: req.params.charId } });
    if (!char || char.comicId !== req.params.comicId) return error(res, 404, '角色不存在');
    const data = req.validated || req.body;
    const updated = await prisma.character.update({ where: { id: char.id }, data });
    success(res, updated, '角色卡已更新');
  } catch (e) {
    console.error(e);
    error(res, 500, '更新角色卡失敗');
  }
}

// 重生成角色頭像（按當前外觀提示詞 + 畫風）
async function regenerateAvatar(req, res) {
  try {
    const own = await ownComic(req.user.userId, req.params.comicId);
    if (!own.ok) return error(res, own.msg === '作品不存在' ? 404 : 403, own.msg);
    const char = await prisma.character.findUnique({ where: { id: req.params.charId } });
    if (!char || char.comicId !== req.params.comicId) return error(res, 404, '角色不存在');
    const card = await agentService.regenerateCharacterAvatar({
      name: char.name, persona: char.persona,
      gender: /沉|琛|少|爺|王|帝|總裁/.test(char.name) ? 'male' : 'female',
    }, own.comic.artStyle);
    const updated = await prisma.character.update({
      where: { id: char.id },
      data: { avatar: card.avatar, appearancePrompt: card.appearancePrompt },
    });
    success(res, updated, '頭像已重生成');
  } catch (e) {
    console.error(e);
    error(res, 500, '頭像重生成失敗');
  }
}

module.exports = {
  createBlueprint,
  createCharacterCards,
  produce,
  getCharacters,
  reviseBlueprint,
  updateCharacter,
  regenerateAvatar,
  blueprintSchema,
  characterSchema,
  produceSchema,
  reviseSchema,
  updateCharacterSchema,
};
