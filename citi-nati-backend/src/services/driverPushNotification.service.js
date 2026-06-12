const admin = require('firebase-admin');
const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();
const recentSends = new Map();

function readServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
  }

  if (process.env.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    const decoded = Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf8');
    return JSON.parse(decoded);
  }

  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }

  return null;
}

function getFirebaseApp() {
  if (admin.apps.length) {
    return admin.apps[0];
  }

  const serviceAccount = readServiceAccount();
  if (serviceAccount) {
    return admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  return null;
}

function shouldSend(key) {
  const now = Date.now();
  for (const [dedupeKey, expiresAt] of recentSends.entries()) {
    if (expiresAt <= now) {
      recentSends.delete(dedupeKey);
    }
  }

  if (recentSends.has(key)) {
    return false;
  }

  recentSends.set(key, now + 5000);
  return true;
}

function stringifyData(data) {
  return Object.fromEntries(
    Object.entries(data).map(([key, value]) => [key, value === undefined || value === null ? '' : String(value)]),
  );
}

function orderTitle(eventName) {
  return eventName === 'orderAssigned' ? 'New delivery assigned' : 'Delivery updated';
}

function orderBody(order) {
  const orderId = order?.id || 'delivery';
  const status = order?.status ? String(order.status).replace(/_/g, ' ') : 'Update available';
  const address = order?.deliveryAddress || order?.houseNumber || '';
  return [`Order #${orderId}`, status, address].filter(Boolean).join(' - ');
}

async function deactivateInvalidTokens(tokens, responses) {
  const invalidTokens = [];
  responses.forEach((response, index) => {
    const code = response.error?.code;
    if (
      code === 'messaging/invalid-registration-token' ||
      code === 'messaging/registration-token-not-registered'
    ) {
      invalidTokens.push(tokens[index]);
    }
  });

  if (invalidTokens.length) {
    await prisma.mobilePushToken.updateMany({
      where: { token: { in: invalidTokens } },
      data: { isActive: false },
    });
  }
}

async function sendDriverOrderPush(eventName, driverId, order) {
  try {
    const firebaseApp = getFirebaseApp();
    if (!firebaseApp) {
      logger.debugLog('[DRIVER PUSH] Firebase credentials not configured; push skipped.');
      return;
    }

    if (!driverId) {
      return;
    }

    const dedupeKey = `${eventName}:${driverId}:${order?.id || 'unknown'}:${order?.status || 'unknown'}`;
    if (!shouldSend(dedupeKey)) {
      return;
    }

    const tokenRows = await prisma.mobilePushToken.findMany({
      where: {
        driverId,
        app: 'driver',
        isActive: true,
      },
      select: { token: true },
    });
    const tokens = [...new Set(tokenRows.map(row => row.token).filter(Boolean))];

    if (!tokens.length) {
      logger.debugLog(`[DRIVER PUSH] No active mobile tokens for driver ${driverId}.`);
      return;
    }

    const response = await admin.messaging().sendEachForMulticast({
      tokens,
      notification: {
        title: orderTitle(eventName),
        body: orderBody(order),
      },
      data: stringifyData({
        type: eventName === 'orderAssigned' ? 'driver_order_assigned' : 'driver_order_updated',
        eventName,
        orderId: order?.id,
        driverId,
        status: order?.status,
        total: order?.total,
        deliveryAddress: order?.deliveryAddress,
        latitude: order?.latitude,
        longitude: order?.longitude,
      }),
      android: {
        priority: 'high',
        notification: {
          channelId: 'driver-deliveries',
          sound: 'default',
          color: '#0638DC',
        },
      },
    });

    await deactivateInvalidTokens(tokens, response.responses);
    logger.debugLog(`[DRIVER PUSH] Sent ${response.successCount}/${tokens.length} ${eventName} push messages.`);
  } catch (error) {
    logger.errorLog('[DRIVER PUSH] Push send failed:', { message: error.message });
  }
}

module.exports = {
  sendDriverOrderPush,
};
