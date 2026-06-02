const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { getVatSettings } = require('../utils/vat');
const { getEmergencySalesDayOpen } = require('../utils/emergencySalesAccess');
const { getMinimumOrderValue } = require('../utils/checkoutRules');

const router = express.Router();
const prisma = new PrismaClient();
const logger = require('../utils/logger');

const MAINTENANCE_MODE_KEY = 'maintenance_mode_enabled';
const MAINTENANCE_MESSAGE_KEY = 'maintenance_mode_message';
const DEFAULT_MAINTENANCE_MESSAGE = 'We are currently carrying out maintenance to improve your experience. We apologize for the inconvenience.';

const getSettingValue = async (key, fallbackValue) => {
  const setting = await prisma.siteSetting.findUnique({ where: { key } });
  return setting ? setting.value : fallbackValue;
};

router.get('/status', async (req, res) => {
  try {
    const [maintenanceEnabled, maintenanceMessage, vatSettings, emergencySalesDayOpen, minimumOrderValue] = await Promise.all([
      getSettingValue(MAINTENANCE_MODE_KEY, 'false'),
      getSettingValue(MAINTENANCE_MESSAGE_KEY, DEFAULT_MAINTENANCE_MESSAGE),
      getVatSettings(),
      getEmergencySalesDayOpen(prisma),
      getMinimumOrderValue(prisma),
    ]);

    return res.json({
      success: true,
      maintenanceMode: maintenanceEnabled === 'true',
      maintenanceMessage,
      vatEnabled: vatSettings.enabled,
      vatRatePercent: vatSettings.ratePercent,
      configuredVatRatePercent: vatSettings.configuredRatePercent,
      minimumOrderValue,
      emergencySalesDayOpen,
    });
  } catch (err) {
    logger.errorLog('[SYSTEM] Failed to fetch public status:', { message: err.message });
    return res.status(500).json({ success: false, error: 'Failed to fetch system status' });
  }
});

module.exports = router;
