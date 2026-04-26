'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function modelHasField(modelName, fieldName) {
  try {
    const model = prisma?._runtimeDataModel?.models?.[modelName];
    return Array.isArray(model?.fields) && model.fields.some((field) => field.name === fieldName);
  } catch (_error) {
    return false;
  }
}

const supplierHasLocation = modelHasField('Supplier', 'locationId');
const supplierHasPosLinks = modelHasField('Supplier', 'posLinks');
const supplierTransactionHasLocation = modelHasField('SupplierTransaction', 'locationId');

function resolveBranchCodeAliases(branchCode) {
  const normalized = String(branchCode || '').trim().toUpperCase();
  if (!normalized) return [];

  if (normalized === 'BLANTYRE' || normalized === 'BT') {
    return ['BLANTYRE', 'BT'];
  }

  if (normalized === 'ZOMBA' || normalized === 'ZA' || normalized === 'SH' || normalized === 'BAR' || normalized === 'ST999') {
    return ['ZOMBA', 'ZA', 'SH', 'BAR', 'ST999'];
  }

  return [normalized];
}

function resolveBranchLocationFallbackIds(branchCode) {
  const normalized = String(branchCode || '').trim().toUpperCase();
  if (normalized === 'BLANTYRE' || normalized === 'BT') {
    return [1];
  }

  if (normalized === 'ZOMBA' || normalized === 'ZA' || normalized === 'SH' || normalized === 'BAR' || normalized === 'ST999') {
    return [2];
  }

  return [];
}

function buildBranchCodeInsensitiveOr(branchAliases = []) {
  return branchAliases
    .map((alias) => String(alias || '').trim())
    .filter(Boolean)
    .map((alias) => ({
      branchCode: {
        equals: alias,
        mode: 'insensitive',
      },
    }));
}

function normalizeSupplierStatus(status) {
  if (!status) return 'active';
  return String(status).toLowerCase();
}

function normalizeSupplierCode(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

async function createSupplier(payload) {
  const normalizedSupplierCode = normalizeSupplierCode(payload.supplierCode);
  let supplierCodeForCreate = normalizedSupplierCode;

  if (normalizedSupplierCode) {
    const existingByCode = await prisma.supplier.findUnique({ where: { supplierCode: normalizedSupplierCode } });
    if (existingByCode) {
      const existingLocationId = supplierHasLocation ? Number(existingByCode.locationId || 0) : 0;
      const requestedLocationId = supplierHasLocation ? Number(payload.locationId || 0) : 0;
      const isSameLocation = existingLocationId === requestedLocationId;

      if (!isSameLocation && supplierHasLocation) {
        // Current schema keeps supplier_code globally unique. To allow the same
        // supplier to be created in multiple locations, we create the new row
        // without supplierCode when the code already exists in another location.
        supplierCodeForCreate = null;
      } else {
        const error = new Error(
          'Supplier code "' + normalizedSupplierCode + '" already exists on supplier "' + existingByCode.name + '". Use a different supplier code.'
        );
        error.statusCode = 409;
        throw error;
      }
    }
  }

  const createData = {
    supplierCode: supplierCodeForCreate,
    name: payload.name,
    contactPerson: payload.contactPerson || null,
    phone: payload.phone || null,
    email: payload.email || null,
    address: payload.address || null,
    openingBalance: payload.openingBalance || 0,
    status: normalizeSupplierStatus(payload.status),
    notes: payload.notes || null,
  };

  if (supplierHasLocation && payload.locationId !== undefined) {
    createData.locationId = payload.locationId || null;
  }

  return prisma.supplier.create({
    data: createData,
  });
}

async function updateSupplier(id, payload) {
  const updateData = {
    supplierCode: payload.supplierCode,
    name: payload.name,
    contactPerson: payload.contactPerson,
    phone: payload.phone,
    email: payload.email,
    address: payload.address,
    openingBalance: payload.openingBalance,
    status: payload.status ? normalizeSupplierStatus(payload.status) : undefined,
    notes: payload.notes,
  };

  if (supplierHasLocation && payload.locationId !== undefined) {
    updateData.locationId = payload.locationId;
  }

  return prisma.supplier.update({
    where: { id },
    data: updateData,
  });
}

async function getSupplierById(id) {
  return prisma.supplier.findUnique({
    where: { id },
    include: supplierHasPosLinks
      ? { posLinks: { orderBy: { branchCode: 'asc' } } }
      : undefined,
  });
}

async function listSuppliers({ search, status, locationId, branchCode, requirePosLinked = false, skip, take, sortBy, sortOrder }) {
  const where = {};
  let branchAliasesForDiagnostics = [];
  let fallbackLocationIdsForDiagnostics = [];

  // Default to active suppliers so archived/soft-deleted suppliers stay out of normal selectors.
  where.status = status ? String(status).toLowerCase() : 'active';

  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { supplierCode: { contains: search, mode: 'insensitive' } },
      { contactPerson: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search, mode: 'insensitive' } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  if (locationId && supplierHasLocation) {
    where.locationId = locationId;
  }

  if (supplierHasPosLinks) {
    if (branchCode) {
      const branchAliases = resolveBranchCodeAliases(branchCode);
      branchAliasesForDiagnostics = branchAliases.slice();
      const branchCodeInsensitiveOr = buildBranchCodeInsensitiveOr(branchAliases);
      const posLinkFilter = {
        posLinks: {
          some: {
            ...(branchCodeInsensitiveOr.length > 0 ? { OR: branchCodeInsensitiveOr } : {}),
            ...(requirePosLinked ? { posSupplierCode: { not: null } } : {}),
          },
        },
      };

      if (requirePosLinked || !supplierHasLocation) {
        where.posLinks = posLinkFilter.posLinks;
      } else {
        const fallbackLocationIds = resolveBranchLocationFallbackIds(branchCode);
        fallbackLocationIdsForDiagnostics = fallbackLocationIds.slice();
        where.AND = where.AND || [];
        where.AND.push({
          OR: [
            posLinkFilter,
            ...(fallbackLocationIds.length > 0 ? [{ locationId: { in: fallbackLocationIds } }] : []),
          ],
        });
      }
    } else if (requirePosLinked) {
      where.posLinks = {
        some: {
          posSupplierCode: { not: null },
        },
      };
    }
  }

  const [data, total] = await Promise.all([
    prisma.supplier.findMany({
      where,
      include: supplierHasPosLinks
        ? { posLinks: { orderBy: { branchCode: 'asc' } } }
        : undefined,
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.supplier.count({ where }),
  ]);

  if (branchCode && total === 0 && supplierHasPosLinks) {
    const aliasCounts = await Promise.all(
      branchAliasesForDiagnostics.map(async (alias) => {
        const count = await prisma.supplierPosLink.count({
          where: {
            branchCode: {
              equals: alias,
              mode: 'insensitive',
            },
            ...(requirePosLinked ? { posSupplierCode: { not: null } } : {}),
          },
        });
        return { alias, count };
      })
    );

    let locationFallbackSupplierCount = null;
    if (!requirePosLinked && supplierHasLocation && fallbackLocationIdsForDiagnostics.length > 0) {
      locationFallbackSupplierCount = await prisma.supplier.count({
        where: {
          locationId: { in: fallbackLocationIdsForDiagnostics },
        },
      });
    }

    console.warn('[BO][SUPPLIERS][LIST][ZERO_RESULTS]', {
      branchCode: String(branchCode || '').trim().toUpperCase(),
      requirePosLinked: Boolean(requirePosLinked),
      search: search || null,
      status: status || null,
      requestedLocationId: locationId || null,
      branchAliases: branchAliasesForDiagnostics,
      aliasLinkCounts: aliasCounts,
      fallbackLocationIds: fallbackLocationIdsForDiagnostics,
      fallbackLocationSupplierCount: locationFallbackSupplierCount,
    });
  }

  if (!data.length) {
    return { data, total, where };
  }

  const supplierIds = data.map((supplier) => supplier.id);
  const transactionAggregates = await prisma.supplierTransaction.groupBy({
    by: ['supplierId', 'transactionType'],
    where: { supplierId: { in: supplierIds } },
    _sum: { amount: true },
  });

  const totalsBySupplierId = new Map();

  transactionAggregates.forEach((row) => {
    const current = totalsBySupplierId.get(row.supplierId) || {
      totalDebt: 0,
      totalPaid: 0,
      totalAdjustment: 0,
    };
    const amount = Number(row._sum.amount || 0);

    if (row.transactionType === 'debt') current.totalDebt += amount;
    if (row.transactionType === 'payment') current.totalPaid += amount;
    if (row.transactionType === 'adjustment') current.totalAdjustment += amount;

    totalsBySupplierId.set(row.supplierId, current);
  });

  const enrichedData = data.map((supplier) => {
    const totals = totalsBySupplierId.get(supplier.id) || {
      totalDebt: 0,
      totalPaid: 0,
      totalAdjustment: 0,
    };

    return {
      ...supplier,
      currentBalance: Number(supplier.openingBalance || 0) + totals.totalDebt - totals.totalPaid + totals.totalAdjustment,
    };
  });

  return { data: enrichedData, total, where };
}

async function createSupplierTransaction(payload) {
  const createData = {
    supplierId: payload.supplierId,
    reportingPeriodId: payload.reportingPeriodId || null,
    transactionDate: payload.transactionDate,
    transactionType: payload.transactionType,
    paymentMethod: payload.paymentMethod || null,
    amount: payload.amount,
    description: payload.description || null,
    referenceNo: payload.referenceNo || null,
    enteredBy: payload.enteredBy || null,
  };

  if (supplierTransactionHasLocation && payload.locationId !== undefined) {
    createData.locationId = payload.locationId || null;
  }

  return prisma.supplierTransaction.create({
    data: createData,
  });
}

async function updateSupplierTransaction(id, payload) {
  const updateData = {
    reportingPeriodId: payload.reportingPeriodId,
    transactionDate: payload.transactionDate,
    transactionType: payload.transactionType,
    paymentMethod: payload.paymentMethod,
    amount: payload.amount,
    description: payload.description,
    referenceNo: payload.referenceNo,
    enteredBy: payload.enteredBy,
  };

  if (supplierTransactionHasLocation && payload.locationId !== undefined) {
    updateData.locationId = payload.locationId;
  }

  return prisma.supplierTransaction.update({
    where: { id },
    data: updateData,
  });
}

async function listSupplierTransactions({
  supplierId,
  reportingPeriodId,
  transactionType,
  paymentMethod,
  locationId,
  startDate,
  endDate,
  search,
  skip,
  take,
  sortBy,
  sortOrder,
}) {
  const where = {};

  if (supplierId) where.supplierId = supplierId;
  if (reportingPeriodId) where.reportingPeriodId = reportingPeriodId;
  if (transactionType) where.transactionType = transactionType;
  if (paymentMethod) where.paymentMethod = paymentMethod;
  if (locationId) {
    if (supplierTransactionHasLocation) {
      where.locationId = locationId;
    } else if (supplierHasLocation) {
      where.supplier = { locationId };
    }
  }
  if (startDate || endDate) {
    where.transactionDate = {};
    if (startDate) where.transactionDate.gte = startDate;
    if (endDate) where.transactionDate.lte = endDate;
  }
  if (search) {
    where.OR = [
      { description: { contains: search, mode: 'insensitive' } },
      { referenceNo: { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.supplierTransaction.findMany({
      where,
      include: { supplier: true },
      skip,
      take,
      orderBy: { [sortBy]: sortOrder },
    }),
    prisma.supplierTransaction.count({ where }),
  ]);

  return { data, total, where };
}

async function getSupplierBalanceSummary(supplierId) {
  const [supplier, txAgg] = await Promise.all([
    prisma.supplier.findUnique({ where: { id: supplierId } }),
    prisma.supplierTransaction.groupBy({
      by: ['transactionType'],
      where: { supplierId },
      _sum: { amount: true },
    }),
  ]);

  if (!supplier) {
    return null;
  }

  let totalDebt = 0;
  let totalPaid = 0;
  let totalAdjustment = 0;

  txAgg.forEach((row) => {
    const amount = Number(row._sum.amount || 0);
    if (row.transactionType === 'debt') totalDebt += amount;
    if (row.transactionType === 'payment') totalPaid += amount;
    if (row.transactionType === 'adjustment') totalAdjustment += amount;
  });

  const openingBalance = Number(supplier.openingBalance || 0);
  const outstandingBalance = openingBalance + totalDebt - totalPaid + totalAdjustment;

  return {
    supplier,
    summary: {
      openingBalance,
      totalDebt,
      totalPaid,
      totalAdjustment,
      outstandingBalance,
    },
  };
}

async function bulkUpsertSuppliers(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    const name = row.name ? String(row.name).trim() : '';
    if (!name) {
      result.skipped += 1;
      continue;
    }

    const supplierCode = row.supplierCode ? String(row.supplierCode).trim() : null;
    const openingBalance = Number(row.openingBalance || 0);

    if (supplierCode) {
      const existing = await prisma.supplier.findUnique({ where: { supplierCode } });
      if (existing) {
        await prisma.supplier.update({
          where: { id: existing.id },
          data: {
            name,
            contactPerson: row.contactPerson || null,
            phone: row.phone || null,
            email: row.email || null,
            address: row.address || null,
            openingBalance,
            status: normalizeSupplierStatus(row.status),
            notes: row.notes || null,
          },
        });
        result.updated += 1;
      } else {
        await prisma.supplier.create({
          data: {
            supplierCode,
            name,
            contactPerson: row.contactPerson || null,
            phone: row.phone || null,
            email: row.email || null,
            address: row.address || null,
            openingBalance,
            status: normalizeSupplierStatus(row.status),
            notes: row.notes || null,
          },
        });
        result.inserted += 1;
      }
      continue;
    }

    const existingByName = await prisma.supplier.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });

    if (existingByName) {
      await prisma.supplier.update({
        where: { id: existingByName.id },
        data: {
          contactPerson: row.contactPerson || existingByName.contactPerson,
          phone: row.phone || existingByName.phone,
          email: row.email || existingByName.email,
          address: row.address || existingByName.address,
          openingBalance,
          status: normalizeSupplierStatus(row.status),
          notes: row.notes || existingByName.notes,
        },
      });
      result.updated += 1;
    } else {
      await prisma.supplier.create({
        data: {
          supplierCode: null,
          name,
          contactPerson: row.contactPerson || null,
          phone: row.phone || null,
          email: row.email || null,
          address: row.address || null,
          openingBalance,
          status: normalizeSupplierStatus(row.status),
          notes: row.notes || null,
        },
      });
      result.inserted += 1;
    }
  }

  return result;
}

async function bulkImportSupplierTransactions(records = []) {
  const result = { inserted: 0, updated: 0, skipped: 0 };

  for (const row of records) {
    const supplierCode = row.supplierCode ? String(row.supplierCode).trim() : null;
    const supplierName = row.supplierName ? String(row.supplierName).trim() : null;
    const amount = Number(row.amount);
    const transactionDate = row.transactionDate ? new Date(row.transactionDate) : null;
    const transactionType = row.transactionType ? String(row.transactionType).toLowerCase().trim() : null;

    if (!Number.isFinite(amount) || !transactionDate || isNaN(transactionDate.getTime()) || !transactionType) {
      result.skipped += 1;
      continue;
    }

    let supplier = null;

    if (supplierCode) {
      supplier = await prisma.supplier.findUnique({ where: { supplierCode } });
    }

    if (!supplier && supplierName) {
      supplier = await prisma.supplier.findFirst({
        where: { name: { equals: supplierName, mode: 'insensitive' } },
      });
    }

    if (!supplier) {
      result.skipped += 1;
      continue;
    }

    const existing = await prisma.supplierTransaction.findFirst({
      where: {
        supplierId: supplier.id,
        transactionType,
        amount,
        referenceNo: row.referenceNo || null,
      },
    });

    const payload = {
      supplierId: supplier.id,
      reportingPeriodId: row.reportingPeriodId || null,
      transactionDate,
      transactionType,
      paymentMethod: row.paymentMethod || null,
      amount,
      description: row.description || null,
      referenceNo: row.referenceNo || null,
      enteredBy: row.enteredBy || 'excel-import',
    };

    if (existing) {
      await prisma.supplierTransaction.update({ where: { id: existing.id }, data: payload });
      result.updated += 1;
    } else {
      await prisma.supplierTransaction.create({ data: payload });
      result.inserted += 1;
    }
  }

  return result;
}

async function deleteSupplier(id) {
  const supplier = await prisma.supplier.findUnique({
    where: { id },
    include: supplierHasPosLinks
      ? { posLinks: true }
      : undefined,
  });

  if (!supplier) {
    const error = new Error('Supplier not found');
    error.statusCode = 404;
    throw error;
  }

  if (String(supplier.status || '').toLowerCase() === 'inactive') {
    return {
      supplier: await prisma.supplier.update({
        where: { id },
        data: {
          notes: supplier.notes || null,
        },
      }),
      wasAlreadyInactive: true,
      wasPosLinked: Array.isArray(supplier.posLinks) && supplier.posLinks.some((link) => Number(link.posSupplierCode || 0) > 0),
      posLinkCount: Array.isArray(supplier.posLinks) ? supplier.posLinks.length : 0,
    };
  }

  const softDeleteMarker = '[SOFT_DELETED]';
  const currentNotes = String(supplier.notes || '');
  const hasSoftDeleteMarker = currentNotes.indexOf(softDeleteMarker) >= 0;
  const nextNotes = hasSoftDeleteMarker
    ? currentNotes
    : (currentNotes ? `${currentNotes}\n${softDeleteMarker}` : softDeleteMarker);

  const updatedSupplier = await prisma.supplier.update({
    where: { id },
    data: {
      status: 'inactive',
      notes: nextNotes,
    },
  });

  return {
    supplier: updatedSupplier,
    wasAlreadyInactive: false,
    wasPosLinked: Array.isArray(supplier.posLinks) && supplier.posLinks.some((link) => Number(link.posSupplierCode || 0) > 0),
    posLinkCount: Array.isArray(supplier.posLinks) ? supplier.posLinks.length : 0,
  };
}

async function deleteSupplierTransaction(id) {
  return prisma.supplierTransaction.delete({ where: { id } });
}

module.exports = {
  createSupplier,
  updateSupplier,
  getSupplierById,
  listSuppliers,
  deleteSupplier,
  createSupplierTransaction,
  updateSupplierTransaction,
  listSupplierTransactions,
  deleteSupplierTransaction,
  getSupplierBalanceSummary,
  bulkUpsertSuppliers,
  bulkImportSupplierTransactions,
};
