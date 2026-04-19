'use strict';

const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const { resetImportedBusinessOperationsData } = require('../../services/business-operations/adminReset.service');
const { wipeAllBusinessOperationsData } = require('../../services/business-operations/adminReset.service');

const prisma = new PrismaClient();

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

async function resetImportedData(req, res) {
  try {
    const dryRun = parseBoolean(req.body?.dryRun ?? req.query?.dryRun, true);
    const confirm = parseBoolean(req.body?.confirm ?? req.query?.confirm, false);
    const preserveExpenseCategories = parseBoolean(
      req.body?.preserveExpenseCategories ?? req.query?.preserveExpenseCategories,
      true
    );
    const pruneUnusedExpenseCategories = parseBoolean(
      req.body?.pruneUnusedExpenseCategories ?? req.query?.pruneUnusedExpenseCategories,
      false
    );

    if (!dryRun && !confirm) {
      return res.status(400).json({
        success: false,
        message: 'Execution blocked. Set confirm=true to run destructive cleanup.',
        dryRun,
      });
    }

    const actor = req.user?.email || String(req.user?.userId || req.user?.id || 'admin');

    const result = await resetImportedBusinessOperationsData({
      dryRun,
      preserveExpenseCategories,
      pruneUnusedExpenseCategories,
      actor,
    });

    return res.status(200).json(result);
  } catch (error) {
    console.error('[BO][RESET] Failed', {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to reset imported business operations data',
      error: error.message,
    });
  }
}

module.exports = {
  resetImportedData,
  wipeAllData,
};

async function wipeAllData(req, res) {
  try {
    const securityKey = String(req.body?.securityKey || '').trim();
    if (!securityKey) {
      return res.status(400).json({ success: false, message: 'Admin security key is required.' });
    }

    const adminUser = await prisma.user.findUnique({
      where: { id: req.user?.userId },
      select: { adminSecurityKeyHash: true, email: true },
    });

    if (!adminUser) {
      return res.status(404).json({ success: false, message: 'Admin user not found.' });
    }

    if (!adminUser.adminSecurityKeyHash) {
      return res.status(400).json({ success: false, message: 'No admin security key configured.' });
    }

    const valid = await bcrypt.compare(securityKey, adminUser.adminSecurityKeyHash);
    if (!valid) {
      return res.status(403).json({ success: false, message: 'Invalid admin security key.' });
    }

    const actor = adminUser.email || String(req.user?.userId || 'admin');
    const result = await wipeAllBusinessOperationsData({ actor });

    return res.status(200).json({
      success: true,
      message: 'Business Operations data wiped successfully (sales reports data preserved).',
      result,
    });
  } catch (error) {
    console.error('[BO][WIPE] Failed', {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      message: 'Failed to wipe Business Operations data',
      error: error.message,
    });
  }
}
