// ===== v6.0 靈感社區 + 聚合搜索控制器 =====
const { z } = require('zod');

const prisma = require('../utils/prisma');
const comicPipeline = require('../services/ai/comicPipeline');
const { success, error } = require('../utils/response');

// 社區作品流（公開）：hot = 點贊+復刻加權，new = 最新
async function listWorks(req, res) {
  try {
    const { page = 1, limit = 12, sort = 'hot', style } = req.query;
    const where = { status: 1, auditStatus: 'approved', isPublic: true };
    if (style) where.artStyle = style;
    const orderBy = sort === 'new'
      ? { createdAt: 'desc' }
      : [{ likes: 'desc' }, { remixCount: 'desc' }, { views: 'desc' }];
    const [list, total] = await Promise.all([
      prisma.comicDrama.findMany({
        where, orderBy,
        include: {
          category: true,
          characters: { select: { name: true, avatar: true, role: true } },
          _count: { select: { episodes: true } },
        },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.comicDrama.count({ where }),
    ]);
    success(res, {
      total, page: parseInt(page),
      list: list.map(c => ({
        id: c.id, title: c.title, desc: c.desc, cover: c.cover,
        category: c.category?.name || 'AI 漫劇', artStyle: c.artStyle,
        episodes: c._count.episodes, views: c.views.toString(),
        likes: c.likes, remixCount: c.remixCount, remixOfId: c.remixOfId,
        characters: c.characters, createdAt: c.createdAt,
      })),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取社區作品失敗');
  }
}

// 點贊/取消點贊
async function toggleLike(req, res) {
  try {
    const comicId = req.params.id;
    const existing = await prisma.comicLike.findUnique({
      where: { userId_comicId: { userId: req.user.userId, comicId } },
    });
    if (existing) {
      await prisma.comicLike.delete({ where: { id: existing.id } });
      await prisma.comicDrama.update({ where: { id: comicId }, data: { likes: { decrement: 1 } } });
      return success(res, { liked: false });
    }
    await prisma.comicLike.create({ data: { userId: req.user.userId, comicId } });
    await prisma.comicDrama.update({ where: { id: comicId }, data: { likes: { increment: 1 } } });
    success(res, { liked: true });
  } catch (e) {
    error(res, 500, '操作失敗');
  }
}

// 收藏/取消收藏（配合 PWA 離線）
async function toggleFavorite(req, res) {
  try {
    const comicId = req.params.id;
    const existing = await prisma.comicFavorite.findUnique({
      where: { userId_comicId: { userId: req.user.userId, comicId } },
    });
    if (existing) {
      await prisma.comicFavorite.delete({ where: { id: existing.id } });
      return success(res, { favorited: false });
    }
    await prisma.comicFavorite.create({ data: { userId: req.user.userId, comicId } });
    success(res, { favorited: true });
  } catch (e) {
    error(res, 500, '操作失敗');
  }
}

async function myFavorites(req, res) {
  try {
    const favs = await prisma.comicFavorite.findMany({
      where: { userId: req.user.userId },
      orderBy: { createdAt: 'desc' },
    });
    const comics = await prisma.comicDrama.findMany({
      where: { id: { in: favs.map(f => f.comicId) } },
      include: { _count: { select: { episodes: true } } },
    });
    success(res, comics.map(c => ({
      id: c.id, title: c.title, cover: c.cover, episodes: c._count.episodes, artStyle: c.artStyle,
    })));
  } catch (e) {
    error(res, 500, '獲取收藏失敗');
  }
}

// 一鍵復刻（做同款）：複用原作題材與畫風創建新生成任務
async function remix(req, res) {
  try {
    const src = await prisma.comicDrama.findUnique({
      where: { id: req.params.id },
      include: { characters: true },
    });
    if (!src) return error(res, 404, '原作不存在');
    const task = await comicPipeline.createComicTask(req.user.userId, {
      theme: `【復刻《${src.title}》】${src.theme || src.desc || ''}`,
      genre: undefined,
      style: src.artStyle,
      episodeCount: Math.max(1, src.totalEpisodes),
      panelsPerEpisode: 6,
      voiceId: src.voiceId || '',
      withVoice: true,
      remixOfId: src.id,
      isPublic: true,
    });
    success(res, { taskId: task.id, remixOf: src.title }, '復刻任務已創建，AI 正在生成同款新作');
  } catch (e) {
    console.error(e);
    error(res, 500, '復刻失敗');
  }
}

// 聚合搜索（參考 LibreTV）：一次搜索短劇 + 漫劇 + 創作者
async function searchAll(req, res) {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return success(res, { dramas: [], comics: [], creators: [] });
    const [dramas, comics, creators] = await Promise.all([
      prisma.drama.findMany({
        where: { status: 1, auditStatus: 'approved', OR: [{ title: { contains: q } }, { desc: { contains: q } }] },
        include: { category: true, _count: { select: { episodes: true } } },
        take: 10,
      }),
      prisma.comicDrama.findMany({
        where: { status: 1, isPublic: true, OR: [{ title: { contains: q } }, { desc: { contains: q } }, { theme: { contains: q } }] },
        include: { _count: { select: { episodes: true } } },
        take: 10,
      }),
      prisma.creator.findMany({
        where: { status: 1, OR: [{ realName: { contains: q } }, { bio: { contains: q } }] },
        include: { user: { select: { nickname: true } } },
        take: 5,
      }),
    ]);
    success(res, {
      dramas: dramas.map(d => ({ id: d.id, title: d.title, cover: d.cover, category: d.category?.name, episodes: d._count.episodes, views: d.views.toString(), type: 'drama' })),
      comics: comics.map(c => ({ id: c.id, title: c.title, cover: c.cover, episodes: c._count.episodes, views: c.views.toString(), type: 'comic' })),
      creators: creators.map(c => ({ id: c.id, name: c.user.nickname, avatar: c.avatar, bio: c.bio, type: 'creator' })),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '聚合搜索失敗');
  }
}

// ===== v6.0 深化：作品詳情 + 評論系統 =====
const commentSchema = z.object({
  content: z.string().min(1).max(500),
});

// 作品詳情（公開）：含角色卡、首集分鏡預覽、評論數
async function getWorkDetail(req, res) {
  try {
    const comic = await prisma.comicDrama.findUnique({
      where: { id: req.params.id },
      include: {
        category: true,
        characters: true,
        creator: { include: { user: { select: { nickname: true, avatar: true } } } },
        episodes: {
          orderBy: { episodeNumber: 'asc' },
          include: { panels: { orderBy: { panelNumber: 'asc' } } },
        },
        _count: { select: { comicComments: true } },
      },
    });
    if (!comic || !comic.isPublic || comic.status !== 1) return error(res, 404, '作品不存在或未公開');
    // 順帶累計瀏覽
    prisma.comicDrama.update({ where: { id: comic.id }, data: { views: { increment: 1 } } }).catch(() => {});
    success(res, {
      id: comic.id, title: comic.title, desc: comic.desc, cover: comic.cover,
      category: comic.category?.name || 'AI 漫劇', artStyle: comic.artStyle,
      views: comic.views.toString(), likes: comic.likes, remixCount: comic.remixCount,
      remixOfId: comic.remixOfId, commentCount: comic._count.comicComments,
      creatorName: comic.creator?.user?.nickname || 'AI 創作者',
      // 創作過程（LibTV 風格公開工作流）：由作品數據合成時間線
      workflow: [
        { icon: '📝', step: '創意文本', detail: (comic.desc || '一句話創意').slice(0, 60) },
        { icon: '🎬', step: '劇本與分鏡腳本表', detail: `共 ${comic.episodes.length} 集 · ${comic.episodes.reduce((s, e) => s + e.panels.length, 0)} 格分鏡` },
        ...(comic.characters.length ? [{ icon: '🖼️', step: '角色設定', detail: comic.characters.map(c => c.name).join('、') + ' · 一致性鎖定' }] : []),
        { icon: '🎵', step: '配音合成', detail: comic.episodes.some(e => e.panels.some(p => p.voiceUrl)) ? 'TTS 逐格配音' : 'Web Speech 即時朗讀' },
        { icon: '🎞', step: '合成發布', detail: `畫風 ${comic.artStyle || 'anime'} · 發布於 ${new Date(comic.createdAt).toLocaleDateString('zh-TW')}` },
      ],
      characters: comic.characters.map(c => ({ id: c.id, name: c.name, role: c.role, avatar: c.avatar, persona: c.persona })),
      episodes: comic.episodes.map(ep => ({
        episodeNumber: ep.episodeNumber, title: ep.title,
        panels: ep.panels.map(p => ({ id: p.id, panelNumber: p.panelNumber, imageUrl: p.imageUrl, dialogue: p.dialogue, speaker: p.speaker, shotType: p.shotType, transition: p.transition, duration: p.duration })),
      })),
      createdAt: comic.createdAt,
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取作品詳情失敗');
  }
}

// 評論列表（公開，最新在前）
async function listComments(req, res) {
  try {
    const { page = 1, limit = 20 } = req.query;
    const [list, total] = await Promise.all([
      prisma.comicComment.findMany({
        where: { comicId: req.params.id },
        orderBy: { createdAt: 'desc' },
        include: { user: { select: { nickname: true, avatar: true } } },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.comicComment.count({ where: { comicId: req.params.id } }),
    ]);
    success(res, {
      total, page: parseInt(page),
      list: list.map(c => ({
        id: c.id, content: c.content, createdAt: c.createdAt,
        nickname: c.user.nickname, avatar: c.user.avatar,
        mine: req.user ? c.userId === req.user.userId : false,
      })),
    });
  } catch (e) {
    error(res, 500, '獲取評論失敗');
  }
}

// 發表評論（需登入）
async function addComment(req, res) {
  try {
    const { content } = req.validated || req.body;
    const comic = await prisma.comicDrama.findUnique({ where: { id: req.params.id } });
    if (!comic || !comic.isPublic) return error(res, 404, '作品不存在或未公開');
    const c = await prisma.comicComment.create({
      data: { comicId: comic.id, userId: req.user.userId, content },
      include: { user: { select: { nickname: true, avatar: true } } },
    });
    success(res, {
      id: c.id, content: c.content, createdAt: c.createdAt,
      nickname: c.user.nickname, avatar: c.user.avatar, mine: true,
    }, '評論已發表');
  } catch (e) {
    error(res, 500, '發表評論失敗');
  }
}

// 刪除自己的評論
async function deleteComment(req, res) {
  try {
    const c = await prisma.comicComment.findUnique({ where: { id: req.params.commentId } });
    if (!c) return error(res, 404, '評論不存在');
    if (c.userId !== req.user.userId) return error(res, 403, '只能刪除自己的評論');
    await prisma.comicComment.delete({ where: { id: c.id } });
    success(res, { deleted: true }, '評論已刪除');
  } catch (e) {
    error(res, 500, '刪除評論失敗');
  }
}

module.exports = {
  listWorks, toggleLike, toggleFavorite, myFavorites, remix, searchAll,
  getWorkDetail, listComments, addComment, deleteComment, commentSchema,
};
