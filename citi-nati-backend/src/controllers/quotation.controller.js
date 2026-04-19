const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');
const { getVatSettings, splitInclusiveVatAtRate } = require('../utils/vat');

const prisma = new PrismaClient();

function toMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function generateQuotationRef() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `QT-${yyyy}${mm}${dd}-${suffix}`;
}

function withVatMeta(quotation, vatSettings) {
  if (!quotation) return quotation;

  const normalizedRate = Number(vatSettings?.configuredRatePercent || 0);
  const vatEnabled = Boolean(vatSettings?.enabled);
  const ratePercent = vatEnabled ? normalizedRate : 0;
  const split = splitInclusiveVatAtRate(Number(quotation.total || 0), ratePercent, {
    vatEnabled,
    configuredVatRatePercent: normalizedRate,
  });

  return {
    ...quotation,
    vatEnabled,
    vatRatePercent: split.vatRatePercent,
    configuredVatRatePercent: normalizedRate,
    vatAmount: split.vatAmount,
  };
}

/**
 * POST /api/admin/quotations
 * Create a new quotation (system products or fully custom).
 */
const createQuotation = async (req, res) => {
  try {
    const {
      clientName,
      clientEmail,
      clientPhone,
      clientAddress,
      notes,
      discount = 0,
      validUntil,
      items,
    } = req.body;

    if (!clientName || typeof clientName !== 'string' || !clientName.trim()) {
      return res.status(400).json({ error: 'clientName is required' });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'At least one item is required' });
    }

    const sanitizedItems = items.map((item, idx) => {
      const qty = parseInt(item.qty, 10);
      const unitPrice = toMoney(item.unitPrice);
      if (!item.productName || typeof item.productName !== 'string' || !item.productName.trim()) {
        throw new Error(`Item ${idx + 1}: productName is required`);
      }
      if (!Number.isInteger(qty) || qty < 1) {
        throw new Error(`Item ${idx + 1}: qty must be a positive integer`);
      }
      if (unitPrice < 0) {
        throw new Error(`Item ${idx + 1}: unitPrice must be >= 0`);
      }
      return {
        productId: item.productId ? parseInt(item.productId, 10) : null,
        productName: String(item.productName).trim(),
        description: item.description ? String(item.description).trim() : null,
        qty,
        unitPrice,
        lineTotal: toMoney(qty * unitPrice),
      };
    });

    const subtotal = toMoney(sanitizedItems.reduce((sum, i) => sum + i.lineTotal, 0));
    const discountValue = toMoney(discount);
    const total = toMoney(Math.max(0, subtotal - discountValue));

    const quotation = await prisma.quotation.create({
      data: {
        quotationRef: generateQuotationRef(),
        clientName: String(clientName).trim(),
        clientEmail: clientEmail ? String(clientEmail).trim() : null,
        clientPhone: clientPhone ? String(clientPhone).trim() : null,
        clientAddress: clientAddress ? String(clientAddress).trim() : null,
        notes: notes ? String(notes).trim() : null,
        subtotal,
        discount: discountValue,
        total,
        validUntil: validUntil ? new Date(validUntil) : null,
        createdBy: req.user?.email || req.user?.id || 'admin',
        items: {
          create: sanitizedItems,
        },
      },
      include: { items: true },
    });

    const vatSettings = await getVatSettings();

    return res.status(201).json({ success: true, quotation: withVatMeta(quotation, vatSettings) });
  } catch (err) {
    if (err.message && err.message.startsWith('Item ')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[QUOTATION] Create error:', err.message);
    return res.status(500).json({ error: 'Failed to create quotation' });
  }
};

/**
 * GET /api/admin/quotations
 * List all quotations, newest first.
 */
const listQuotations = async (req, res) => {
  try {
    const { search, limit, offset = 0 } = req.query;
    const where = {};
    if (search) {
      where.OR = [
        { clientName: { contains: String(search), mode: 'insensitive' } },
        { quotationRef: { contains: String(search), mode: 'insensitive' } },
      ];
    }

    const queryOptions = {
      where,
      orderBy: { createdAt: 'desc' },
      include: { items: true },
      skip: parseInt(offset, 10) || 0,
    };
    if (limit) queryOptions.take = parseInt(limit, 10);

    const [quotations, total, vatSettings] = await Promise.all([
      prisma.quotation.findMany(queryOptions),
      prisma.quotation.count({ where }),
      getVatSettings(),
    ]);

    return res.json({ quotations: quotations.map((quotation) => withVatMeta(quotation, vatSettings)), total });
  } catch (err) {
    console.error('[QUOTATION] List error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch quotations' });
  }
};

/**
 * GET /api/admin/quotations/:id
 * Get a single quotation with all items.
 */
const getQuotation = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const quotation = await prisma.quotation.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!quotation) return res.status(404).json({ error: 'Quotation not found' });

    const vatSettings = await getVatSettings();

    return res.json({ quotation: withVatMeta(quotation, vatSettings) });
  } catch (err) {
    console.error('[QUOTATION] Get error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch quotation' });
  }
};

/**
 * PUT /api/admin/quotations/:id
 * Update an existing quotation.
 */
const updateQuotation = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Quotation not found' });

    const {
      clientName,
      clientEmail,
      clientPhone,
      clientAddress,
      notes,
      discount = 0,
      validUntil,
      items,
    } = req.body;

    const sanitizedItems = Array.isArray(items) && items.length > 0
      ? items.map((item, idx) => {
          const qty = parseInt(item.qty, 10);
          const unitPrice = toMoney(item.unitPrice);
          if (!item.productName?.trim()) throw new Error(`Item ${idx + 1}: productName required`);
          if (!Number.isInteger(qty) || qty < 1) throw new Error(`Item ${idx + 1}: invalid qty`);
          return {
            productId: item.productId ? parseInt(item.productId, 10) : null,
            productName: String(item.productName).trim(),
            description: item.description ? String(item.description).trim() : null,
            qty,
            unitPrice,
            lineTotal: toMoney(qty * unitPrice),
          };
        })
      : null;

    const subtotal = sanitizedItems
      ? toMoney(sanitizedItems.reduce((sum, i) => sum + i.lineTotal, 0))
      : existing.subtotal;
    const discountValue = toMoney(discount);
    const total = toMoney(Math.max(0, subtotal - discountValue));

    // Delete old items and recreate if provided
    if (sanitizedItems) {
      await prisma.quotationItem.deleteMany({ where: { quotationId: id } });
    }

    const quotation = await prisma.quotation.update({
      where: { id },
      data: {
        ...(clientName && { clientName: String(clientName).trim() }),
        clientEmail: clientEmail !== undefined ? (clientEmail ? String(clientEmail).trim() : null) : undefined,
        clientPhone: clientPhone !== undefined ? (clientPhone ? String(clientPhone).trim() : null) : undefined,
        clientAddress: clientAddress !== undefined ? (clientAddress ? String(clientAddress).trim() : null) : undefined,
        notes: notes !== undefined ? (notes ? String(notes).trim() : null) : undefined,
        subtotal,
        discount: discountValue,
        total,
        validUntil: validUntil !== undefined ? (validUntil ? new Date(validUntil) : null) : undefined,
        ...(sanitizedItems && {
          items: { create: sanitizedItems },
        }),
      },
      include: { items: true },
    });

    const vatSettings = await getVatSettings();

    return res.json({ success: true, quotation: withVatMeta(quotation, vatSettings) });
  } catch (err) {
    if (err.message && err.message.startsWith('Item ')) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[QUOTATION] Update error:', err.message);
    return res.status(500).json({ error: 'Failed to update quotation' });
  }
};

/**
 * DELETE /api/admin/quotations/:id
 */
const deleteQuotation = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(400).json({ error: 'Invalid id' });

    const existing = await prisma.quotation.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Quotation not found' });

    await prisma.quotation.delete({ where: { id } });
    return res.json({ success: true });
  } catch (err) {
    console.error('[QUOTATION] Delete error:', err.message);
    return res.status(500).json({ error: 'Failed to delete quotation' });
  }
};

module.exports = {
  createQuotation,
  listQuotations,
  getQuotation,
  updateQuotation,
  deleteQuotation,
};
