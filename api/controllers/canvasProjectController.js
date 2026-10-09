/* ===== 創作畫布雲端保存控制器 (v7.2) =====
 *
 * 契約來自 api/routes/canvas.js（掛在 /canvas 底下，全部需要 auth）：
 *   GET    /projects                        listProjects
 *   POST   /projects   validate(saveSchema) saveProject
 *   GET    /projects/:id                    getProject
 *   DELETE /projects/:id                    deleteProject
 *   GET    /projects/:id/versions           listVersions
 *   POST   /projects/:id/restore/:versionId restoreVersion
 *
 * `CanvasProject` 屬於某個 user（`userId`）：**任何不是自己的專案一律 403**，
 * 而且檢查發生在讀寫之前（別人的專案不會被讀出內容、也不會被改到）。
 * 路由完全沒有 optionalAuth，`req.user.userId` 由 api/middleware/auth.js 保證。
 *
 * 版本（`CanvasVersion`）語意：**每次保存都留下一份快照**（create 與 update 都留），
 * `restoreVersion` 把專案資料還原成指定快照，並在覆蓋前先為「現在的樣子」補一份快照
 * ——所以還原本身也可以再被還原，不會有去無回。
 *
 * `CollaborationRoom` 是 `CanvasProject` 的一對一協作房（projectId unique）：
 * getProject 會附上房間（members / snapshot），listProjects 只帶 `collabRoomId`
 * 避免列表把整個操作日誌（opsLog）拖出來。
 *
 * 列表形狀：`data` 是**陣列**（與 userController.getFollows / getHistory、
 * dramaController.getCategories 同一個慣例）。這兩個端點目前沒有前端消費者
 * （flow-canvas.js 走 localStorage），所以形狀以「陣列＝這一頁的資料」為準，
 * 上限由 `?limit=` 控制（1..50，預設 20）。
 *
 * 型別陷阱：CanvasProject.data / CanvasVersion.data 是 Json，原樣回傳即可
 * （不會有 BigInt/Decimal 問題）；不需要轉型。
 */
const { z } = require('zod');
const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');

// 畫布資料是 JSON（flow-canvas 的 { nodes, links, seq }）；物件、陣列、字串都收
const jsonData = z.union([z.record(z.any()), z.array(z.any()), z.string()]);

const saveSchema = z.object({
  // 有 id = 更新既有專案；沒有 id = 新建
  id: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, '畫布名稱不可為空').max(80, '畫布名稱過長').optional(),
  data: jsonData,
});

const PROJECT_SHAPE = { id: true, name: true, data: true, createdAt: true, updatedAt: true };

const COLLAB_SELECT = {
  select: {
    id: true, ownerId: true, members: true, opsLog: true, snapshot: true,
    createdAt: true, updatedAt: true,
  },
};

function requesterId(req) {
  return (req.user && req.user.userId) || null;
}

function pageLimit(req, def = 20, max = 50) {
  const n = parseInt(req.query && req.query.limit, 10);
  return Math.min(Math.max(Number.isNaN(n) ? def : n, 1), max);
}

function shapeProject(p, extra) {
  return Object.assign({
    id: p.id,
    name: p.name,
    data: p.data,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }, extra || {});
}

// 取專案並驗證擁有權；回傳 { project } 或 { status, message }
async function loadOwnedProject(req, select) {
  const userId = requesterId(req);
  if (!userId) return { status: 401, message: '未授權' };
  const project = await prisma.canvasProject.findUnique({
    where: { id: req.params.id },
    select: Object.assign({ id: true, userId: true }, select || {}),
  });
  if (!project) return { status: 404, message: '畫布專案不存在' };
  if (project.userId !== userId) return { status: 403, message: '無權存取此畫布專案' };
  return { project, userId };
}

// ---------- 端點 ----------
// GET /canvas/projects
async function listProjects(req, res) {
  try {
    const userId = requesterId(req);
    if (!userId) return error(res, 401, '未授權');

    const rows = await prisma.canvasProject.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: pageLimit(req),
      select: {
        id: true, name: true, createdAt: true, updatedAt: true,
        _count: { select: { versions: true } },
        collabRoom: { select: { id: true } },
      },
    });

    success(res, rows.map((r) => ({
      id: r.id,
      name: r.name,
      versionCount: (r._count && r._count.versions) || 0,
      collabRoomId: (r.collabRoom && r.collabRoom.id) || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })));
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取畫布列表失敗');
  }
}

// POST /canvas/projects —— 有 id 覆蓋既有專案（別人的 → 403），沒有 id 新建
async function saveProject(req, res) {
  try {
    const userId = requesterId(req);
    if (!userId) return error(res, 401, '未授權');

    const body = req.body || {};
    if (body.data === undefined) return error(res, 400, '缺少畫布資料（data）');
    const name = body.name;

    if (body.id) {
      const project = await prisma.canvasProject.findUnique({
        where: { id: body.id },
        select: { id: true, userId: true },
      });
      if (!project) return error(res, 404, '畫布專案不存在');
      if (project.userId !== userId) return error(res, 403, '無權存取此畫布專案');

      const data = { data: body.data };
      if (name !== undefined) data.name = name;

      const updated = await prisma.canvasProject.update({
        where: { id: project.id },
        data,
        select: PROJECT_SHAPE,
      });
      const version = await prisma.canvasVersion.create({
        data: { projectId: project.id, data: body.data },
        select: { id: true, createdAt: true },
      });

      return success(res, shapeProject(updated, { versionId: version.id, versionCreatedAt: version.createdAt }), '畫布已保存');
    }

    const created = await prisma.canvasProject.create({
      data: { userId, name: name || '未命名畫布', data: body.data },
      select: PROJECT_SHAPE,
    });
    const version = await prisma.canvasVersion.create({
      data: { projectId: created.id, data: body.data },
      select: { id: true, createdAt: true },
    });

    success(res, shapeProject(created, { versionId: version.id, versionCreatedAt: version.createdAt }), '畫布已建立');
  } catch (e) {
    console.error(e);
    error(res, 500, '保存畫布失敗');
  }
}

// GET /canvas/projects/:id
async function getProject(req, res) {
  try {
    const found = await loadOwnedProject(req, {
      name: true, data: true, createdAt: true, updatedAt: true, collabRoom: COLLAB_SELECT,
    });
    if (found.status) return error(res, found.status, found.message);

    const p = found.project;
    success(res, shapeProject(p, { collabRoom: p.collabRoom || null }));
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取畫布失敗');
  }
}

// DELETE /canvas/projects/:id
async function deleteProject(req, res) {
  try {
    const found = await loadOwnedProject(req);
    if (found.status) return error(res, found.status, found.message);

    // CanvasVersion / CollaborationRoom 在 schema 是 onDelete: Cascade，會一起清掉
    await prisma.canvasProject.delete({ where: { id: found.project.id } });
    success(res, { id: found.project.id, deleted: true }, '畫布已刪除');
  } catch (e) {
    console.error(e);
    error(res, 500, '刪除畫布失敗');
  }
}

// GET /canvas/projects/:id/versions
async function listVersions(req, res) {
  try {
    const found = await loadOwnedProject(req);
    if (found.status) return error(res, found.status, found.message);

    const rows = await prisma.canvasVersion.findMany({
      where: { projectId: found.project.id },
      orderBy: { createdAt: 'desc' },
      take: pageLimit(req, 20, 50),
      select: { id: true, data: true, createdAt: true },
    });
    success(res, rows.map((v) => ({ id: v.id, data: v.data, createdAt: v.createdAt })));
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取版本列表失敗');
  }
}

// POST /canvas/projects/:id/restore/:versionId
async function restoreVersion(req, res) {
  try {
    const found = await loadOwnedProject(req, { data: true, name: true });
    if (found.status) return error(res, found.status, found.message);

    const version = await prisma.canvasVersion.findUnique({
      where: { id: req.params.versionId },
      select: { id: true, projectId: true, data: true, createdAt: true },
    });
    // 版本不屬於這個專案 → 當成不存在（不洩漏別人的版本 id）
    if (!version || version.projectId !== found.project.id) return error(res, 404, '版本不存在');

    // 覆蓋前先替「現在的樣子」留一份快照，還原才不會一去不回
    await prisma.canvasVersion.create({
      data: { projectId: found.project.id, data: found.project.data },
    });
    const updated = await prisma.canvasProject.update({
      where: { id: found.project.id },
      data: { data: version.data },
      select: PROJECT_SHAPE,
    });

    success(res, shapeProject(updated, {
      restoredFrom: { versionId: version.id, createdAt: version.createdAt },
    }), '已還原至指定版本');
  } catch (e) {
    console.error(e);
    error(res, 500, '還原版本失敗');
  }
}

module.exports = {
  listProjects,
  saveProject,
  getProject,
  deleteProject,
  listVersions,
  restoreVersion,
  saveSchema,
};
