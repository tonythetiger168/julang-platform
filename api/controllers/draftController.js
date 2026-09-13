
const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');

// GET /drafts
async function list(req, res) {
  try {
    const drafts = await prisma.draft.findMany({
      where: { userId: req.user.userId },
      orderBy: { updatedAt: 'desc' },
    });
    success(res, drafts);
  } catch (e) {
    error(res, 500, '獲取草稿失敗');
  }
}

// POST /drafts
async function create(req, res) {
  try {
    const { title, content, outline, tags } = req.body;
    const draft = await prisma.draft.create({
      data: {
        userId: req.user.userId,
        title: title || '未命名草稿',
        content: content || '',
        outline: outline || '',
        tags: tags || [],
      },
    });
    success(res, draft, '保存成功');
  } catch (e) {
    console.error(e);
    error(res, 500, '保存失敗');
  }
}

// PUT /drafts/:id
async function update(req, res) {
  try {
    const { title, content, outline, tags } = req.body;
    const draft = await prisma.draft.updateMany({
      where: { id: req.params.id, userId: req.user.userId },
      data: { title, content, outline, tags, updatedAt: new Date() },
    });
    success(res, draft, '更新成功');
  } catch (e) {
    error(res, 500, '更新失敗');
  }
}

// DELETE /drafts/:id
async function remove(req, res) {
  try {
    await prisma.draft.deleteMany({
      where: { id: req.params.id, userId: req.user.userId },
    });
    success(res, null, '刪除成功');
  } catch (e) {
    error(res, 500, '刪除失敗');
  }
}

module.exports = { list, create, update, remove };
