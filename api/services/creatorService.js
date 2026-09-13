
const prisma = require('../../utils/prisma');
const redis = require('../config/redis');
const CACHE_TTL = 300;

async function registerCreator(userId, { realName, idCard, bio }) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('用戶不存在');
  if (user.isCreator) throw new Error('已是創作者');

  const creator = await prisma.creator.create({
    data: {
      userId,
      realName,
      idCard: idCard || null,
      bio: bio || '',
      avatar: user.avatar,
      status: 0,
    },
  });

  await prisma.creatorStats.create({
    data: { creatorId: creator.id },
  });

  await prisma.user.update({
    where: { id: userId },
    data: { isCreator: true },
  });

  return creator;
}

async function getCreatorProfile(userId) {
  const cacheKey = `creator:profile:${userId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const creator = await prisma.creator.findUnique({
    where: { userId },
    include: {
      user: { select: { nickname: true, phone: true } },
      stats: true,
      _count: { select: { dramas: true } },
    },
  });

  if (!creator) return null;

  const result = {
    id: creator.id,
    userId: creator.userId,
    nickname: creator.user.nickname,
    realName: creator.realName,
    bio: creator.bio,
    avatar: creator.avatar,
    verified: creator.verified,
    status: creator.status,
    totalDramas: creator._count.dramas,
    stats: creator.stats,
    createdAt: creator.createdAt,
  };

  await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
  return result;
}

async function updateCreator(userId, data) {
  const creator = await prisma.creator.findUnique({ where: { userId } });
  if (!creator) throw new Error('創作者不存在');

  const updated = await prisma.creator.update({
    where: { userId },
    data: {
      realName: data.realName,
      bio: data.bio,
      avatar: data.avatar,
    },
  });

  await redis.del(`creator:profile:${userId}`);
  return updated;
}

async function getCreatorDramas(userId, { page = 1, limit = 10 }) {
  const creator = await prisma.creator.findUnique({ where: { userId } });
  if (!creator) throw new Error('創作者不存在');

  const [dramas, total] = await Promise.all([
    prisma.drama.findMany({
      where: { creatorId: creator.id },
      include: {
        category: true,
        _count: { select: { episodes: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.drama.count({ where: { creatorId: creator.id } }),
  ]);

  return {
    total,
    page,
    limit,
    list: dramas.map(d => ({
      id: d.id,
      title: d.title,
      desc: d.desc,
      cover: d.cover,
      category: d.category?.name,
      totalEpisodes: d.totalEpisodes,
      auditStatus: d.auditStatus,
      rejectReason: d.rejectReason,
      isFree: d.isFree,
      pricePerEp: d.pricePerEp,
      views: d.views.toString(),
      likes: d.likes,
      rating: parseFloat(d.rating),
      episodeCount: d._count.episodes,
      createdAt: d.createdAt,
    })),
  };
}

async function createDrama(userId, data) {
  const creator = await prisma.creator.findUnique({ where: { userId } });
  if (!creator) throw new Error('創作者不存在');
  if (creator.status !== 1) throw new Error('創作者帳號未啟用');

  const drama = await prisma.drama.create({
    data: {
      title: data.title,
      desc: data.desc,
      cover: data.cover,
      categoryId: data.categoryId,
      creatorId: creator.id,
      totalEpisodes: data.episodes?.length || 0,
      isFree: data.isFree ?? true,
      pricePerEp: data.pricePerEp || 0,
      auditStatus: 'pending',
      status: 1,
    },
  });

  if (data.episodes?.length) {
    await prisma.episode.createMany({
      data: data.episodes.map((ep, i) => ({
        dramaId: drama.id,
        episodeNumber: i + 1,
        title: ep.title || `第${i + 1}集`,
        videoUrl: ep.videoUrl,
        duration: ep.duration || 0,
      })),
    });
  }

  await prisma.creatorStats.update({
    where: { creatorId: creator.id },
    data: { totalDramas: { increment: 1 } },
  });

  await redis.del(`creator:profile:${userId}`);
  await redis.del(`creator:dramas:${userId}`);

  return drama;
}

async function updateDrama(userId, dramaId, data) {
  const creator = await prisma.creator.findUnique({ where: { userId } });
  if (!creator) throw new Error('創作者不存在');

  const drama = await prisma.drama.findFirst({
    where: { id: dramaId, creatorId: creator.id },
  });
  if (!drama) throw new Error('短劇不存在或無權限');

  const updated = await prisma.drama.update({
    where: { id: dramaId },
    data: {
      title: data.title,
      desc: data.desc,
      cover: data.cover,
      categoryId: data.categoryId,
      isFree: data.isFree,
      pricePerEp: data.pricePerEp,
      auditStatus: 'pending',
    },
  });

  return updated;
}

async function addEpisode(userId, dramaId, episode) {
  const creator = await prisma.creator.findUnique({ where: { userId } });
  if (!creator) throw new Error('創作者不存在');

  const drama = await prisma.drama.findFirst({
    where: { id: dramaId, creatorId: creator.id },
  });
  if (!drama) throw new Error('短劇不存在或無權限');

  const maxEp = await prisma.episode.findFirst({
    where: { dramaId },
    orderBy: { episodeNumber: 'desc' },
  });

  const newEp = await prisma.episode.create({
    data: {
      dramaId,
      episodeNumber: (maxEp?.episodeNumber || 0) + 1,
      title: episode.title || `第${(maxEp?.episodeNumber || 0) + 1}集`,
      videoUrl: episode.videoUrl,
      duration: episode.duration || 0,
    },
  });

  await prisma.drama.update({
    where: { id: dramaId },
    data: { totalEpisodes: { increment: 1 }, auditStatus: 'pending' },
  });

  return newEp;
}

async function deleteEpisode(userId, dramaId, episodeId) {
  const creator = await prisma.creator.findUnique({ where: { userId } });
  if (!creator) throw new Error('創作者不存在');

  const drama = await prisma.drama.findFirst({
    where: { id: dramaId, creatorId: creator.id },
  });
  if (!drama) throw new Error('短劇不存在或無權限');

  await prisma.episode.delete({ where: { id: episodeId } });

  const count = await prisma.episode.count({ where: { dramaId } });
  await prisma.drama.update({
    where: { id: dramaId },
    data: { totalEpisodes: count },
  });

  return { success: true };
}

async function getDashboard(userId) {
  const creator = await prisma.creator.findUnique({
    where: { userId },
    include: {
      stats: true,
      _count: { select: { dramas: true, earnings: true } },
    },
  });
  if (!creator) throw new Error('創作者不存在');

  const recentDramas = await prisma.drama.findMany({
    where: { creatorId: creator.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: {
      id: true,
      title: true,
      cover: true,
      auditStatus: true,
      views: true,
      createdAt: true,
    },
  });

  const recentEarnings = await prisma.creatorEarning.findMany({
    where: { creatorId: creator.id },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const monthlyStats = await prisma.creatorEarning.groupBy({
    by: ['type'],
    where: { creatorId: creator.id },
    _sum: { amount: true },
  });

  return {
    profile: {
      id: creator.id,
      realName: creator.realName,
      avatar: creator.avatar,
      verified: creator.verified,
    },
    stats: creator.stats,
    totalDramas: creator._count.dramas,
    totalEarnings: creator._count.earnings,
    recentDramas: recentDramas.map(d => ({
      ...d,
      views: d.views.toString(),
    })),
    recentEarnings,
    earningBreakdown: monthlyStats.map(s => ({
      type: s.type,
      amount: s._sum.amount,
    })),
  };
}

async function getPublicCreator(creatorId) {
  const cacheKey = `creator:public:${creatorId}`;
  const cached = await redis.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const creator = await prisma.creator.findUnique({
    where: { id: creatorId },
    include: {
      user: { select: { nickname: true } },
      stats: true,
      _count: { select: { dramas: true, earnings: true } },
    },
  });

  if (!creator) return null;

  const dramas = await prisma.drama.findMany({
    where: { creatorId, auditStatus: 'approved', status: 1 },
    include: { category: true, _count: { select: { episodes: true } } },
    orderBy: { views: 'desc' },
    take: 6,
  });

  const result = {
    id: creator.id,
    nickname: creator.user.nickname,
    realName: creator.realName,
    bio: creator.bio,
    avatar: creator.avatar,
    verified: creator.verified,
    stats: creator.stats,
    totalDramas: creator._count.dramas,
    dramas: dramas.map(d => ({
      id: d.id,
      title: d.title,
      cover: d.cover,
      category: d.category?.name,
      views: d.views.toString(),
      rating: parseFloat(d.rating),
      episodes: d._count.episodes,
    })),
  };

  await redis.setEx(cacheKey, CACHE_TTL, JSON.stringify(result));
  return result;
}

async function toggleFollowCreator(userId, creatorId) {
  const existing = await prisma.creatorFollow.findUnique({
    where: { userId_creatorId: { userId, creatorId } },
  });

  if (existing) {
    await prisma.creatorFollow.delete({
      where: { userId_creatorId: { userId, creatorId } },
    });
    await prisma.creatorStats.update({
      where: { creatorId },
      data: { totalFollowers: { decrement: 1 } },
    });
    return { followed: false };
  }

  await prisma.creatorFollow.create({
    data: { userId, creatorId },
  });
  await prisma.creatorStats.update({
    where: { creatorId },
    data: { totalFollowers: { increment: 1 } },
  });

  await redis.del(`creator:public:${creatorId}`);
  return { followed: true };
}

async function getAuditLogs(userId) {
  const creator = await prisma.creator.findUnique({ where: { userId } });
  if (!creator) throw new Error('創作者不存在');

  return prisma.auditLog.findMany({
    where: { creatorId: creator.id },
    include: { drama: { select: { title: true, cover: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}

module.exports = {
  registerCreator,
  getCreatorProfile,
  updateCreator,
  getCreatorDramas,
  createDrama,
  updateDrama,
  addEpisode,
  deleteEpisode,
  getDashboard,
  getPublicCreator,
  toggleFollowCreator,
  getAuditLogs,
};
