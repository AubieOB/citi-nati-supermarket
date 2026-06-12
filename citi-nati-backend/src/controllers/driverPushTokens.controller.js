const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

async function resolveDriverIdentity(user) {
  const userId = user?.userId || user?.id;
  if (!userId) {
    return null;
  }

  const account = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true },
  });

  if (!account || account.role !== 'driver') {
    return null;
  }

  const driver = await prisma.driver.findUnique({
    where: { email: account.email },
    select: { id: true },
  });

  return {
    userId: account.id,
    driverId: driver?.id || null,
  };
}

const registerDriverPushToken = async (req, res) => {
  try {
    const { token, platform = 'android', deviceId = null, deviceName = null } = req.body || {};

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ success: false, error: 'Push token is required' });
    }

    const identity = await resolveDriverIdentity(req.user);
    if (!identity) {
      return res.status(403).json({ success: false, error: 'Only driver accounts can register driver push tokens' });
    }

    const savedToken = await prisma.mobilePushToken.upsert({
      where: { token },
      update: {
        userId: identity.userId,
        driverId: identity.driverId,
        platform: String(platform || 'android').toLowerCase(),
        app: 'driver',
        deviceId: deviceId ? String(deviceId) : null,
        deviceName: deviceName ? String(deviceName) : null,
        isActive: true,
        lastSeenAt: new Date(),
      },
      create: {
        userId: identity.userId,
        driverId: identity.driverId,
        token,
        platform: String(platform || 'android').toLowerCase(),
        app: 'driver',
        deviceId: deviceId ? String(deviceId) : null,
        deviceName: deviceName ? String(deviceName) : null,
        isActive: true,
      },
    });

    return res.json({
      success: true,
      tokenId: savedToken.id,
      pushEnabled: true,
    });
  } catch (error) {
    logger.errorLog('[DRIVER PUSH] Failed to register token:', { message: error.message });
    return res.status(500).json({ success: false, error: 'Failed to register push token' });
  }
};

const unregisterDriverPushToken = async (req, res) => {
  try {
    const { token } = req.body || {};
    const identity = await resolveDriverIdentity(req.user);

    if (!identity) {
      return res.status(403).json({ success: false, error: 'Only driver accounts can unregister driver push tokens' });
    }

    if (token && typeof token === 'string') {
      await prisma.mobilePushToken.updateMany({
        where: { token, userId: identity.userId, app: 'driver' },
        data: { isActive: false, lastSeenAt: new Date() },
      });
    } else {
      await prisma.mobilePushToken.updateMany({
        where: { userId: identity.userId, app: 'driver' },
        data: { isActive: false, lastSeenAt: new Date() },
      });
    }

    return res.json({ success: true });
  } catch (error) {
    logger.errorLog('[DRIVER PUSH] Failed to unregister token:', { message: error.message });
    return res.status(500).json({ success: false, error: 'Failed to unregister push token' });
  }
};

module.exports = {
  registerDriverPushToken,
  unregisterDriverPushToken,
};
