'use strict';

const locationsService = require('../../services/business-operations/locations.service');

async function listBusinessLocations(_req, res) {
  try {
    const data = await locationsService.getBusinessLocations();
    return res.json({ success: true, data });
  } catch (error) {
    console.error('[BO][LOCATIONS] listBusinessLocations error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch business locations' });
  }
}

module.exports = {
  listBusinessLocations,
};
