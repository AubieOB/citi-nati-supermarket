const express = require('express');
const { PrismaClient } = require('@prisma/client');

const router = express.Router();
const prisma = new PrismaClient();

const MAINTENANCE_MODE_KEY = 'maintenance_mode_enabled';
const MAINTENANCE_MESSAGE_KEY = 'maintenance_mode_message';
const DEFAULT_MAINTENANCE_MESSAGE = 'We are currently carrying out maintenance to improve your experience. We apologize for the inconvenience.';

const getSettingValue = async (key, fallbackValue) => {
  const setting = await prisma.siteSetting.findUnique({ where: { key } });
  return setting ? setting.value : fallbackValue;
};

router.get('/status', async (req, res) => {
  try {
    const [maintenanceEnabled, maintenanceMessage] = await Promise.all([
      getSettingValue(MAINTENANCE_MODE_KEY, 'false'),
      getSettingValue(MAINTENANCE_MESSAGE_KEY, DEFAULT_MAINTENANCE_MESSAGE),
    ]);

    return res.json({
      success: true,
      maintenanceMode: maintenanceEnabled === 'true',
      maintenanceMessage,
    });
  } catch (err) {
    console.error('[SYSTEM] Failed to fetch public status:', err.message);
    return res.status(500).json({ success: false, error: 'Failed to fetch system status' });
  }
});

module.exports = router;
