/* ===== 認證控制器 (v7.2) =====
 *
 * 契約來自 api/routes/auth.js：
 *   registerSchema / loginSchema / register / login / refresh
 *
 * 注意：`validate(authController.registerSchema)` 是在**路由定義時**執行的，
 * 而 validate() 對沒有 `.safeParse` 的東西會直接丟 TypeError —— 所以這兩個
 * schema 必須是真正的 zod schema，否則整個 server 起不來。
 *
 * 手機號刻意**不綁**中國格式（^1[3-9]\d{9}$）：劇浪是 zh-TW 產品，用寬鬆規則
 * （6–20 位、只允許數字與 + - 空白括號）。
 */
const { z } = require('zod');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const prisma = require('../utils/prisma');
const { success, error } = require('../utils/response');

const JWT_SECRET = process.env.JWT_SECRET || 'julang-dev-secret';
const JWT_EXPIRES_IN = '7d';
const BCRYPT_ROUNDS = 10;

const registerSchema = z.object({
  phone: z.string().trim().min(6, '手機號至少 6 位').max(20).regex(/^[0-9+\-\s()]+$/, '手機號格式不正確'),
  password: z.string().min(6, '密碼至少 6 位').max(64),
  nickname: z.string().trim().min(1).max(20).optional(),
  inviteCode: z.string().trim().max(16).optional(),
});

const loginSchema = z.object({
  phone: z.string().trim().min(1),
  password: z.string().min(1),
});

// 任何回給客戶端的 user 物件都必須走這裡，避免 passwordHash 外洩
function publicUser(u) {
  return {
    id: u.id,
    phone: u.phone,
    nickname: u.nickname,
    avatar: u.avatar,
    coins: u.coins,
    vipLevel: u.vipLevel,
    isCreator: u.isCreator,
    inviteCode: u.inviteCode,
    createdAt: u.createdAt,
  };
}

function signToken(user) {
  return jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

// 8 碼邀請碼（inviteCode 是 required + unique，沒有 DB 預設值）
function newInviteCode() {
  return 'JL' + crypto.randomBytes(4).toString('hex').toUpperCase();
}

// POST /auth/register
async function register(req, res) {
  try {
    const { phone, password, nickname, inviteCode } = req.body;

    const exists = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (exists) return error(res, 409, '此手機號已註冊');

    // 邀請碼無效**不該擋註冊**，只是不記錄推薦人
    let invitedBy = null;
    if (inviteCode) {
      const inviter = await prisma.user.findUnique({ where: { inviteCode }, select: { id: true } });
      if (inviter) invitedBy = inviter.id;
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const data = { phone, passwordHash, inviteCode: newInviteCode() };
    if (nickname) data.nickname = nickname;
    if (invitedBy) data.invitedBy = invitedBy;

    const user = await prisma.user.create({ data });
    success(res, { token: signToken(user), user: publicUser(user) }, '註冊成功');
  } catch (e) {
    console.error(e);
    error(res, 500, '註冊失敗');
  }
}

// POST /auth/login
async function login(req, res) {
  try {
    const { phone, password } = req.body;
    const user = await prisma.user.findUnique({ where: { phone } });
    // 帳號不存在與密碼錯誤回同一個訊息，避免帳號列舉
    if (!user) return error(res, 401, '手機號或密碼錯誤');
    if (user.status !== 1) return error(res, 403, '帳號已停用');

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return error(res, 401, '手機號或密碼錯誤');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    success(res, { token: signToken(user), user: publicUser(user) }, '登入成功');
  } catch (e) {
    console.error(e);
    error(res, 500, '登入失敗');
  }
}

// POST /auth/refresh（已由 auth middleware 驗過舊 token）
async function refresh(req, res) {
  try {
    const userId = req.user && req.user.userId;
    if (!userId) return error(res, 401, '未授權');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, status: true },
    });
    if (!user || user.status !== 1) return error(res, 401, '帳號不存在或已被停用');
    success(res, { token: signToken(user) }, '已更新憑證');
  } catch (e) {
    console.error(e);
    error(res, 500, '更新憑證失敗');
  }
}

module.exports = {
  register,
  login,
  refresh,
  registerSchema,
  loginSchema,
  // 匯出給測試用（不是路由需要的）
  _publicUser: publicUser,
};
