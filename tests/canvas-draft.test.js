// ===== v7.2 單元測試：canvasProjectController / draftController =====
// （v7.3：canvasController 已隨 /ai/agent 整條線移除，它的測試一併刪掉；
//   這兩個 controller 掛在 /canvas 與 /drafts，**不屬於 /ai/***，保留。）
//
// 這兩個 controller 在原始 repo 中不存在（API 因此起不來）。這裡照
// tests/controllers.test.js 的形狀用 **mocked Prisma** 驗「邏輯」：
//   · 回應形狀（前端消費方式 / demo 契約）
//   · 錯誤路徑（400 / 403 / 404）
//   · **真的傳給 Prisma 的查詢參數**（where / orderBy / select / data）
//   · zod schema 是真的 zod schema（validate() 在路由定義時就呼叫 .safeParse）
// **不驗證 SQL 正確性**（那需要真的資料庫），這是刻意的取捨。

jest.mock('../api/utils/prisma', () => ({
  canvasProject: {
    findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(),
    update: jest.fn(), delete: jest.fn(),
  },
  canvasVersion: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn() },
  draft: {
    findMany: jest.fn(), findUnique: jest.fn(), create: jest.fn(),
    update: jest.fn(), delete: jest.fn(),
  },
}));

const prisma = require('../api/utils/prisma');
const projectCtrl = require('../api/controllers/canvasProjectController');
const draftCtrl = require('../api/controllers/draftController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(c) { this.statusCode = c; return this; },
    json(b) { this.body = b; return this; },
  };
}
const req = (extra = {}) => Object.assign({ query: {}, params: {}, body: {}, user: { userId: 'u1' } }, extra);

beforeEach(() => { jest.clearAllMocks(); });

const PROJECT_ROW = {
  id: 'cp1', userId: 'u1', name: '畫布A', data: { nodes: [{ id: 'n1' }], links: [], seq: 2 },
  createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'), collabRoom: null,
};

// ===========================================================================
describe('canvasProjectController — saveSchema 與專案 CRUD', () => {
  test('saveSchema 是真的 zod schema：data 必填，物件/陣列/字串都收', () => {
    expect(typeof projectCtrl.saveSchema.safeParse).toBe('function');
    expect(projectCtrl.saveSchema.safeParse({ data: { nodes: [], links: [], seq: 1 } }).success).toBe(true);
    expect(projectCtrl.saveSchema.safeParse({ id: 'cp1', name: '畫布', data: { nodes: [] } }).success).toBe(true);
    expect(projectCtrl.saveSchema.safeParse({ data: [{ id: 'n1' }] }).success).toBe(true);
    expect(projectCtrl.saveSchema.safeParse({ data: '{}' }).success).toBe(true);
    expect(projectCtrl.saveSchema.safeParse({ name: '只有名字' }).success).toBe(false); // 缺 data
    expect(projectCtrl.saveSchema.safeParse({ data: { x: 1 }, name: '' }).success).toBe(false);
  });

  test('listProjects 只查自己的專案，回陣列並帶 versionCount', async () => {
    prisma.canvasProject.findMany.mockResolvedValue([{
      id: 'cp1', name: '畫布A', createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
      _count: { versions: 3 }, collabRoom: { id: 'room1' },
    }]);
    const res = mockRes();
    await projectCtrl.listProjects(req(), res);

    const arg = prisma.canvasProject.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 'u1' });
    expect(arg.orderBy).toEqual({ updatedAt: 'desc' });
    expect(arg.take).toBe(20);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data[0]).toEqual(expect.objectContaining({ id: 'cp1', versionCount: 3, collabRoomId: 'room1' }));
  });

  test('listProjects 的 limit 夾在 1..50', async () => {
    prisma.canvasProject.findMany.mockResolvedValue([]);
    await projectCtrl.listProjects(req({ query: { limit: '999' } }), mockRes());
    expect(prisma.canvasProject.findMany.mock.calls[0][0].take).toBe(50);
    await projectCtrl.listProjects(req({ query: { limit: '-3' } }), mockRes());
    expect(prisma.canvasProject.findMany.mock.calls[1][0].take).toBe(1);
  });

  test('saveProject 沒有 id → 新建，且立刻留下第一份版本快照', async () => {
    prisma.canvasProject.create.mockResolvedValue(Object.assign({}, PROJECT_ROW, { id: 'cp9' }));
    prisma.canvasVersion.create.mockResolvedValue({ id: 'v1', createdAt: new Date('2026-01-02') });

    const res = mockRes();
    await projectCtrl.saveProject(req({ body: { name: '畫布B', data: { nodes: [], links: [], seq: 1 } } }), res);

    expect(prisma.canvasProject.findUnique).not.toHaveBeenCalled();
    expect(prisma.canvasProject.create.mock.calls[0][0].data).toEqual({
      userId: 'u1', name: '畫布B', data: { nodes: [], links: [], seq: 1 },
    });
    expect(prisma.canvasVersion.create.mock.calls[0][0].data).toEqual({
      projectId: 'cp9', data: { nodes: [], links: [], seq: 1 },
    });
    expect(res.body.data.id).toBe('cp9');
    expect(res.body.data.versionId).toBe('v1');
  });

  test('saveProject 沒給名字時用預設名稱「未命名畫布」', async () => {
    prisma.canvasProject.create.mockResolvedValue(Object.assign({}, PROJECT_ROW, { id: 'cp9', name: '未命名畫布' }));
    prisma.canvasVersion.create.mockResolvedValue({ id: 'v1' });
    await projectCtrl.saveProject(req({ body: { data: { nodes: [] } } }), mockRes());
    expect(prisma.canvasProject.create.mock.calls[0][0].data.name).toBe('未命名畫布');
  });

  test('saveProject 帶自己的 id → 更新並留快照；name 未給不會被覆蓋成預設值', async () => {
    prisma.canvasProject.findUnique.mockResolvedValue({ id: 'cp1', userId: 'u1' });
    prisma.canvasProject.update.mockResolvedValue(PROJECT_ROW);
    prisma.canvasVersion.create.mockResolvedValue({ id: 'v2', createdAt: new Date() });

    const res = mockRes();
    await projectCtrl.saveProject(req({ body: { id: 'cp1', data: { nodes: [{ id: 'n2' }] } } }), res);

    const arg = prisma.canvasProject.update.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'cp1' });
    expect(arg.data).toEqual({ data: { nodes: [{ id: 'n2' }] } });  // 沒有 name 欄位
    expect(prisma.canvasVersion.create.mock.calls[0][0].data.projectId).toBe('cp1');
    expect(res.body.data.id).toBe('cp1');
  });

  test('saveProject 動別人的專案 → 403，且不更新、不留快照', async () => {
    prisma.canvasProject.findUnique.mockResolvedValue({ id: 'cp1', userId: 'u2' });
    const res = mockRes();
    await projectCtrl.saveProject(req({ body: { id: 'cp1', data: { nodes: [] } } }), res);
    expect(res.statusCode).toBe(403);
    expect(prisma.canvasProject.update).not.toHaveBeenCalled();
    expect(prisma.canvasVersion.create).not.toHaveBeenCalled();
  });

  test('saveProject 找不到 id → 404；缺 data → 400', async () => {
    prisma.canvasProject.findUnique.mockResolvedValue(null);
    let res = mockRes();
    await projectCtrl.saveProject(req({ body: { id: 'nope', data: { nodes: [] } } }), res);
    expect(res.statusCode).toBe(404);

    res = mockRes();
    await projectCtrl.saveProject(req({ body: { name: 'x' } }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.canvasProject.create).not.toHaveBeenCalled();
  });

  test('getProject 自己的專案回 data + collabRoom；別人的回 403；不存在回 404', async () => {
    prisma.canvasProject.findUnique.mockResolvedValue(Object.assign({}, PROJECT_ROW, {
      collabRoom: { id: 'room1', ownerId: 'u1', members: [{ userId: 'u1', role: 'owner' }], opsLog: [], snapshot: null },
    }));
    let res = mockRes();
    await projectCtrl.getProject(req({ params: { id: 'cp1' } }), res);
    expect(res.body.data.data).toEqual(PROJECT_ROW.data);
    expect(res.body.data.collabRoom.id).toBe('room1');
    expect(prisma.canvasProject.findUnique.mock.calls[0][0].where).toEqual({ id: 'cp1' });

    prisma.canvasProject.findUnique.mockResolvedValue({ id: 'cp1', userId: 'u2' });
    res = mockRes();
    await projectCtrl.getProject(req({ params: { id: 'cp1' } }), res);
    expect(res.statusCode).toBe(403);
    expect(res.body.code).toBe(403);
    expect(res.body.data).toBeUndefined();  // 403 不會夾帶別人的專案內容

    prisma.canvasProject.findUnique.mockResolvedValue(null);
    res = mockRes();
    await projectCtrl.getProject(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
  });

  test('deleteProject 只能刪自己的（別人的 403 且不會刪）', async () => {
    prisma.canvasProject.findUnique.mockResolvedValue({ id: 'cp1', userId: 'u1' });
    prisma.canvasProject.delete.mockResolvedValue({});
    let res = mockRes();
    await projectCtrl.deleteProject(req({ params: { id: 'cp1' } }), res);
    expect(prisma.canvasProject.delete).toHaveBeenCalledWith({ where: { id: 'cp1' } });
    expect(res.body.data.deleted).toBe(true);

    prisma.canvasProject.findUnique.mockResolvedValue({ id: 'cp1', userId: 'u2' });
    res = mockRes();
    await projectCtrl.deleteProject(req({ params: { id: 'cp1' } }), res);
    expect(res.statusCode).toBe(403);
    expect(prisma.canvasProject.delete).toHaveBeenCalledTimes(1); // 沒有第二次

    prisma.canvasProject.findUnique.mockResolvedValue(null);
    res = mockRes();
    await projectCtrl.deleteProject(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
  });

  test('listVersions 先驗擁有權，再由新到舊列版本', async () => {
    prisma.canvasProject.findUnique.mockResolvedValue({ id: 'cp1', userId: 'u1' });
    prisma.canvasVersion.findMany.mockResolvedValue([
      { id: 'v2', data: { nodes: [] }, createdAt: new Date('2026-01-02') },
      { id: 'v1', data: { nodes: [] }, createdAt: new Date('2026-01-01') },
    ]);
    const res = mockRes();
    await projectCtrl.listVersions(req({ params: { id: 'cp1' } }), res);
    const arg = prisma.canvasVersion.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ projectId: 'cp1' });
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
    expect(res.body.data.map((v) => v.id)).toEqual(['v2', 'v1']);

    prisma.canvasProject.findUnique.mockResolvedValue({ id: 'cp1', userId: 'u2' });
    const res2 = mockRes();
    await projectCtrl.listVersions(req({ params: { id: 'cp1' } }), res2);
    expect(res2.statusCode).toBe(403);
    expect(prisma.canvasVersion.findMany).toHaveBeenCalledTimes(1);
  });

  test('restoreVersion 還原資料、覆蓋前先替現在的樣子留快照', async () => {
    prisma.canvasProject.findUnique.mockResolvedValue({
      id: 'cp1', userId: 'u1', name: '畫布A', data: { nodes: ['current'] },
    });
    prisma.canvasVersion.findUnique.mockResolvedValue({
      id: 'v1', projectId: 'cp1', data: { nodes: ['old'] }, createdAt: new Date('2026-01-01'),
    });
    prisma.canvasVersion.create.mockResolvedValue({ id: 'v3' });
    prisma.canvasProject.update.mockResolvedValue(Object.assign({}, PROJECT_ROW, { data: { nodes: ['old'] } }));

    const res = mockRes();
    await projectCtrl.restoreVersion(req({ params: { id: 'cp1', versionId: 'v1' } }), res);

    expect(prisma.canvasVersion.findUnique.mock.calls[0][0].where).toEqual({ id: 'v1' });
    expect(prisma.canvasVersion.create.mock.calls[0][0].data).toEqual({
      projectId: 'cp1', data: { nodes: ['current'] },
    });
    expect(prisma.canvasProject.update.mock.calls[0][0]).toEqual({
      where: { id: 'cp1' }, data: { data: { nodes: ['old'] } }, select: expect.any(Object),
    });
    expect(res.body.data.data).toEqual({ nodes: ['old'] });
    expect(res.body.data.restoredFrom.versionId).toBe('v1');
  });

  test('restoreVersion 拿別的專案的版本 id → 404（不洩漏），且不動資料', async () => {
    prisma.canvasProject.findUnique.mockResolvedValue({ id: 'cp1', userId: 'u1', data: {} });
    prisma.canvasVersion.findUnique.mockResolvedValue({ id: 'vX', projectId: 'other', data: {} });
    const res = mockRes();
    await projectCtrl.restoreVersion(req({ params: { id: 'cp1', versionId: 'vX' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.canvasProject.update).not.toHaveBeenCalled();

    prisma.canvasVersion.findUnique.mockResolvedValue(null);
    const res2 = mockRes();
    await projectCtrl.restoreVersion(req({ params: { id: 'cp1', versionId: 'nope' } }), res2);
    expect(res2.statusCode).toBe(404);
  });

  test('restoreVersion 動別人的專案 → 403，連版本都不查', async () => {
    prisma.canvasProject.findUnique.mockResolvedValue({ id: 'cp1', userId: 'u2', data: {} });
    const res = mockRes();
    await projectCtrl.restoreVersion(req({ params: { id: 'cp1', versionId: 'v1' } }), res);
    expect(res.statusCode).toBe(403);
    expect(prisma.canvasVersion.findUnique).not.toHaveBeenCalled();
  });
});

// ===========================================================================
describe('draftController — 只能動自己的草稿', () => {
  test('create：body 全空也能建（content 是 required 欄位，補空字串）', async () => {
    prisma.draft.create.mockImplementation(({ data }) => Promise.resolve(Object.assign({ id: 'd1' }, data)));
    const res = mockRes();
    await draftCtrl.create(req({ body: {} }), res);

    expect(prisma.draft.create.mock.calls[0][0].data).toEqual({
      userId: 'u1', title: '未命名草稿', content: '',
    });
    expect(res.body.data.id).toBe('d1');
    expect(res.body.data.tags).toEqual([]);
    expect(res.body.code).toBe(200);
  });

  test('create：完整欄位真的傳進 Prisma', async () => {
    prisma.draft.create.mockImplementation(({ data }) => Promise.resolve(Object.assign({ id: 'd2' }, data)));
    const res = mockRes();
    await draftCtrl.create(req({
      body: { title: '重生第1集', content: '林晚睜開眼……', outline: '分場大綱', tags: ['重生', '豪門'] },
    }), res);
    expect(prisma.draft.create.mock.calls[0][0].data).toEqual({
      userId: 'u1', title: '重生第1集', content: '林晚睜開眼……', outline: '分場大綱', tags: ['重生', '豪門'],
    });
  });

  test('create：標題空字串或型別錯誤回 400，且不寫入', async () => {
    let res = mockRes();
    await draftCtrl.create(req({ body: { title: '   ' } }), res);
    expect(res.statusCode).toBe(400);

    res = mockRes();
    await draftCtrl.create(req({ body: { tags: 'not-an-array' } }), res);
    expect(res.statusCode).toBe(400);
    expect(prisma.draft.create).not.toHaveBeenCalled();
  });

  test('list：只查自己的、由新到舊、回陣列；q 會同時搜標題與正文', async () => {
    prisma.draft.findMany.mockResolvedValue([
      { id: 'd1', title: 'A', content: 'x', outline: null, tags: ['t'], createdAt: new Date(), updatedAt: new Date() },
    ]);
    let res = mockRes();
    await draftCtrl.list(req(), res);
    const arg = prisma.draft.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: 'u1' });
    expect(arg.orderBy).toEqual({ updatedAt: 'desc' });
    expect(arg.take).toBe(50);
    expect(Array.isArray(res.body.data)).toBe(true);

    res = mockRes();
    await draftCtrl.list(req({ query: { q: '重生' } }), res);
    const where = prisma.draft.findMany.mock.calls[1][0].where;
    expect(where.userId).toBe('u1');
    expect(where.OR[0].title.contains).toBe('重生');
    expect(where.OR[1].content.contains).toBe('重生');

    // 空白 q 不會多帶條件（也不會炸）
    await draftCtrl.list(req({ query: { q: '   ' } }), mockRes());
    expect(prisma.draft.findMany.mock.calls[2][0].where).toEqual({ userId: 'u1' });
  });

  test('update：自己的草稿才更新', async () => {
    prisma.draft.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    prisma.draft.update.mockImplementation(({ data }) => Promise.resolve(Object.assign({ id: 'd1' }, data)));

    const res = mockRes();
    await draftCtrl.update(req({ params: { id: 'd1' }, body: { title: '新標題', content: '新內容' } }), res);
    expect(prisma.draft.update.mock.calls[0][0].where).toEqual({ id: 'd1' });
    expect(prisma.draft.update.mock.calls[0][0].data).toEqual({ title: '新標題', content: '新內容' });
    expect(res.body.data.title).toBe('新標題');
  });

  test('update：找不到 404、別人的 403（都不會寫入）、空 body 400', async () => {
    prisma.draft.findUnique.mockResolvedValue(null);
    let res = mockRes();
    await draftCtrl.update(req({ params: { id: 'nope' }, body: { title: 'x' } }), res);
    expect(res.statusCode).toBe(404);

    prisma.draft.findUnique.mockResolvedValue({ id: 'd1', userId: 'u2' });
    res = mockRes();
    await draftCtrl.update(req({ params: { id: 'd1' }, body: { title: 'x' } }), res);
    expect(res.statusCode).toBe(403);

    prisma.draft.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    res = mockRes();
    await draftCtrl.update(req({ params: { id: 'd1' }, body: {} }), res);
    expect(res.statusCode).toBe(400);

    expect(prisma.draft.update).not.toHaveBeenCalled();
  });

  test('remove：找不到 404、別人的 403（不會刪）、自己的才刪', async () => {
    prisma.draft.findUnique.mockResolvedValue(null);
    let res = mockRes();
    await draftCtrl.remove(req({ params: { id: 'nope' } }), res);
    expect(res.statusCode).toBe(404);
    expect(prisma.draft.delete).not.toHaveBeenCalled();

    prisma.draft.findUnique.mockResolvedValue({ id: 'd1', userId: 'u2' });
    res = mockRes();
    await draftCtrl.remove(req({ params: { id: 'd1' } }), res);
    expect(res.statusCode).toBe(403);
    expect(prisma.draft.delete).not.toHaveBeenCalled();

    prisma.draft.findUnique.mockResolvedValue({ id: 'd1', userId: 'u1' });
    prisma.draft.delete.mockResolvedValue({});
    res = mockRes();
    await draftCtrl.remove(req({ params: { id: 'd1' } }), res);
    expect(prisma.draft.delete).toHaveBeenCalledWith({ where: { id: 'd1' } });
    expect(res.body.data).toEqual({ id: 'd1', deleted: true });
  });

  test('沒有 req.user 時一律 401，不會碰資料庫', async () => {
    let res = mockRes();
    await draftCtrl.list(req({ user: null }), res);
    expect(res.statusCode).toBe(401);

    res = mockRes();
    await draftCtrl.create(req({ user: null, body: { title: 'x' } }), res);
    expect(res.statusCode).toBe(401);

    res = mockRes();
    await draftCtrl.update(req({ user: null, params: { id: 'd1' }, body: { title: 'x' } }), res);
    expect(res.statusCode).toBe(401);

    res = mockRes();
    await draftCtrl.remove(req({ user: null, params: { id: 'd1' } }), res);
    expect(res.statusCode).toBe(401);

    expect(prisma.draft.findMany).not.toHaveBeenCalled();
    expect(prisma.draft.create).not.toHaveBeenCalled();
    expect(prisma.draft.delete).not.toHaveBeenCalled();
  });
});
