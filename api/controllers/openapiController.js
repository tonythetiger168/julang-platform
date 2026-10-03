// ===== v6.0 開放平台：AccessKey 管理 + OpenAPI 生成接口 =====
// 對齊 LibTV：把劇浪 AI 工作流（劇本/出圖/視頻/合成）開放給外部 Agent 調用
const crypto = require('crypto');
const { z } = require('zod');

const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');
const { hashKey, chargeApiKey } = require('../middleware/apiKeyAuth');
const providers = require('../services/ai/providers');
const imageService = require('../services/ai/imageService');
const videoService = require('../services/ai/videoService');
const llmService = require('../services/ai/llmService');

// ---------- AccessKey 管理（站內 JWT 登入後使用） ----------
const createKeySchema = z.object({ name: z.string().min(1).max(30).optional(), quota: z.number().int().min(100).max(100000).optional() });

async function createApiKey(req, res) {
  try {
    const { name, quota } = req.validated || req.body || {};
    const count = await prisma.apiKey.count({ where: { userId: req.user.id, revokedAt: null } });
    if (count >= 5) return error(res, 400, '每人最多 5 個有效 AccessKey');
    const plain = 'jl-' + crypto.randomBytes(24).toString('hex');
    const rec = await prisma.apiKey.create({
      data: {
        userId: req.user.id,
        name: name || '默認密鑰',
        prefix: plain.slice(0, 10),
        keyHash: hashKey(plain),
        quota: quota || 1000,
      },
    });
    // 明文只在創建時返回一次
    success(res, { id: rec.id, name: rec.name, prefix: rec.prefix, quota: rec.quota, apiKey: plain, createdAt: rec.createdAt },
      'AccessKey 已創建，請立即保存（明文僅顯示一次）');
  } catch (e) { console.error(e); error(res, 500, '創建失敗'); }
}

async function listApiKeys(req, res) {
  try {
    const list = await prisma.apiKey.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, prefix: true, quota: true, used: true, revokedAt: true, lastUsedAt: true, createdAt: true },
    });
    success(res, list);
  } catch (e) { console.error(e); error(res, 500, '查詢失敗'); }
}

async function revokeApiKey(req, res) {
  try {
    const rec = await prisma.apiKey.findUnique({ where: { id: req.params.id } });
    if (!rec || rec.userId !== req.user.id) return error(res, 404, '密鑰不存在');
    await prisma.apiKey.update({ where: { id: rec.id }, data: { revokedAt: new Date() } });
    success(res, { id: rec.id }, 'AccessKey 已吊銷');
  } catch (e) { console.error(e); error(res, 500, '操作失敗'); }
}

// ---------- OpenAPI（X-Api-Key 鑒權，按模型扣配額） ----------
const genScriptSchema = z.object({
  theme: z.string().min(2).max(200),
  model: z.string().max(50).optional(),
  episodeCount: z.number().int().min(1).max(50).optional(),
  panelsPerEpisode: z.number().int().min(1).max(20).optional(),
  genre: z.string().max(30).optional(),
});

async function openapiScript(req, res) {
  try {
    const { theme, model = 'kimi-k3', episodeCount, panelsPerEpisode, genre } = req.validated || req.body;
    const script = await llmService.generateScript({ theme, episodeCount, panelsPerEpisode, genre });
    await chargeApiKey(req.apiKey.id, providers.modelCost(model));
    success(res, { model, script });
  } catch (e) {
    console.error('[OpenAPI] script error:', e);
    error(res, 500, '劇本生成失敗：' + e.message);
  }
}

const genImageSchema = z.object({
  prompt: z.string().min(2).max(500),
  model: z.string().max(50).optional(),
  style: z.enum(['anime', 'ink', 'realistic', 'chibi']).optional(),
});

async function openapiImage(req, res) {
  try {
    const { prompt, model = 'seedream5', style } = req.validated || req.body;
    const img = await imageService.generatePanelImage({ scene: prompt, artStyle: style || 'anime', model, seedText: prompt });
    await chargeApiKey(req.apiKey.id, providers.modelCost(model));
    success(res, { model, imageUrl: img.imageUrl, mock: !!img.mock });
  } catch (e) {
    console.error('[OpenAPI] image error:', e);
    error(res, 500, '圖像生成失敗：' + e.message);
  }
}

const genVideoSchema = z.object({
  prompt: z.string().min(2).max(500),
  model: z.string().max(50).optional(),
  imageUrl: z.string().max(1000).optional(),
  duration: z.number().min(1).max(30).optional(),
});

async function openapiVideo(req, res) {
  try {
    const { prompt, model = 'seedance20-fast', imageUrl, duration } = req.validated || req.body;
    const v = await videoService.generateVideo({ model, prompt, imageUrl, duration });
    await chargeApiKey(req.apiKey.id, providers.modelCost(model));
    success(res, { model, videoUrl: v.videoUrl, mock: !!v.mock });
  } catch (e) {
    console.error('[OpenAPI] video error:', e);
    error(res, 500, '視頻生成失敗：' + e.message);
  }
}

async function openapiModels(_req, res) {
  try {
    const { MODEL_LIBRARY } = require('./toolsController');
    const withMeta = {};
    for (const [kind, models] of Object.entries(MODEL_LIBRARY)) {
      withMeta[kind] = models.map((m) => ({
        ...m, cost: providers.modelCost(m.id), enabled: providers.isModelEnabled(m.id),
      }));
    }
    success(res, withMeta);
  } catch (e) {
    console.error('[OpenAPI] models error:', e);
    error(res, 500, '獲取模型列表失敗：' + e.message);
  }
}

async function openapiUsage(req, res) {
  try {
    success(res, {
      prefix: req.apiKey.prefix, name: req.apiKey.name,
      quota: req.apiKey.quota, used: req.apiKey.used,
      remaining: req.apiKey.quota - req.apiKey.used,
      lastUsedAt: req.apiKey.lastUsedAt,
    });
  } catch (e) {
    console.error('[OpenAPI] usage error:', e);
    error(res, 500, '獲取用量失敗：' + e.message);
  }
}

module.exports = {
  createApiKey, listApiKeys, revokeApiKey, createKeySchema,
  openapiScript, openapiImage, openapiVideo, openapiModels, openapiUsage,
  genScriptSchema, genImageSchema, genVideoSchema,
};
