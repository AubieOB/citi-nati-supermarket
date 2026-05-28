'use strict';

const { PrismaClient } = require('@prisma/client');
const logger = require('../../utils/logger');
const posCommandQueueService = require('../posCommandQueue.service');

const prisma = new PrismaClient();

const BRANCH_DEFAULTS = {
  BLANTYRE: {
    locationId: 1,
    locationCode: 'SH',
    defaultOpenBalanceCode: 1,
    defaultOpenBalanceName: 'OPEN STOCK BALANCES',
  },
  ZOMBA: {
    locationId: 2,
    locationCode: 'SH',
    defaultOpenBalanceCode: 1,
    defaultOpenBalanceName: 'OPEN BALANCES',
  },
};

function normalizeBranchCode(value, options = {}) {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return null;
  if (normalized === 'BT' || normalized === 'BLANTYRE') return 'BLANTYRE';
  if (normalized === 'ZA' || normalized === 'ZOMBA' || normalized === 'SH' || normalized === 'BAR' || normalized === 'ST999') return 'ZOMBA';

  const syncSourceCode = String(options.syncSourceCode || '').trim().toUpperCase();
  if (syncSourceCode.includes('BLANTYRE')) return 'BLANTYRE';
  if (syncSourceCode.includes('ZOMBA')) return 'ZOMBA';

  const locationCode = String(options.locationCode || '').trim().toUpperCase();
  if (locationCode === 'BT' || locationCode === 'BLANTYRE') return 'BLANTYRE';
  if (locationCode === 'ZA' || locationCode === 'ZOMBA' || locationCode === 'SH' || locationCode === 'BAR' || locationCode === 'ST999') return 'ZOMBA';

  return null;
}

function normalizeSupplierName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeSupplierNameKey(value) {
  return normalizeSupplierName(value).toUpperCase();
}

function toOptionalString(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function toRequiredPosString(value) {
  const normalized = String(value || '').trim();
  return normalized;
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function resolveSupplierForPosRecord(tx, branchCode, supplierName) {
  const normalizedName = normalizeSupplierName(supplierName);
  if (!normalizedName) return null;

  const locationId = BRANCH_DEFAULTS[branchCode] ? BRANCH_DEFAULTS[branchCode].locationId : null;

  if (locationId) {
    const scoped = await tx.supplier.findFirst({
      where: {
        locationId,
        name: { equals: normalizedName, mode: 'insensitive' },
      },
    });
    if (scoped) return scoped;
  }

  return tx.supplier.findFirst({
    where: {
      name: { equals: normalizedName, mode: 'insensitive' },
    },
  });
}

async function ingestSuppliersFromPos(payload) {
  const rawBranchCode = payload && payload.branchCode;
  const rawSyncSourceCode = payload && payload.syncSourceCode;
  const rawLocationCode = payload && payload.locationCode;
  const branchCode = normalizeBranchCode(rawBranchCode, {
    syncSourceCode: rawSyncSourceCode,
    locationCode: rawLocationCode,
  });
  if (!branchCode) {
    const error = new Error('branchCode is required and must resolve to BLANTYRE or ZOMBA');
    error.statusCode = 400;
    throw error;
  }

  const suppliers = Array.isArray(payload && payload.suppliers) ? payload.suppliers : [];
  const verboseLogsEnabled = String(process.env.SUPPLIER_SYNC_VERBOSE_LOGS || '').trim().toLowerCase() === 'true';
  const uniquePosSupplierCodes = new Set();
  const uniqueLinkedSupplierIds = new Set();
  const supplierLinkFrequency = new Map();
  const result = {
    branchCode,
    received: suppliers.length,
    linked: 0,
    createdSuppliers: 0,
    updatedSuppliers: 0,
    skipped: 0,
  };

  for (const row of suppliers) {
    const posSupplierCode = parsePositiveInt(row && row.supplierCode);
    const posSupplierName = normalizeSupplierName(row && row.supplierName);

    if (!posSupplierCode || !posSupplierName) {
      result.skipped += 1;
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const existingLinkByPosCode = await tx.supplierPosLink.findUnique({
        where: {
          branchCode_posSupplierCode: {
            branchCode,
            posSupplierCode,
          },
        },
        include: { supplier: true },
      });

      let supplier = existingLinkByPosCode ? existingLinkByPosCode.supplier : null;

      if (!supplier) {
        supplier = await resolveSupplierForPosRecord(tx, branchCode, posSupplierName);
      }

      if (!supplier) {
        supplier = await tx.supplier.create({
          data: {
            name: posSupplierName,
            locationId: BRANCH_DEFAULTS[branchCode] ? BRANCH_DEFAULTS[branchCode].locationId : null,
            contactPerson: toOptionalString(row.contactName),
            phone: toOptionalString(row.telephone),
            email: toOptionalString(row.email),
            address: toOptionalString(row.address),
            status: 'active',
          },
        });
        result.createdSuppliers += 1;
        if (verboseLogsEnabled) {
          logger.debugLog('[BO][SUPPLIER_SYNC][PULL] created website supplier', {
            supplierId: supplier.id,
            branchCode,
            posSupplierCode,
            posSupplierName,
          });
        }
      } else {
        await tx.supplier.update({
          where: { id: supplier.id },
          data: {
            name: posSupplierName,
            contactPerson: toOptionalString(row.contactName) || supplier.contactPerson,
            phone: toOptionalString(row.telephone) || supplier.phone,
            email: toOptionalString(row.email) || supplier.email,
            address: toOptionalString(row.address) || supplier.address,
            locationId: supplier.locationId || (BRANCH_DEFAULTS[branchCode] ? BRANCH_DEFAULTS[branchCode].locationId : null),
          },
        });
        result.updatedSuppliers += 1;
      }

      const conflictingLink = await tx.supplierPosLink.findUnique({
        where: {
          branchCode_posSupplierCode: {
            branchCode,
            posSupplierCode,
          },
        },
        select: { id: true, supplierId: true },
      });

      if (conflictingLink && conflictingLink.supplierId !== supplier.id) {
        await tx.supplierPosLink.update({
          where: { id: conflictingLink.id },
          data: {
            posSupplierCode: null,
            syncStatus: 'failed',
            syncedAt: null,
            syncError: `POS supplier code ${posSupplierCode} reassigned to supplier ${supplier.id}`,
          },
        });

        logger.warnLog('[BO][SUPPLIER_SYNC][PULL] reassigned conflicting POS supplier code', {
          branchCode,
          posSupplierCode,
          fromSupplierId: conflictingLink.supplierId,
          toSupplierId: supplier.id,
        });
      }

      await tx.supplierPosLink.upsert({
        where: {
          supplierId_branchCode: {
            supplierId: supplier.id,
            branchCode,
          },
        },
        create: {
          supplierId: supplier.id,
          branchCode,
          posSupplierCode,
          posSupplierName,
          syncStatus: 'synced',
          syncedAt: new Date(),
          syncError: null,
        },
        update: {
          posSupplierCode,
          posSupplierName,
          syncStatus: 'synced',
          syncedAt: new Date(),
          syncError: null,
        },
      });

      result.linked += 1;
      uniquePosSupplierCodes.add(posSupplierCode);
      uniqueLinkedSupplierIds.add(supplier.id);
      supplierLinkFrequency.set(
        supplier.id,
        Number(supplierLinkFrequency.get(supplier.id) || 0) + 1
      );

      if (verboseLogsEnabled) {
        logger.debugLog('[BO][SUPPLIER_SYNC][PULL] linked supplier', {
          supplierId: supplier.id,
          branchCode,
          posSupplierCode,
          posSupplierName,
        });
      }
    });
  }

  const repeatedSupplierBindings = Array.from(supplierLinkFrequency.entries())
    .filter((entry) => Number(entry[1] || 0) > 1)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0));

  logger.debugLog('[BO][SUPPLIER_SYNC][PULL][SUMMARY]', {
    inputBranchCode: rawBranchCode || null,
    inputSyncSourceCode: rawSyncSourceCode || null,
    inputLocationCode: rawLocationCode || null,
    branchCode,
    received: result.received,
    linked: result.linked,
    createdSuppliers: result.createdSuppliers,
    updatedSuppliers: result.updatedSuppliers,
    skipped: result.skipped,
    uniquePosSupplierCodeCount: uniquePosSupplierCodes.size,
    uniquePosSupplierCodeSample: Array.from(uniquePosSupplierCodes).slice(0, 10),
    uniqueLinkedSupplierCount: uniqueLinkedSupplierIds.size,
    uniqueLinkedSupplierIdSample: Array.from(uniqueLinkedSupplierIds).slice(0, 10),
    repeatedSupplierBindingCount: repeatedSupplierBindings.length,
    repeatedSupplierBindingSample: repeatedSupplierBindings.slice(0, 5).map((entry) => ({
      supplierId: entry[0],
      linkCount: entry[1],
    })),
    verboseLogsEnabled,
  });

  // Detect POS-side deletions: any SupplierPosLink for this branch whose posSupplierCode
  // is no longer present in the incoming set means the supplier was deleted in POS.
  // We soft-deactivate the website supplier and remove the stale link.
  if (uniquePosSupplierCodes.size > 0) {
    const allLinksForBranch = await prisma.supplierPosLink.findMany({
      where: { branchCode },
      select: { id: true, supplierId: true, posSupplierCode: true },
    });

    const staleLinkIds = [];
    const staleSupplierIds = [];

    for (const link of allLinksForBranch) {
      const code = parsePositiveInt(link.posSupplierCode);
      if (code && !uniquePosSupplierCodes.has(code)) {
        staleLinkIds.push(link.id);
        staleSupplierIds.push(link.supplierId);
      }
    }

    if (staleLinkIds.length > 0) {
      await prisma.supplierPosLink.deleteMany({ where: { id: { in: staleLinkIds } } });
      await prisma.supplier.updateMany({
        where: { id: { in: staleSupplierIds } },
        data: { status: 'inactive' },
      });
      logger.warnLog('[BO][SUPPLIER_SYNC][PULL][POS_DELETE_DETECTED]', {
        branchCode,
        staleLinksRemoved: staleLinkIds.length,
        suppliersDeactivated: staleSupplierIds.length,
        staleSupplierIdSample: staleSupplierIds.slice(0, 10),
      });
      result.posDeletedDeactivated = staleLinkIds.length;
    }
  }

  return result;
}

async function queueSupplierPushToPos(supplierId, branchCodeInput, createdBy) {
  const branchCode = normalizeBranchCode(branchCodeInput);
  if (!branchCode) {
    const error = new Error('branchCode is required and must resolve to BLANTYRE or ZOMBA');
    error.statusCode = 400;
    throw error;
  }

  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: {
      posLinks: {
        where: { branchCode },
      },
    },
  });

  if (!supplier) {
    const error = new Error('Supplier not found');
    error.statusCode = 404;
    throw error;
  }

  const existingLink = Array.isArray(supplier.posLinks) ? supplier.posLinks[0] : null;
  if (existingLink && parsePositiveInt(existingLink.posSupplierCode)) {
    return {
      queued: false,
      alreadyLinked: true,
      branchCode,
      supplierId,
      posSupplierCode: existingLink.posSupplierCode,
    };
  }

  const commandPayload = {
    branchCode,
    locationCode: BRANCH_DEFAULTS[branchCode].locationCode,
    supplierId: supplier.id,
    supplierName: normalizeSupplierName(supplier.name),
    address: toRequiredPosString(supplier.address),
    telephone: toRequiredPosString(supplier.phone),
    fax: '',
    email: toRequiredPosString(supplier.email),
    contactName: toRequiredPosString(supplier.contactPerson),
    uploadStatus: 1,
  };

  const queued = await posCommandQueueService.enqueueCommand(
    'CREATE_OR_LINK_SUPPLIER',
    commandPayload,
    {
      source: 'supplier-pos-sync',
      relatedEntityType: 'Supplier',
      relatedEntityId: String(supplier.id),
      createdBy: createdBy || null,
      maxRetries: 3,
    }
  );

  const existingPendingLink = await prisma.supplierPosLink.findFirst({
    where: {
      supplierId: supplier.id,
      branchCode,
    },
    select: { id: true },
  });

  if (existingPendingLink) {
    await prisma.supplierPosLink.update({
      where: { id: existingPendingLink.id },
      data: {
        syncStatus: 'pending',
        syncError: null,
        posSupplierName: normalizeSupplierName(supplier.name),
      },
    });
  } else {
    await prisma.supplierPosLink.create({
      data: {
        supplierId: supplier.id,
        branchCode,
        posSupplierCode: null,
        posSupplierName: normalizeSupplierName(supplier.name),
        syncStatus: 'pending',
        syncedAt: null,
        syncError: null,
      },
    });
  }

  logger.debugLog('[BO][SUPPLIER_SYNC][PUSH] queued supplier push command', {
    commandId: queued.id,
    supplierId: supplier.id,
    branchCode,
    supplierName: supplier.name,
  });

  return {
    queued: true,
    commandId: queued.id,
    branchCode,
    supplierId: supplier.id,
  };
}

async function queueSupplierDeleteFromPos(supplierId) {
  const supplier = await prisma.supplier.findUnique({
    where: { id: supplierId },
    include: { posLinks: true },
  });

  if (!supplier) return { queued: 0, links: [] };

  const links = Array.isArray(supplier.posLinks) ? supplier.posLinks : [];
  const queued = [];

  for (const link of links) {
    const branchCode = normalizeBranchCode(link.branchCode);
    const posSupplierCode = parsePositiveInt(link.posSupplierCode);
    if (!branchCode || !posSupplierCode) continue; // no canonical branch or POS code yet – nothing to delete in POS

    const commandPayload = {
      branchCode,
      locationCode: BRANCH_DEFAULTS[branchCode].locationCode,
      posSupplierCode,
      supplierId: supplier.id,
      supplierName: normalizeSupplierName(supplier.name),
    };

    const command = await posCommandQueueService.enqueueCommand(
      'DELETE_SUPPLIER',
      commandPayload,
      {
        source: 'supplier-pos-sync',
        relatedEntityType: 'Supplier',
        relatedEntityId: String(supplier.id),
        createdBy: null,
        maxRetries: 3,
      }
    );

    logger.debugLog('[BO][SUPPLIER_SYNC][DELETE] queued DELETE_SUPPLIER command', {
      commandId: command.id,
      supplierId: supplier.id,
      branchCode,
      posSupplierCode,
    });

    queued.push({ commandId: command.id, branchCode, posSupplierCode });
  }

  return { queued: queued.length, links: queued };
}

module.exports = {
  normalizeBranchCode,
  ingestSuppliersFromPos,
  queueSupplierPushToPos,
  queueSupplierDeleteFromPos,
};
