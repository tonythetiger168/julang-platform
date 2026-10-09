/* ===== 素材庫控制器 (v7.2) =====
 *
 * 契約來自 api/routes/assets.js：
 *   GET    /assets        auth → list
 *   POST   /assets        auth → uploadMiddleware → create
 *   POST   /assets/sync   auth → sync
 *   DELETE /assets/:id    auth → remove
 *
 * 鐵則：
 *   · `uploadMiddleware` 必須是**真的 middleware 函式**（路由直接掛上去；不是函式
 *     會讓 express 在路由定義時就爆）。這裡用 multer 1.4.5 的 memoryStorage，
 *     外面包一層只為了把 MulterError 轉成 400（errorHandler 認不得 MulterError，
 *     不包的話檔案過大會變 500）。
 *   · `utils/storage.js` 的 OSS/S3 轉接器在**建構子裡**才 require('ali-oss')／
 *     require('@aws-sdk/client-s3')（兩個都沒安裝）。所以 createStorage() 要用
 *     try/catch 包住並**降級回 LocalStorage**，不能讓整個 server 起不來。
 *   · `Asset` 沒有任何 BigInt/Decimal 欄位（size 是 Int），出口仍然走 num() 防呆。
 *
 * 模型欄位（prisma/schema.prisma）：id / userId / name / category / size / url /
 * hash（SHA-256，差異比對用）/ mimeType / createdAt / updatedAt。
 */
const crypto = require('crypto');
const multer = require('multer');
const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');
const { createStorage, LocalStorage } = require('../utils/storage');

const MAX_FILE_SIZE = 30 * 1024 * 1024;   // 與前端 assets.js 的 30MB 上限一致
const MAX_FILES = 5;
const DEFAULT_LIST_LIMIT = 50;
const CATEGORIES = ['image', 'video', 'audio', 'script', 'other'];

const CATEGORY_BY_EXT = {
  png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', bmp: 'image', svg: 'image',
  mp4: 'video', mov: 'video', webm: 'video', mkv: 'video', avi: 'video',
  mp3: 'audio', wav: 'audio', m4a: 'audio', aac: 'audio', flac: 'audio', ogg: 'audio',
  txt: 'script', md: 'script', docx: 'script', doc: 'script', pdf: 'script', rtf: 'script', fdx: 'script',
};

// ---------- multer（真的 middleware） ----------
const multerAny = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
}).any();

function uploadMiddleware(req, res, next) {
  multerAny(req, res, (err) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? `檔案超過 ${Math.round(MAX_FILE_SIZE / 1024 / 1024)}MB 上限`
      : err.code === 'LIMIT_FILE_COUNT' ? `一次最多上傳 ${MAX_FILES} 個檔案`
      : err.code === 'LIMIT_UNEXPECTED_FILE' ? '不支援的上傳欄位'
      : `檔案上傳失敗：${err.message || err.code || '未知錯誤'}`;
    console.warn('[assets] multer:', err.code || err.message);
    return error(res, 400, message);
  });
}

// ---------- 工具 ----------
function num(v, fallback = 0) {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'number') return Number.isFinite(v) ? v : fallback;
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'object' && typeof v.toNumber === 'function') {
    try { return v.toNumber(); } catch (_) { return fallback; }
  }
  const n = Number(v);
  return Number.isNaN(n) ? fallback : n;
}

function clampInt(value, min, max, fallback) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/**
 * 取得儲存轉接器。**永不 throw**：
 * STORAGE_PROVIDER=oss/s3 但套件沒安裝（本 repo 就是這樣）時降級回本地磁盤，
 * 只在 console 留警告——不讓一次設定失誤打掛整個上傳功能。
 */
function resolveStorage() {
  try {
    return createStorage();
  } catch (e) {
    console.warn('[assets] 儲存提供者不可用，降級為本地儲存:', (e && e.message) || e);
    try {
      return new LocalStorage();
    } catch (e2) {
      console.error('[assets] 連本地儲存都建不起來:', (e2 && e2.message) || e2);
      return null;
    }
  }
}

function detectCategory(mimeType, filename) {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'script';
  if (mime === 'application/msword' || mime.startsWith('application/vnd.openxmlformats-officedocument')) return 'script';
  if (mime.startsWith('text/')) return 'script';
  const ext = String(filename || '').split('.').pop().toLowerCase();
  return CATEGORY_BY_EXT[ext] || 'other';
}

function normalizeCategory(value, mimeType, filename) {
  const v = String(value === undefined || value === null ? '' : value).trim().toLowerCase();
  if (CATEGORIES.includes(v)) return v;
  return detectCategory(mimeType, filename);
}

function collectFiles(req) {
  if (req.file) return [req.file];
  if (Array.isArray(req.files)) return req.files;
  if (req.files && typeof req.files === 'object') {
    return Object.keys(req.files).reduce((acc, k) => acc.concat(req.files[k] || []), []);
  }
  return [];
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function toAssetDto(asset) {
  const a = asset || {};
  return {
    id: a.id || null,
    name: a.name || '未命名素材',
    category: a.category || 'other',
    size: num(a.size),
    url: a.url || '',
    hash: a.hash || '',
    mimeType: a.mimeType || null,
    createdAt: a.createdAt || null,
    updatedAt: a.updatedAt || null,
  };
}

// ===========================================================================
// POST /assets（multipart/form-data，欄位名不限）
// ===========================================================================
async function create(req, res) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) return error(res, 401, '未授權');

    const files = collectFiles(req);
    if (!files.length) return error(res, 400, '未收到檔案（請以 multipart/form-data 上傳）');

    const storage = resolveStorage();
    if (!storage) return error(res, 500, '儲存服務不可用');

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const created = [];

    for (const file of files) {
      const buffer = file.buffer || Buffer.alloc(0);
      const originalName = file.originalname || 'upload.bin';
      const mimeType = file.mimetype || null;

      const saved = await storage.save(buffer, originalName, mimeType);
      const hash = sha256(buffer);
      const fallbackName = String(originalName).replace(/\.[^.]+$/, '').slice(0, 100) || '未命名素材';
      const name = body.name ? String(body.name).slice(0, 100) : fallbackName;
      const category = normalizeCategory(body.category, mimeType, originalName);

      const asset = await prisma.asset.create({
        data: {
          userId,
          name,
          category,
          size: num(saved && saved.size, buffer.length),
          url: (saved && saved.url) || '',
          hash,
          mimeType,
        },
      });
      created.push(toAssetDto(asset));
    }

    // 單檔回物件（最常用）、多檔回 { count, list }（形狀在 API.md 沒定義，這裡明確定義）
    if (created.length === 1) return success(res, created[0], '素材已上傳');
    return success(res, { count: created.length, list: created }, `已上傳 ${created.length} 個素材`);
  } catch (e) {
    console.error(e);
    error(res, 500, '素材上傳失敗');
  }
}

// ===========================================================================
// GET /assets?category=&limit=
// ===========================================================================
async function list(req, res) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) return error(res, 401, '未授權');

    const q = req.query || {};
    const limit = clampInt(q.limit, 1, 200, DEFAULT_LIST_LIMIT);
    const where = { userId };
    const category = String(q.category || '').trim().toLowerCase();
    if (category && category !== 'all') where.category = category;

    const rows = await prisma.asset.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true, name: true, category: true, size: true, url: true,
        hash: true, mimeType: true, createdAt: true, updatedAt: true,
      },
    });

    success(res, {
      total: rows.length,      // 沿用 dramaController 的契約：不額外打 count 查詢
      limit,
      category: where.category || 'all',
      list: rows.map(toAssetDto),
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '獲取素材列表失敗');
  }
}

// ===========================================================================
// DELETE /assets/:id（404 不存在 / 403 不是自己的）
// ===========================================================================
async function remove(req, res) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) return error(res, 401, '未授權');

    const asset = await prisma.asset.findUnique({ where: { id: String(req.params.id) } });
    if (!asset) return error(res, 404, '素材不存在');
    if (asset.userId !== userId) return error(res, 403, '無權刪除此素材');

    // 先刪檔案再刪列；檔案刪不掉不該讓資料列留著
    if (asset.url) {
      try {
        const storage = resolveStorage();
        if (storage) await storage.delete(asset.url);
      } catch (e) {
        console.warn('[assets] 刪除實體檔案失敗（仍會刪除資料列）:', (e && e.message) || e);
      }
    }

    await prisma.asset.delete({ where: { id: asset.id } });
    success(res, { id: asset.id }, '素材已刪除');
  } catch (e) {
    console.error(e);
    error(res, 500, '刪除素材失敗');
  }
}

// ===========================================================================
// POST /assets/sync  { localAssets: [{ id, hash, modifiedAt }] }
// → { toUpload, toDownload, conflicts, ... }（API.md 定義的差異列表）
// ===========================================================================
async function sync(req, res) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) return error(res, 401, '未授權');

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const localAssets = Array.isArray(body.localAssets) ? body.localAssets : [];

    const cloud = await prisma.asset.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true, name: true, category: true, size: true, url: true,
        hash: true, mimeType: true, createdAt: true, updatedAt: true,
      },
    });

    const cloudById = new Map(cloud.map((a) => [a.id, a]));
    const cloudByHash = new Map(cloud.filter((a) => a.hash).map((a) => [a.hash, a]));
    const localHashes = new Set(localAssets.map((l) => l && l.hash).filter(Boolean));

    // 雲端有、本機沒有（用 hash 比對）→ 需要下載
    const toDownload = cloud
      .filter((a) => a.hash && !localHashes.has(a.hash))
      .map(toAssetDto);

    // 本機有、雲端沒有 → 需要上傳（原樣回傳本機描述，讓客戶端自己帶檔案上來）
    const toUpload = [];
    const conflicts = [];
    const inSync = [];

    for (const local of localAssets) {
      if (!local || typeof local !== 'object') continue;
      const entry = {
        localId: local.id || null,
        name: local.name || null,
        hash: local.hash || null,
        size: num(local.size),
        category: local.category || null,
        modifiedAt: local.modifiedAt || null,
      };
      const byId = local.id ? cloudById.get(local.id) : null;
      // 同一個 id 但內容（hash）不同 → 衝突，交由客戶端決定誰贏
      if (byId && local.hash && byId.hash && byId.hash !== local.hash) {
        conflicts.push({ ...entry, serverId: byId.id, serverHash: byId.hash, serverUpdatedAt: byId.updatedAt || null });
        continue;
      }
      if (byId || (local.hash && cloudByHash.has(local.hash))) { inSync.push(entry); continue; }
      toUpload.push(entry);
    }

    success(res, {
      serverTime: new Date().toISOString(),
      counts: {
        server: cloud.length,
        local: localAssets.length,
        toUpload: toUpload.length,
        toDownload: toDownload.length,
        conflicts: conflicts.length,
        inSync: inSync.length,
      },
      toUpload,
      toDownload,
      conflicts,
      inSync,
      // 注意：本機「刪掉了但雲端還在」無法與「從未上傳」區分，所以不做自動刪除。
      toDelete: [],
    });
  } catch (e) {
    console.error(e);
    error(res, 500, '素材同步失敗');
  }
}

module.exports = {
  uploadMiddleware,
  create,
  list,
  remove,
  sync,
  // 給測試用（不是路由需要的）
  _toAssetDto: toAssetDto,
  _detectCategory: detectCategory,
  _normalizeCategory: normalizeCategory,
  _resolveStorage: resolveStorage,
  _collectFiles: collectFiles,
  _limits: { MAX_FILE_SIZE, MAX_FILES, DEFAULT_LIST_LIMIT },
};
