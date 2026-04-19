const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { generateToken } = require('../utils/jwt');
const { getClientIp, getUserAgent } = require('../utils/requestContext');

const prisma = new PrismaClient();

const ACCESS_COOKIE_NAME = 'auth_token';
const REFRESH_COOKIE_NAME = 'refresh_token';
const ACCESS_TOKEN_TTL = process.env.JWT_ACCESS_TOKEN_EXPIRY || '1h';
const REFRESH_TOKEN_TTL_DAYS = Math.max(1, parseInt(process.env.JWT_REFRESH_TOKEN_DAYS || '30', 10) || 30);

function getCookieOptions(maxAgeMs) {
  const isProduction = process.env.NODE_ENV === 'production';

  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}

function getAccessCookieOptions() {
  return getCookieOptions(60 * 60 * 1000);
}

function getRefreshCookieOptions() {
  return getCookieOptions(REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

function buildAccessToken(user) {
  return generateToken(user.id, user.role, user.email, {
    expiresIn: ACCESS_TOKEN_TTL,
    tokenType: 'access',
  });
}

function generateRefreshTokenValue() {
  return crypto.randomBytes(48).toString('hex');
}

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

async function revokeAllUserRefreshTokens(userId) {
  await prisma.refreshToken.updateMany({
    where: {
      userId,
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

async function createRefreshToken(user, req) {
  const refreshToken = generateRefreshTokenValue();
  const refreshTokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

  await revokeAllUserRefreshTokens(user.id);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: refreshTokenHash,
      expiresAt,
      ipAddress: getClientIp(req),
      userAgent: getUserAgent(req),
    },
  });

  return refreshToken;
}

async function issueAuthSession(res, user, req) {
  const accessToken = buildAccessToken(user);
  const refreshToken = await createRefreshToken(user, req);

  res.cookie(ACCESS_COOKIE_NAME, accessToken, getAccessCookieOptions());
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions());

  return {
    accessToken,
    refreshToken,
  };
}

function issueAccessTokenCookie(res, user) {
  const accessToken = buildAccessToken(user);
  res.cookie(ACCESS_COOKIE_NAME, accessToken, getAccessCookieOptions());
  return accessToken;
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE_NAME, {
    ...getAccessCookieOptions(),
    maxAge: undefined,
  });
  res.clearCookie(REFRESH_COOKIE_NAME, {
    ...getRefreshCookieOptions(),
    maxAge: undefined,
  });
}

async function revokeRefreshTokenFromRequest(req) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!refreshToken) {
    return;
  }

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: hashRefreshToken(refreshToken),
      revokedAt: null,
    },
    data: {
      revokedAt: new Date(),
    },
  });
}

async function consumeRefreshToken(req) {
  const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!refreshToken) {
    return null;
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const tokenRecord = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: {
      user: true,
    },
  });

  if (!tokenRecord || tokenRecord.revokedAt || tokenRecord.expiresAt <= new Date()) {
    return null;
  }

  if (!tokenRecord.user || !tokenRecord.user.isActive) {
    return null;
  }

  await prisma.refreshToken.update({
    where: { tokenHash },
    data: {
      revokedAt: new Date(),
      lastUsedAt: new Date(),
    },
  });

  return tokenRecord.user;
}

module.exports = {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  issueAuthSession,
  issueAccessTokenCookie,
  clearAuthCookies,
  revokeRefreshTokenFromRequest,
  revokeAllUserRefreshTokens,
  consumeRefreshToken,
};