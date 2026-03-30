'use strict';

const { generateReportExport } = require('../../services/business-operations/export.service');

async function exportExcel(req, res) {
  try {
    const moduleName = req.body?.module;
    const type = req.body?.type || 'summary';
    const filters = req.body?.filters || {};

    if (!moduleName) {
      return res.status(400).json({ success: false, error: 'module is required' });
    }

    const result = await generateReportExport({
      module: moduleName,
      type,
      filters,
      format: 'excel',
    });

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    return res.send(result.buffer);
  } catch (error) {
    console.error('[BO][EXPORT] exportExcel error:', error);
    return res.status(400).json({ success: false, error: error.message || 'Failed to export Excel report' });
  }
}

async function exportPdf(req, res) {
  try {
    const moduleName = req.body?.module;
    const type = req.body?.type || 'summary';
    const filters = req.body?.filters || {};

    if (!moduleName) {
      return res.status(400).json({ success: false, error: 'module is required' });
    }

    const result = await generateReportExport({
      module: moduleName,
      type,
      filters,
      format: 'pdf',
    });

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
    return res.send(result.buffer);
  } catch (error) {
    console.error('[BO][EXPORT] exportPdf error:', error);
    return res.status(400).json({ success: false, error: error.message || 'Failed to export PDF report' });
  }
}

module.exports = {
  exportExcel,
  exportPdf,
};
