// ===== v7.2 單元測試：communityController（靈感社區）=====
// communityController 在原 repo 不存在，API 因此起不來（routes/community.js 與
// routes/index.js 都在 require 它）。
//
// 這裡用 mocked Prisma 驗「邏輯」：回應形狀（前端 community.js / pwa.js / v61.js
// 已定的 demo 契約）、BigInt/Decimal 轉型、權限（404/403）、toggle 的兩個方向、
// 以及 commentSchema 真的是 zod schema（否則 validate() 在路由定義時就丟 TypeError）。
// **不驗證 SQL 正確性**（那需要真的資料庫），這是刻意的取捨。
jest.mock('../api/utils/prisma', () => ({
  comicDrama: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
  comicComment: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  comicLike: { findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  comicFavorite: { findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(), delete: jest.fn() },
  drama: { findMany: jest.fn() },
  creator: { findUnique: jest.fn(), findMany: jest.fn() },
}));

const prisma = require('../api/utils/prisma');
const communityCtrl = require('../api/controllers/communityController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const req = (extra = {}) => Object.assign({ query: {}, params: {}, body: {}, user: { userId: 'u1' } }, extra);

// 一列漫劇（BigInt views + Decimal rating：兩個都必須在出口被轉成 number）
const COMIC_ROW = {
  id: 'c1', title: '逆襲：命運重啟', desc: 'AI 演示漫劇', cover: 'cover.jpg',
  categoryId: 'cat1', category: { id: 'cat1', name: '逆襲' },
  creatorId: 'cr1', creator: { id: 'cr1', realName: '星辰劇場', avatar: 'a.jpg' },
  artStyle: 'anime', theme: '豪門逆襲復仇', totalEpisodes: 2,
  views: 1250000n, likes: 12800, rating: { toNumber: () => 9.4 },
  remixOfId: null, remixCount: 326, isPublic: true,
  createdAt: new Date('2026-08-20T10:00:00Z'), publishedAt: new Date('2026-08-20T10:00:00Z'),
};

const COMMENT_ROW = {
  id: 'cm1', content: '林晚的眼神戲太絕了', userId: 'u1',
  createdAt: new Date('2026-08-21T14:20:00Z'),
  user: { id: 'u1', nickname: '劇迷小風', avatar: 'https://x/a.svg' },
};

beforeEach(() => { jest.clearAllMocks(); });

// ---------------------------------------------------------------------------
describe('communityController — 匯出契約與 zod schema', () => {
  test('路由需要的方法全部存在', () => {
    ['listWorks', 'getWorkDetail', 'searchAll', 'addComment', 'listComments',
      'deleteComment', 'toggleLike', 'toggleFavorite', 'myFavorites', 'remix',
    ].forEach((m) => expect(typeof communityCtrl[m]).toBe('function'));
  });

  test('commentSchema 是真正的 zod schema（否則 server 起不來）', () => {
    expect(typeof communityCtrl.commentSchema.safeParse).toBe('function');
    const ok = communityCtrl.commentSchema.safeParse({ content: '  好看  ' });
    expect(ok.success).toBe(true);
    expect(ok.data.content).toBe('好看'); // trim

    expect(communityCtrl.commentSchema.safeParse({ content: '好看' }).success).toBe(true);
    expect(communityCtrl.commentSchema.safeParse({}).success).toBe(false);
    expect(communityCtrl.commentSchema.safeParse({ content: '' }).success).toBe(false);
    expect(communityCtrl.commentSchema.safeParse({ content: '   ' }).success).toBe(false);
    expect(communityCtrl.commentSchema.safeParse({ content: 'a'.repeat(501) }).success).toBe(false);
    expect(communityCtrl.commentSchema.safeParse({ content: 123 }).success).toBe(false);
    expect(communityCtrl.commentSchema.safeParse({ content: 'a'.repeat(500) }).success).toBe(true);
  });

  test('validate(commentSchema) 在路由定義時不會丟 TypeError（能真的掛上 router）', () => {
    const validate = require('../api/middleware/validate');
    expect(() => validate(communityCtrl.commentSchema)).not.toThrow();
    expect(() => require('../api/routes/community')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
describe('communityController — listWorks', () => {
  test('只查上架＋公開＋過審的漫劇，並轉型 BigInt/Decimal', async () => {
    prisma.comicDrama.findMany.mockResolvedValue([COMIC_ROW]);
    const res = mockRes();
    await communityCtrl.listWorks(req(), res);

    const arg = prisma.comicDrama.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ status: 1, isPublic: true, auditStatus: 'approved' });
    expect(arg.take).toBe(20);
    expect(arg.skip).toBe(0);
    expect(arg.orderBy).toEqual([{ likes: 'desc' }, { views: 'desc' }]);

    const w = res.body.data.list[0];
    expect(typeof w.views).toBe('number');
    expect(w.views).toBe(1250000);
    expect(typeof w.rating).toBe('number');
    expect(w.rating).toBe(9.4);
    expect(w.episodes).toBe(2);        // 卡片印 `${w.episodes}集`
    expect(w.category).toBe('逆襲');
    expect(w.creatorName).toBe('星辰劇場');
    expect(w.remixCount).toBe(326);
    expect(w._liked).toBe(false);      // 這條路由沒有 auth，拿不到登入者
    // BigInt 真的會讓 JSON.stringify 爆掉 —— 證明出口轉型是必要的
    expect(() => JSON.stringify(res.body)).not.toThrow();
  });

  test('sort=new 依發佈時間排序；sort 亂填時退回 hot', async () => {
    prisma.comicDrama.findMany.mockResolvedValue([]);
    await communityCtrl.listWorks(req({ query: { sort: 'new' } }), mockRes());
    expect(prisma.comicDrama.findMany.mock.calls[0][0].orderBy).toEqual([{ createdAt: 'desc' }]);

    const res = mockRes();
    await communityCtrl.listWorks(req({ query: { sort: 'bogus' } }), res);
    expect(prisma.comicDrama.findMany.mock.calls[1][0].orderBy).toEqual([{ likes: 'desc' }, { views: 'desc' }]);
    expect(res.body.data.sort).toBe('hot');
  });

  test('style 會轉成 artStyle 條件；limit 夾在 1..50；page 轉成 skip', async () => {
    prisma.comicDrama.findMany.mockResolvedValue([]);
    await communityCtrl.listWorks(req({ query: { style: 'ink' } }), mockRes());
    expect(prisma.comicDrama.findMany.mock.calls[0][0].where.artStyle).toBe('ink');

    await communityCtrl.listWorks(req({ query: { limit: '999' } }), mockRes());
    expect(prisma.comicDrama.findMany.mock.calls[1][0].take).toBe(50);

    await communityCtrl.listWorks(req({ query: { limit: '-5' } }), mockRes());
    expect(prisma.comicDrama.findMany.mock.calls[2][0].take).toBe(1);

    await communityCtrl.listWorks(req({ query: { page: '3', limit: '20' } }), mockRes());
    expect(prisma.comicDrama.findMany.mock.calls[3][0].skip).toBe(40);
  });

  test('DB 出錯回 500，不會把例外拋出去', async () => {
    prisma.comicDrama.findMany.mockRejectedValue(new Error('boom'));
    const res = mockRes();
    await communityCtrl.listWorks(req(), res);
    expect(res.statusCode).toBe(500);
    expect(res.body.code).toBe(500);
  });
});

// ---------------------------------------------------------------------------
describe('communityController — getWorkDetail', () => {
  test('找不到回 404', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await communityCtrl.getWorkDetail(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(res.body.code).toBe(404);
  });

  test('成功時回角色陣列、集數陣列與 commentCount', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue(Object.assign({}, COMIC_ROW, {
      voiceId: 'alloy', prompt: '被趕出家門的少女逆襲', status: 1,
      characters: [{ id: 'ch1', name: '林晚', role: '主角', persona: '堅韌', avatar: 'av.jpg', voiceId: 'alloy' }],
      episodes: [{
        id: 'e1', episodeNumber: 1, title: '第1集 命運轉折', duration: 25, status: 'published',
        panels: [{ id: 'p1', panelNumber: 1, imageUrl: 'p1.jpg', imagePrompt: 'scene', shotType: 'wide', transition: 'fade', dialogue: '台詞', speaker: '', voiceUrl: null, duration: 4 }],
      }],
      _count: { comicComments: 3 },
    }));
    const res = mockRes();
    await communityCtrl.getWorkDetail(req({ params: { id: 'c1' } }), res);

    expect(res.body.code).toBe(200);
    expect(res.body.data.commentCount).toBe(3);
    expect(Array.isArray(res.body.data.characters)).toBe(true);
    expect(res.body.data.characters[0].name).toBe('林晚');
    // 詳情的 episodes 是陣列（前端印 `w.episodes.length`）
    expect(Array.isArray(res.body.data.episodes)).toBe(true);
    expect(res.body.data.episodes[0].panels[0].imageUrl).toBe('p1.jpg');
    expect(typeof res.body.data.views).toBe('number');
  });
});

// ---------------------------------------------------------------------------
describe('communityController — searchAll（/search/all 聚合搜索）', () => {
  test('空字串直接回三塊空陣列，不查資料庫', async () => {
    const res = mockRes();
    await communityCtrl.searchAll(req({ query: { q: '   ' } }), res);
    expect(res.body.data).toEqual({ q: '', total: 0, dramas: [], comics: [], creators: [] });
    expect(prisma.drama.findMany).not.toHaveBeenCalled();
    expect(prisma.comicDrama.findMany).not.toHaveBeenCalled();
    expect(prisma.creator.findMany).not.toHaveBeenCalled();
  });

  test('同時搜短劇、漫劇、創作者，並標上 type（前端 v61.js 依 type 分區）', async () => {
    prisma.drama.findMany.mockResolvedValue([{
      id: 'd1', title: '霸道總裁愛上我', cover: 'd.jpg', totalEpisodes: 3,
      views: 230000000n, likes: 5, rating: { toNumber: () => 9.2 },
      category: { id: 'cat1', name: '甜寵' },
    }]);
    prisma.comicDrama.findMany.mockResolvedValue([COMIC_ROW]);
    prisma.creator.findMany.mockResolvedValue([{ id: 'cr1', realName: '星辰劇場', avatar: 'a.jpg', bio: '專業團隊' }]);

    const res = mockRes();
    await communityCtrl.searchAll(req({ query: { q: '總裁' } }), res);

    const { dramas, comics, creators, total } = res.body.data;
    expect(total).toBe(3);
    expect(dramas[0].type).toBe('drama');
    expect(dramas[0].category).toBe('甜寵');
    expect(dramas[0].episodes).toBe(3);
    expect(typeof dramas[0].views).toBe('number');
    expect(comics[0].type).toBe('comic');
    expect(comics[0].artStyle).toBe('anime');
    expect(creators[0]).toEqual({ id: 'cr1', name: '星辰劇場', avatar: 'a.jpg', bio: '專業團隊', type: 'creator' });

    // 搜尋條件：title 與 desc 都要比對
    const dWhere = prisma.drama.findMany.mock.calls[0][0].where;
    expect(dWhere.status).toBe(1);
    expect(dWhere.auditStatus).toBe('approved');
    expect(dWhere.OR[0].title.contains).toBe('總裁');
    expect(dWhere.OR[1].desc.contains).toBe('總裁');
    // 短劇的 select 不能含漫劇才有的欄位（Prisma 會直接報錯）
    const dSelect = prisma.drama.findMany.mock.calls[0][0].select;
    expect(dSelect.artStyle).toBeUndefined();
    expect(dSelect.remixOfId).toBeUndefined();
    expect(dSelect.title).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('communityController — 評論', () => {
  test('listComments：作品不存在回 404', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue(null);
    const res = mockRes();
    await communityCtrl.listComments(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.comicComment.findMany).not.toHaveBeenCalled();
  });

  test('listComments：回 {total,page,limit,list}，並標記 mine', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.comicComment.findMany.mockResolvedValue([
      COMMENT_ROW, // userId = u1（= 登入者）
      { id: 'cm2', content: '水墨風格什麼時候出第二季？', userId: 'u2', createdAt: new Date(), user: { id: 'u2', nickname: '夜雨聲煩', avatar: null } },
    ]);
    const res = mockRes();
    await communityCtrl.listComments(req({ params: { id: 'c1' } }), res);

    expect(res.body.data.list).toHaveLength(2);
    expect(res.body.data.list[0].mine).toBe(true);
    expect(res.body.data.list[1].mine).toBe(false);
    expect(res.body.data.list[0].nickname).toBe('劇迷小風');
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(30);
    expect(prisma.comicComment.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'desc' });
  });

  test('listComments：未登入（optionalAuth 沒帶 token）時 mine 一律 false', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.comicComment.findMany.mockResolvedValue([COMMENT_ROW]);
    const res = mockRes();
    await communityCtrl.listComments(req({ params: { id: 'c1' }, user: undefined }), res);
    expect(res.body.data.list[0].mine).toBe(false);
  });

  test('addComment：作品不存在回 404、沒登入回 401、空內容回 400', async () => {
    let res = mockRes();
    await communityCtrl.addComment(req({ params: { id: 'c1' }, user: undefined }), res);
    expect(res.statusCode).toBe(401);

    prisma.comicDrama.findUnique.mockResolvedValue(null);
    res = mockRes();
    await communityCtrl.addComment(req({ params: { id: 'nope' }, body: { content: 'hi' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.comicComment.create).not.toHaveBeenCalled();

    prisma.comicDrama.findUnique.mockResolvedValue({ id: 'c1' });
    res = mockRes();
    await communityCtrl.addComment(req({ params: { id: 'c1' }, body: { content: '   ' } }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.comicComment.create).not.toHaveBeenCalled();
  });

  test('addComment：成功回單一評論（mine:true）並寫入 comicId/userId', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.comicComment.create.mockResolvedValue(COMMENT_ROW);
    const res = mockRes();
    await communityCtrl.addComment(req({ params: { id: 'c1' }, body: { content: '  太神了  ' } }), res);

    expect(res.body.code).toBe(200);
    expect(prisma.comicComment.create.mock.calls[0][0].data).toEqual({
      comicId: 'c1', userId: 'u1', content: '太神了',
    });
    expect(res.body.data.mine).toBe(true);
    expect(res.body.data.id).toBe('cm1');
  });

  test('deleteComment：不存在回 404；別人的回 403 且不刪；自己的才刪', async () => {
    prisma.comicComment.findUnique.mockResolvedValue(null);
    let res = mockRes();
    await communityCtrl.deleteComment(req({ params: { commentId: 'x' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.comicComment.delete).not.toHaveBeenCalled();

    prisma.comicComment.findUnique.mockResolvedValue({ id: 'cm9', userId: 'u2', comicId: 'c1' });
    res = mockRes();
    await communityCtrl.deleteComment(req({ params: { commentId: 'cm9' } }), res);
    expect(res.statusCode).toBe(403);
    expect(prisma.comicComment.delete).not.toHaveBeenCalled();

    prisma.comicComment.findUnique.mockResolvedValue({ id: 'cm1', userId: 'u1', comicId: 'c1' });
    res = mockRes();
    await communityCtrl.deleteComment(req({ params: { commentId: 'cm1' } }), res);
    expect(res.body.code).toBe(200);
    expect(prisma.comicComment.delete).toHaveBeenCalledWith({ where: { id: 'cm1' } });
    expect(res.body.data.deleted).toBe(true);
  });

  test('deleteComment：沒登入回 401', async () => {
    const res = mockRes();
    await communityCtrl.deleteComment(req({ params: { commentId: 'cm1' }, user: undefined }), res);
    expect(res.statusCode).toBe(401);
    expect(prisma.comicComment.findUnique).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
describe('communityController — toggleLike / toggleFavorite', () => {
  test('toggleLike：沒登入 401、作品不存在 404', async () => {
    let res = mockRes();
    await communityCtrl.toggleLike(req({ params: { id: 'c1' }, user: undefined }), res);
    expect(res.statusCode).toBe(401);

    prisma.comicDrama.findUnique.mockResolvedValue(null);
    res = mockRes();
    await communityCtrl.toggleLike(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.comicLike.create).not.toHaveBeenCalled();
  });

  test('toggleLike：不存在 → 建立並 likes+1，回 {liked:true}', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue({ id: 'c1', likes: 12800 });
    prisma.comicLike.findUnique.mockResolvedValue(null);
    prisma.comicLike.create.mockResolvedValue({});
    prisma.comicDrama.update.mockResolvedValue({});
    const res = mockRes();
    await communityCtrl.toggleLike(req({ params: { id: 'c1' } }), res);

    expect(prisma.comicLike.findUnique.mock.calls[0][0].where).toEqual({
      userId_comicId: { userId: 'u1', comicId: 'c1' },
    });
    expect(prisma.comicLike.create).toHaveBeenCalledWith({ data: { userId: 'u1', comicId: 'c1' } });
    expect(prisma.comicDrama.update).toHaveBeenCalledWith({
      where: { id: 'c1' }, data: { likes: { increment: 1 } },
    });
    expect(res.body.data.liked).toBe(true);
    expect(res.body.data.likes).toBe(12801);
  });

  test('toggleLike：已存在 → 刪除並 likes-1，回 {liked:false}', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue({ id: 'c1', likes: 12800 });
    prisma.comicLike.findUnique.mockResolvedValue({ id: 'l1' });
    prisma.comicLike.delete.mockResolvedValue({});
    prisma.comicDrama.update.mockResolvedValue({});
    const res = mockRes();
    await communityCtrl.toggleLike(req({ params: { id: 'c1' } }), res);

    expect(prisma.comicLike.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
    expect(prisma.comicDrama.update).toHaveBeenCalledWith({
      where: { id: 'c1' }, data: { likes: { decrement: 1 } },
    });
    expect(res.body.data.liked).toBe(false);
    expect(res.body.data.likes).toBe(12799);
  });

  test('toggleLike：likes 已經是 0 時不再扣，避免負數', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue({ id: 'c1', likes: 0 });
    prisma.comicLike.findUnique.mockResolvedValue({ id: 'l1' });
    prisma.comicLike.delete.mockResolvedValue({});
    const res = mockRes();
    await communityCtrl.toggleLike(req({ params: { id: 'c1' } }), res);
    expect(prisma.comicDrama.update).not.toHaveBeenCalled();
    expect(res.body.data.likes).toBe(0);
    expect(res.body.data.liked).toBe(false);
  });

  test('toggleFavorite：不存在 → 建立回 {favorited:true}；已存在 → 刪除回 false；404 不寫入', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue({ id: 'c1' });
    prisma.comicFavorite.findUnique.mockResolvedValue(null);
    prisma.comicFavorite.create.mockResolvedValue({});
    let res = mockRes();
    await communityCtrl.toggleFavorite(req({ params: { id: 'c1' } }), res);
    expect(prisma.comicFavorite.create).toHaveBeenCalledWith({ data: { userId: 'u1', comicId: 'c1' } });
    expect(res.body.data).toEqual({ favorited: true, comicId: 'c1' });
    expect(prisma.comicFavorite.findUnique).toHaveBeenCalledTimes(1);

    prisma.comicFavorite.findUnique.mockResolvedValue({ id: 'f1' });
    prisma.comicFavorite.delete.mockResolvedValue({});
    res = mockRes();
    await communityCtrl.toggleFavorite(req({ params: { id: 'c1' } }), res);
    expect(prisma.comicFavorite.delete).toHaveBeenCalledWith({ where: { id: 'f1' } });
    expect(res.body.data.favorited).toBe(false);
    expect(prisma.comicFavorite.findUnique).toHaveBeenCalledTimes(2);

    prisma.comicDrama.findUnique.mockResolvedValue(null);
    res = mockRes();
    await communityCtrl.toggleFavorite(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    // 作品不存在時在查收藏紀錄之前就返回了，所以次數不變
    expect(prisma.comicFavorite.findUnique).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
describe('communityController — myFavorites', () => {
  test('data 直接是陣列（pwa.js 讀 res.data.map），並用第二次查詢補作品', async () => {
    prisma.comicFavorite.findMany.mockResolvedValue([
      { comicId: 'c1', createdAt: new Date('2026-08-25') },
      { comicId: 'gone', createdAt: new Date('2026-08-24') }, // 作品已刪除
    ]);
    prisma.comicDrama.findMany.mockResolvedValue([COMIC_ROW]);
    const res = mockRes();
    await communityCtrl.myFavorites(req(), res);

    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data).toHaveLength(1); // 已刪除的作品被略過
    expect(res.body.data[0].id).toBe('c1');
    expect(res.body.data[0].title).toBe('逆襲：命運重啟');
    expect(res.body.data[0].episodes).toBe(2);
    expect(prisma.comicDrama.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['c1', 'gone'] } });
  });

  test('沒有收藏時不發出第二次查詢；沒登入回 401', async () => {
    prisma.comicFavorite.findMany.mockResolvedValue([]);
    const res = mockRes();
    await communityCtrl.myFavorites(req(), res);
    expect(res.body.data).toEqual([]);
    expect(prisma.comicDrama.findMany).not.toHaveBeenCalled();

    const res401 = mockRes();
    await communityCtrl.myFavorites(req({ user: undefined }), res401);
    expect(res401.statusCode).toBe(401);
  });

  test('重複的收藏紀錄各出一張卡，但作品查詢的 id 會去重', async () => {
    prisma.comicFavorite.findMany.mockResolvedValue([
      { comicId: 'c1', createdAt: new Date() },
      { comicId: 'c1', createdAt: new Date() },
    ]);
    prisma.comicDrama.findMany.mockResolvedValue([COMIC_ROW]);
    const res = mockRes();
    await communityCtrl.myFavorites(req(), res);
    expect(res.body.data).toHaveLength(2); // 兩筆收藏紀錄各一張卡（前端以 id 開啟作品）
    expect(prisma.comicDrama.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['c1'] } });
  });
});

// ---------------------------------------------------------------------------
describe('communityController — remix（做同款）', () => {
  test('沒登入 401、作品不存在 404（且不建立衍生作品）', async () => {
    let res = mockRes();
    await communityCtrl.remix(req({ params: { id: 'c1' }, user: undefined }), res);
    expect(res.statusCode).toBe(401);

    prisma.comicDrama.findUnique.mockResolvedValue(null);
    res = mockRes();
    await communityCtrl.remix(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.comicDrama.create).not.toHaveBeenCalled();
  });

  test('以來源作品的題材/畫風建立衍生作品，記錄 remixOfId 並把來源 remixCount+1', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue({
      id: 'c1', title: '逆襲：命運重啟', desc: 'demo', cover: 'cover.jpg',
      categoryId: 'cat1', artStyle: 'anime', voiceId: 'alloy',
      theme: '豪門逆襲復仇', prompt: '被趕出家門的少女逆襲歸來', remixCount: 326,
    });
    prisma.creator.findUnique.mockResolvedValue({ id: 'cr1' });
    prisma.comicDrama.create.mockResolvedValue({ id: 'new1', title: '逆襲：命運重啟 · 同款', remixOfId: 'c1', isPublic: false });
    prisma.comicDrama.update.mockResolvedValue({ remixCount: 327 });

    const res = mockRes();
    await communityCtrl.remix(req({ params: { id: 'c1' } }), res);

    const data = prisma.comicDrama.create.mock.calls[0][0].data;
    expect(data.remixOfId).toBe('c1');                    // ← 來源作品
    expect(data.artStyle).toBe('anime');
    expect(data.theme).toBe('豪門逆襲復仇');
    expect(data.creatorId).toBe('cr1');                   // 掛在復刻者自己的創作者檔案下
    expect(data.isPublic).toBe(false);                    // 未發佈到社區
    expect(data.totalEpisodes).toBe(0);
    expect(prisma.comicDrama.update).toHaveBeenCalledWith({
      where: { id: 'c1' }, data: { remixCount: { increment: 1 } }, select: { remixCount: true },
    });

    expect(res.body.data.remixOfId).toBe('c1');
    expect(res.body.data.remixOf).toBe('逆襲：命運重啟');
    expect(res.body.data.remixId).toBe('new1');
    expect(res.body.data.remixCount).toBe(327);
  });

  test('沒有創作者檔案的用戶也能復刻（creatorId 為 null，不冒用原創作者）', async () => {
    prisma.comicDrama.findUnique.mockResolvedValue({
      id: 'c1', title: 'T', desc: null, cover: null, categoryId: null, artStyle: 'ink',
      voiceId: null, theme: null, prompt: null, remixCount: 0,
    });
    prisma.creator.findUnique.mockResolvedValue(null);
    prisma.comicDrama.create.mockResolvedValue({ id: 'new2', title: 'T · 同款', remixOfId: 'c1', isPublic: false });
    prisma.comicDrama.update.mockResolvedValue({ remixCount: 1 });

    const res = mockRes();
    await communityCtrl.remix(req({ params: { id: 'c1' } }), res);
    expect(prisma.comicDrama.create.mock.calls[0][0].data.creatorId).toBeNull();
    expect(res.body.data.remixCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
describe('communityController — 型別工具', () => {
  test('_num 對 BigInt / Decimal / 壞值都安全', () => {
    expect(communityCtrl._num(10n)).toBe(10);
    expect(communityCtrl._num({ toNumber: () => 1.5 })).toBe(1.5);
    expect(communityCtrl._num('7')).toBe(7);
    expect(communityCtrl._num(undefined)).toBe(0);
    expect(communityCtrl._num('abc')).toBe(0);
  });

  test('_toWorkCard 對缺少關聯的列不會爆', () => {
    const card = communityCtrl._toWorkCard({ id: 'x', totalEpisodes: null, likes: null, remixCount: null });
    expect(card.episodes).toBe(0);
    expect(card.category).toBeNull();
    expect(card.creatorName).toBeNull();
    expect(card.remixOfId).toBeNull();
  });
});
