const { syncProductsFromPOS, setPosSyncEnabled, getRuntimeConfig } = require('../services/posSync.service');
const { getPosSyncMonitorSnapshot, listPosSyncEvents, recordPosSyncEvent } = require('../services/posSyncMonitor.service');

async function getPosSyncMonitor(req, res) {
  try {
    const data = await getPosSyncMonitorSnapshot({
      hours: req.query.hours,
      limit: req.query.limit,
      locationCode: req.query.locationCode,
      branchCode: req.query.branchCode,
    });
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[ADMIN POS SYNC] Failed to load monitor snapshot:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load POS sync monitor data' });
  }
}

async function getPosSyncEvents(req, res) {
  try {
    const events = await listPosSyncEvents({
      limit: req.query.limit,
      locationCode: req.query.locationCode,
      branchCode: req.query.branchCode,
    });
    return res.json({ success: true, events });
  } catch (error) {
    console.error('[ADMIN POS SYNC] Failed to load events:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to load POS sync events' });
  }
}

async function togglePosSync(req, res) {
  try {
    const updatedEnabled = await setPosSyncEnabled(Boolean(req.body?.enabled));
    const config = await getRuntimeConfig();

    await recordPosSyncEvent({
      eventType: 'toggle',
      source: 'admin-dashboard',
      status: 'success',
      level: 'info',
      title: `POS sync ${updatedEnabled ? 'enabled' : 'disabled'}`,
      message: `An admin ${updatedEnabled ? 'enabled' : 'disabled'} POS sync from the monitoring panel.`,
      suggestion: updatedEnabled
        ? 'Watch the live feed to confirm healthy activity resumes.'
        : 'Re-enable POS sync only after the underlying agent or connectivity issue has been resolved.',
      metadata: {
        updatedBy: req.user?.email || req.user?.id || 'admin',
      },
    });

    return res.json({
      success: true,
      message: `POS sync ${updatedEnabled ? 'enabled' : 'disabled'} successfully`,
      config,
    });
  } catch (error) {
    console.error('[ADMIN POS SYNC] Failed to toggle POS sync:', error.message);
    return res.status(500).json({ success: false, error: 'Failed to update POS sync setting' });
  }
}

async function runManualPosSync(req, res) {
  try {
    const result = await syncProductsFromPOS();
    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error || 'Manual POS sync failed' });
    }

    return res.json({
      success: true,
      message: 'Manual POS sync completed successfully',
      result,
    });
  } catch (error) {
    console.error('[ADMIN POS SYNC] Manual sync failed:', error.message);
    return res.status(500).json({ success: false, error: 'Manual POS sync failed' });
  }
}

module.exports = {
  getPosSyncMonitor,
  getPosSyncEvents,
  togglePosSync,
  runManualPosSync,
};