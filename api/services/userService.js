
const prisma = require('../../utils/prisma');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const redis = require('../config/redis');
const JWT_SECRET = process.env.JWT_SECRET || 'julang-dev-secret';

// v6.2 新增：支持前端 SHA-256 密碼（64 位 hex）
// 前端已做 SHA-256，後端再做 bcrypt 二次哈希
async function hashPassword(password) {
  // 檢測是否為前端 SHA-256（64 位 hex）
  const isFrontendHash = /^[a-f0-9]{64}$/i.test(password);
  if (isFrontendHash) {
    return bcrypt.hash(password, 10);
  }
  // 兼容舊版明文密碼（過渡期）
  return bcrypt.hash(password, 10);
}

async function verifyPassword(inputPassword, storedHash) {
  return bcrypt.compare(inputPassword, storedHash);
}

async function register({ phone, password, nickname, inviteCode }) {
  const passwordHash = await hashPassword(password);
  const userInviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const user = await prisma.user.create({
    data: {
      phone,
      passwordHash,
      nickname: nickname || '劇迷',
      inviteCode: userInviteCode,
      invitedBy: inviteCode || null,
    },
  });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  return { userId: user.id, token, expiresIn: 604800 };
}

async function login({ phone, password }) {
  const user = await prisma.user.findUnique({ where: { phone } });
  if (!user || !await verifyPassword(password, user.passwordHash)) {
    throw new Error('帳號或密碼錯誤');
  }
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  return { userId: user.id, token, expiresIn: 604800 };
}

async function getProfile(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('用戶不存在');
  return {
    id: user.id, phone: user.phone, nickname: user.nickname,
    avatar: user.avatar, coins: user.coins, vipLevel: user.vipLevel,
    vipExpireAt: user.vipExpireAt, inviteCode: user.inviteCode,
  };
}

async function getCoins(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { coins: true },
  });
  return { coins: user.coins };
}

async function checkin(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const existing = await prisma.userCheckin.findUnique({
    where: { userId_checkinDate: { userId, checkinDate: today } },
  });
  if (existing) throw new Error('今日已簽到');
  const lastCheckin = await prisma.userCheckin.findFirst({
    where: { userId },
    orderBy: { checkinDate: 'desc' },
  });
  const isConsecutive = lastCheckin &&
    (today.getTime() - lastCheckin.checkinDate.getTime()) === 86400000;
  const streakDays = isConsecutive ? lastCheckin.streakDays + 1 : 1;
  const coinsEarned = Math.min(10 + (streakDays - 1) * 2, 50);
  await prisma.userCheckin.create({
    data: { userId, checkinDate: today, streakDays, coinsEarned },
  });
  await prisma.user.update({
    where: { id: userId },
    data: { coins: { increment: coinsEarned } },
  });
  const updated = await prisma.user.findUnique({
    where: { id: userId },
    select: { coins: true },
  });
  return { coinsEarned, streakDays, totalCoins: updated.coins };
}

module.exports = { register, login, getProfile, getCoins, checkin };
