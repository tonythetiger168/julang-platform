// ===== v6.0 創作畫布雲端保存 + 版本歷史 =====
const { z } = require('zod');

const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');

const saveSchema = z.object({
  id: z.string().max(50).optional(),
  name: z.string().min(1).max(50).optional(),
  data: z.object({ nodes: z.array(z.any()).max(500), links: z.array(z.any()).max(1000), seq: z.number().optional() }),
});

async function listProjects(req, res) {
  try {
    const list = await prisma.canvasProject.findMany({
      where: { userId: req.user.id },
      orderBy: { updatedAt: 'desc' },
      select: { id: true, name: true, createdAt: true, updatedAt: true, _count: { select: { versions: true } } },
    });
    success(res, list.map((p) => ({ id: p.id, name: p.name, createdAt: p.createdAt, updatedAt: p.updatedAt, versionCount: p._count.versions })));
  } catch (e) { console.error(e); error(res, 500, '查詢失敗'); }
}

async function saveProject(req, res) {
  try {
    const { id, name, data } = req.validated || req.body;
    let project;
    if (id) {
      project = await prisma.canvasProject.findUnique({ where: { id } });
      if (!project || project.userId !== req.user.id) return error(res, 404, '畫布不存在');
      project = await prisma.canvasProject.update({ where: { id }, data: { name: name || project.name, data } });
    } else {
      project = await prisma.canvasProject.create({ data: { userId: req.user.id, name: name || '未命名畫布', data } });
    }
    // 版本快照（保留最近 10 版）
    await prisma.canvasVersion.create({ data: { projectId: project.id, data } });
    const old = await prisma.canvasVersion.findMany({
      where: { projectId: project.id }, orderBy: { createdAt: 'desc' }, skip: 10, select: { id: true },
    });
    if (old.length) await prisma.canvasVersion.deleteMany({ where: { id: { in: old.map((v) => v.id) } } });
    success(res, { id: project.id, name: project.name, updatedAt: project.updatedAt }, '畫布已保存到雲端');
  } catch (e) { console.error(e); error(res, 500, '保存失敗'); }
}

async function getProject(req, res) {
  try {
    const p = await prisma.canvasProject.findUnique({ where: { id: req.params.id } });
    if (!p || p.userId !== req.user.id) return error(res, 404, '畫布不存在');
    success(res, { id: p.id, name: p.name, data: p.data, createdAt: p.createdAt, updatedAt: p.updatedAt });
  } catch (e) { console.error(e); error(res, 500, '查詢失敗'); }
}

async function listVersions(req, res) {
  try {
    const p = await prisma.canvasProject.findUnique({ where: { id: req.params.id } });
    if (!p || p.userId !== req.user.id) return error(res, 404, '畫布不存在');
    const versions = await prisma.canvasVersion.findMany({
      where: { projectId: p.id }, orderBy: { createdAt: 'desc' },
      select: { id: true, createdAt: true },
    });
    success(res, versions);
  } catch (e) { console.error(e); error(res, 500, '查詢失敗'); }
}

async function restoreVersion(req, res) {
  try {
    const p = await prisma.canvasProject.findUnique({ where: { id: req.params.id } });
    if (!p || p.userId !== req.user.id) return error(res, 404, '畫布不存在');
    const v = await prisma.canvasVersion.findUnique({ where: { id: req.params.versionId } });
    if (!v || v.projectId !== p.id) return error(res, 404, '版本不存在');
    await prisma.canvasProject.update({ where: { id: p.id }, data: { data: v.data } });
    await prisma.canvasVersion.create({ data: { projectId: p.id, data: v.data } });
    success(res, { id: p.id, data: v.data }, '已恢復到該版本');
  } catch (e) { console.error(e); error(res, 500, '恢復失敗'); }
}

async function deleteProject(req, res) {
  try {
    const p = await prisma.canvasProject.findUnique({ where: { id: req.params.id } });
    if (!p || p.userId !== req.user.id) return error(res, 404, '畫布不存在');
    await prisma.canvasProject.delete({ where: { id: p.id } });
    success(res, { id: p.id }, '畫布已刪除');
  } catch (e) { console.error(e); error(res, 500, '刪除失敗'); }
}

module.exports = { listProjects, saveProject, getProject, listVersions, restoreVersion, deleteProject, saveSchema };
