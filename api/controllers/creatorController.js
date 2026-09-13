const { z } = require('zod');
const creatorService = require('../services/creatorService');
const { success, error } = require('../utils/response');

const registerSchema = z.object({
  realName: z.string().min(2).max(50),
  idCard: z.string().min(6).max(20).optional(),
  bio: z.string().max(500).optional(),
});

const createDramaSchema = z.object({
  title: z.string().min(1).max(100),
  desc: z.string().max(2000).optional(),
  cover: z.string().url().optional(),
  categoryId: z.string().uuid(),
  isFree: z.boolean().optional(),
  pricePerEp: z.number().min(0).optional(),
  episodes: z.array(z.object({
    title: z.string().optional(),
    videoUrl: z.string().url(),
    duration: z.number().optional(),
  })).optional(),
});

const updateDramaSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  desc: z.string().max(2000).optional(),
  cover: z.string().url().optional(),
  categoryId: z.string().uuid().optional(),
  isFree: z.boolean().optional(),
  pricePerEp: z.number().min(0).optional(),
});

const addEpisodeSchema = z.object({
  title: z.string().optional(),
  videoUrl: z.string().url(),
  duration: z.number().optional(),
});

async function register(req, res) {
  try {
    const data = await creatorService.registerCreator(req.user.userId, req.validated || req.body);
    success(res, data, '創作者註冊成功，等待審核');
  } catch (e) {
    error(res, 400, e.message);
  }
}

async function getProfile(req, res) {
  try {
    const data = await creatorService.getCreatorProfile(req.user.userId);
    if (!data) return error(res, 404, '尚未註冊創作者');
    success(res, data);
  } catch (e) {
    error(res, 500, e.message);
  }
}

async function updateProfile(req, res) {
  try {
    const data = await creatorService.updateCreator(req.user.userId, req.validated || req.body);
    success(res, data, '資料更新成功');
  } catch (e) {
    error(res, 400, e.message);
  }
}

async function getMyDramas(req, res) {
  try {
    const { page, limit } = req.query;
    const data = await creatorService.getCreatorDramas(req.user.userId, {
      page: parseInt(page) || 1,
      limit: parseInt(limit) || 10,
    });
    success(res, data);
  } catch (e) {
    error(res, 500, e.message);
  }
}

async function createDrama(req, res) {
  try {
    const data = await creatorService.createDrama(req.user.userId, req.validated || req.body);
    success(res, data, '短劇創建成功，等待審核');
  } catch (e) {
    error(res, 400, e.message);
  }
}

async function updateDrama(req, res) {
  try {
    const data = await creatorService.updateDrama(req.user.userId, req.params.id, req.validated || req.body);
    success(res, data, '短劇更新成功，重新進入審核');
  } catch (e) {
    error(res, 400, e.message);
  }
}

async function addEpisode(req, res) {
  try {
    const data = await creatorService.addEpisode(req.user.userId, req.params.id, req.validated || req.body);
    success(res, data, '劇集添加成功');
  } catch (e) {
    error(res, 400, e.message);
  }
}

async function deleteEpisode(req, res) {
  try {
    const data = await creatorService.deleteEpisode(req.user.userId, req.params.dramaId, req.params.episodeId);
    success(res, data);
  } catch (e) {
    error(res, 400, e.message);
  }
}

async function getDashboard(req, res) {
  try {
    const data = await creatorService.getDashboard(req.user.userId);
    success(res, data);
  } catch (e) {
    error(res, 500, e.message);
  }
}

async function getPublicProfile(req, res) {
  try {
    const data = await creatorService.getPublicCreator(req.params.id);
    if (!data) return error(res, 404, '創作者不存在');
    success(res, data);
  } catch (e) {
    error(res, 500, e.message);
  }
}

async function toggleFollow(req, res) {
  try {
    const data = await creatorService.toggleFollowCreator(req.user.userId, req.params.id);
    success(res, data);
  } catch (e) {
    error(res, 400, e.message);
  }
}

async function getAuditLogs(req, res) {
  try {
    const data = await creatorService.getAuditLogs(req.user.userId);
    success(res, data);
  } catch (e) {
    error(res, 500, e.message);
  }
}

module.exports = {
  register,
  getProfile,
  updateProfile,
  getMyDramas,
  createDrama,
  updateDrama,
  addEpisode,
  deleteEpisode,
  getDashboard,
  getPublicProfile,
  toggleFollow,
  getAuditLogs,
  registerSchema,
  createDramaSchema,
  updateDramaSchema,
  addEpisodeSchema,
};
