/**
 * productImageMapping.service.js
 *
 * Persistent product image mapping layer.
 * Ties Cloudinary image assets to POS ProductCode (sourceCode) so images
 * survive product row deletion, POS full rebuilds, and re-syncs.
 *
 * Design rules:
 *  - ProductCode is the STABLE key; product row IDs are ephemeral.
 *  - Deleting a product row must NOT erase the mapping here.
 *  - Only an explicit "permanent delete image" call removes the mapping + Cloudinary asset.
 *  - POS sync calls reattachImageByProductCode() to restore the image link automatically.
 */

const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const cloudinary = require('cloudinary').v2;

const prisma = new PrismaClient();

/**
 * Normalise a product code to a consistent trimmed uppercase string.
 */
function normalizeProductCode(value) {
  const s = String(value || '').trim();
  return s || null;
}

/**
 * Save (upsert) an image mapping for a productCode.
 * Call this after a successful Cloudinary upload.
 *
 * @param {object} params
 * @param {string} params.productCode   POS ProductCode / sourceCode
 * @param {string} params.cloudinaryPublicId
 * @param {string} params.secureUrl     Cloudinary https URL
 * @param {string} [params.originalFilename]
 * @param {string} [params.uploadedBy]  admin email / actor
 * @param {string} [params.altText]
 * @returns {Promise<object>} saved mapping record
 */
async function saveImageMapping({ productCode, cloudinaryPublicId, secureUrl, originalFilename, uploadedBy, altText }) {
  const code = normalizeProductCode(productCode);
  if (!code) throw new Error('productCode is required for image mapping');
  if (!cloudinaryPublicId || !secureUrl) throw new Error('cloudinaryPublicId and secureUrl are required');

  const record = await prisma.productImageMapping.upsert({
    where: { productCode: code },
    update: {
      cloudinaryPublicId,
      imageUrl: secureUrl,
      secureUrl,
      originalFilename: originalFilename || null,
      uploadedBy: uploadedBy || null,
      altText: altText || null,
      updatedAt: new Date(),
    },
    create: {
      productCode: code,
      cloudinaryPublicId,
      imageUrl: secureUrl,
      secureUrl,
      originalFilename: originalFilename || null,
      isPrimary: true,
      displayOrder: 0,
      uploadedBy: uploadedBy || null,
      altText: altText || null,
    },
  });

  logger.debugLog('[ProductImageMapping] ✅ Mapping saved for productCode:', code, '→', secureUrl);
  return record;
}

/**
 * Look up an existing image mapping by productCode.
 *
 * @param {string} productCode
 * @returns {Promise<object|null>} mapping record or null
 */
async function getImageMapping(productCode) {
  const code = normalizeProductCode(productCode);
  if (!code) return null;
  return prisma.productImageMapping.findUnique({ where: { productCode: code } });
}

/**
 * Look up image mappings for many productCodes at once (for bulk reattachment).
 *
 * @param {string[]} productCodes
 * @returns {Promise<Map<string, object>>} map of productCode -> mapping record
 */
async function getImageMappingsBulk(productCodes) {
  const codes = Array.from(new Set(productCodes.map(normalizeProductCode).filter(Boolean)));
  if (!codes.length) return new Map();

  const rows = await prisma.productImageMapping.findMany({
    where: { productCode: { in: codes } },
  });

  const map = new Map();
  rows.forEach((row) => map.set(row.productCode, row));
  return map;
}

/**
 * Reattach a saved image to a product row using its productCode / sourceCode.
 * Call this from POS sync after create or update to restore lost images.
 *
 * @param {string} productCodeOrSourceCode
 * @returns {Promise<string|null>} the secureUrl if reattached, or null
 */
async function reattachImageByProductCode(productCodeOrSourceCode) {
  const code = normalizeProductCode(productCodeOrSourceCode);
  if (!code) return null;

  const mapping = await prisma.productImageMapping.findUnique({ where: { productCode: code } });
  if (!mapping) return null;

  // Update all branch-scoped product rows sharing this sourceCode.
  try {
    await prisma.product.updateMany({
      where: { sourceCode: code },
      data: { image: mapping.secureUrl },
    });
    logger.debugLog('[ProductImageMapping] 🔄 Image reattached for productCode:', code);
    return mapping.secureUrl;
  } catch (err) {
    // Product row may not exist yet during sync; that is expected.
    logger.warnLog('[ProductImageMapping] Could not reattach image for', code, ':', err.message);
    return null;
  }
}

/**
 * Bulk reattach images for a list of product codes after a POS sync.
 * Returns counts of matched+updated vs unmatched.
 *
 * @param {string[]} productCodes
 * @returns {Promise<{matched: number, unmatched: number, errors: string[]}>}
 */
async function bulkReattachImages(productCodes) {
  const codes = Array.from(new Set(productCodes.map(normalizeProductCode).filter(Boolean)));
  if (!codes.length) return { matched: 0, unmatched: 0, errors: [] };

  const mappings = await getImageMappingsBulk(codes);
  let matched = 0;
  let unmatched = 0;
  const errors = [];

  await Promise.all(
    codes.map(async (code) => {
      const mapping = mappings.get(code);
      if (!mapping) {
        unmatched += 1;
        return;
      }
      try {
        await prisma.product.updateMany({
          where: { sourceCode: code },
          data: { image: mapping.secureUrl },
        });
        matched += 1;
      } catch (err) {
        errors.push(`${code}: ${err.message}`);
        unmatched += 1;
      }
    })
  );

  logger.debugLog(`[ProductImageMapping] Bulk reattach complete: ${matched} matched, ${unmatched} unmatched`);
  return { matched, unmatched, errors };
}

/**
 * Permanently delete an image mapping AND its Cloudinary asset.
 * This is intentional, explicit deletion — NOT triggered by product row deletion.
 *
 * @param {string} productCode
 * @returns {Promise<{success: boolean, cloudinaryResult?: object, error?: string}>}
 */
async function permanentlyDeleteImageMapping(productCode) {
  const code = normalizeProductCode(productCode);
  if (!code) return { success: false, error: 'productCode is required' };

  const mapping = await prisma.productImageMapping.findUnique({ where: { productCode: code } });
  if (!mapping) return { success: false, error: 'No image mapping found for this productCode' };

  // Delete Cloudinary asset
  let cloudinaryResult = null;
  try {
    cloudinaryResult = await cloudinary.uploader.destroy(mapping.cloudinaryPublicId);
    logger.debugLog('[ProductImageMapping] Cloudinary asset deleted:', mapping.cloudinaryPublicId, cloudinaryResult);
  } catch (cloudErr) {
    logger.errorLog('[ProductImageMapping] Cloudinary delete failed:', { message: cloudErr && cloudErr.message ? cloudErr.message : String(cloudErr) });
    // Continue: still remove the DB mapping even if Cloudinary call fails
  }

  // Remove DB mapping
  await prisma.productImageMapping.delete({ where: { productCode: code } });

  // Clear the image on the product row if it still exists
  try {
    await prisma.product.updateMany({
      where: { sourceCode: code },
      data: { image: null },
    });
  } catch (_) {
    // Product row may not exist; fine.
  }

  logger.debugLog('[ProductImageMapping] 🗑️ Permanently deleted mapping for productCode:', code);
  return { success: true, cloudinaryResult };
}

/**
 * Reconcile all existing product rows that lack an image against the
 * mapping table. Reattaches any available mappings.
 * Used after bulk POS rebuilds.
 *
 * @returns {Promise<{processed: number, matched: number, unmatched: number}>}
 */
async function reconcileAllProductImages() {
  // Only POS products (have sourceCode) can be reconciled from the mapping table
  const products = await prisma.product.findMany({
    where: { image: null, sourceCode: { not: null } },
    select: { id: true, sourceCode: true },
  });

  if (!products.length) {
    return { processed: 0, matched: 0, unmatched: 0 };
  }

  const codes = products.map((p) => normalizeProductCode(p.sourceCode)).filter(Boolean);
  const { matched, unmatched, errors } = await bulkReattachImages(codes);

  if (errors.length) {
    logger.warnLog('[ProductImageMapping] Reconcile errors:', errors);
  }

  return { processed: products.length, matched, unmatched };
}

module.exports = {
  saveImageMapping,
  getImageMapping,
  getImageMappingsBulk,
  reattachImageByProductCode,
  bulkReattachImages,
  permanentlyDeleteImageMapping,
  reconcileAllProductImages,
};
