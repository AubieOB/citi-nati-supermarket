const { ingestReportingBatch } = require('../services/reportingSyncIngest.service');

exports.backfillSales = async (req, res) => {
  try {
    const payload = req.body || {};
    const invoices = Array.isArray(payload.invoices) ? payload.invoices : [];
    const metadata = typeof payload.metadata === 'object' && payload.metadata !== null ? payload.metadata : {};

    if (!Array.isArray(payload.invoices)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request payload',
        details: ['invoices must be an array'],
      });
    }

    const requiredMetadataFields = ['branchCode', 'branchName', 'syncSourceCode'];
    const missingMetadataFields = requiredMetadataFields.filter((field) => !metadata[field]);

    if (missingMetadataFields.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'Missing backfill metadata',
        details: missingMetadataFields.map((field) => `${field} is required in metadata`),
      });
    }

    const reportingPayload = {
      ...metadata,
      invoices,
      syncedAt: metadata.syncedAt || new Date().toISOString(),
    };

    const result = await ingestReportingBatch(reportingPayload);

    return res.json({
      success: true,
      receivedInvoices: result.receivedInvoices,
      storedInvoices: result.storedInvoices + result.updatedInvoices,
      insertedInvoices: result.storedInvoices,
      updatedInvoices: result.updatedInvoices,
      storedDetails: result.storedDetails + result.updatedDetails,
      insertedDetails: result.storedDetails,
      updatedDetails: result.updatedDetails,
      skippedInvoices: result.skippedInvoices,
      syncSourceCode: result.syncSourceCode,
    });
  } catch (error) {
    console.error('[BACKFILL ERROR] Failed to process backfill batch:', error.message || error);
    return res.status(500).json({
      success: false,
      error: 'Failed to process backfill invoices',
      details: error.message ? error.message : String(error),
    });
  }
};