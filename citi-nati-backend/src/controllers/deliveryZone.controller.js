const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeText(value) {
  return String(value || '').trim();
}

function serializeZone(zone) {
  return {
    ...zone,
    deliveryFee: zone.deliveryFee == null ? null : Number(zone.deliveryFee),
  };
}

function validateZonePayload(payload, { partial = false } = {}) {
  const district = normalizeText(payload.district);
  const area = normalizeText(payload.area);

  if (!partial || payload.district !== undefined) {
    if (!district) return { valid: false, error: 'District is required.' };
  }

  if (!partial || payload.area !== undefined) {
    if (!area) return { valid: false, error: 'Area is required.' };
  }

  const latitude = parseOptionalNumber(payload.latitude);
  const longitude = parseOptionalNumber(payload.longitude);
  const radiusKm = parseOptionalNumber(payload.radiusKm);
  const deliveryFee = parseOptionalNumber(payload.deliveryFee);

  if (Number.isNaN(latitude) || Number.isNaN(longitude) || Number.isNaN(radiusKm) || Number.isNaN(deliveryFee)) {
    return { valid: false, error: 'Latitude, longitude, radiusKm, and deliveryFee must be valid numbers when provided.' };
  }

  if (latitude != null && (latitude < -90 || latitude > 90)) {
    return { valid: false, error: 'Latitude must be between -90 and 90.' };
  }

  if (longitude != null && (longitude < -180 || longitude > 180)) {
    return { valid: false, error: 'Longitude must be between -180 and 180.' };
  }

  if (radiusKm != null && radiusKm <= 0) {
    return { valid: false, error: 'Radius must be greater than 0.' };
  }

  if (deliveryFee != null && deliveryFee < 0) {
    return { valid: false, error: 'Delivery fee cannot be negative.' };
  }

  return {
    valid: true,
    district,
    area,
    latitude,
    longitude,
    radiusKm,
    deliveryFee,
  };
}

const getDeliveryZoneOptions = async (req, res) => {
  try {
    const zones = await prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: [{ district: 'asc' }, { area: 'asc' }],
    });

    const grouped = zones.reduce((acc, zone) => {
      const district = zone.district;
      if (!acc[district]) {
        acc[district] = [];
      }
      acc[district].push(serializeZone(zone));
      return acc;
    }, {});

    const districts = Object.keys(grouped).map((district) => ({
      district,
      areas: grouped[district],
    }));

    return res.status(200).json({ zones: districts });
  } catch (error) {
    console.error('Error fetching delivery zone options:', error);
    return res.status(500).json({ error: 'Failed to fetch delivery zones.' });
  }
};

const getAdminDeliveryZones = async (req, res) => {
  try {
    const zones = await prisma.deliveryZone.findMany({
      orderBy: [{ district: 'asc' }, { area: 'asc' }],
    });

    return res.status(200).json({ zones: zones.map(serializeZone) });
  } catch (error) {
    console.error('Error fetching delivery zones:', error);
    return res.status(500).json({ error: 'Failed to fetch delivery zones.' });
  }
};

const createDeliveryZone = async (req, res) => {
  try {
    const validation = validateZonePayload(req.body);
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const zone = await prisma.deliveryZone.create({
      data: {
        district: validation.district,
        area: validation.area,
        isActive: req.body.isActive !== undefined ? Boolean(req.body.isActive) : true,
        latitude: validation.latitude,
        longitude: validation.longitude,
        radiusKm: validation.radiusKm,
        deliveryFee: validation.deliveryFee,
      },
    });

    return res.status(201).json({ zone: serializeZone(zone) });
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'A delivery zone with this district and area already exists.' });
    }

    console.error('Error creating delivery zone:', error);
    return res.status(500).json({ error: 'Failed to create delivery zone.' });
  }
};

const updateDeliveryZone = async (req, res) => {
  try {
    const zoneId = Number(req.params.id);
    if (!Number.isFinite(zoneId)) {
      return res.status(400).json({ error: 'Valid zone id is required.' });
    }

    const validation = validateZonePayload(req.body, { partial: true });
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error });
    }

    const data = {};

    if (req.body.district !== undefined) data.district = validation.district;
    if (req.body.area !== undefined) data.area = validation.area;
    if (req.body.isActive !== undefined) data.isActive = Boolean(req.body.isActive);
    if (req.body.latitude !== undefined) data.latitude = validation.latitude;
    if (req.body.longitude !== undefined) data.longitude = validation.longitude;
    if (req.body.radiusKm !== undefined) data.radiusKm = validation.radiusKm;
    if (req.body.deliveryFee !== undefined) data.deliveryFee = validation.deliveryFee;

    const zone = await prisma.deliveryZone.update({
      where: { id: zoneId },
      data,
    });

    return res.status(200).json({ zone: serializeZone(zone) });
  } catch (error) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Delivery zone not found.' });
    }

    if (error?.code === 'P2002') {
      return res.status(409).json({ error: 'A delivery zone with this district and area already exists.' });
    }

    console.error('Error updating delivery zone:', error);
    return res.status(500).json({ error: 'Failed to update delivery zone.' });
  }
};

const setDeliveryZoneActive = async (req, res) => {
  try {
    const zoneId = Number(req.params.id);
    if (!Number.isFinite(zoneId)) {
      return res.status(400).json({ error: 'Valid zone id is required.' });
    }

    const zone = await prisma.deliveryZone.update({
      where: { id: zoneId },
      data: { isActive: Boolean(req.body?.isActive) },
    });

    return res.status(200).json({ zone: serializeZone(zone) });
  } catch (error) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Delivery zone not found.' });
    }

    console.error('Error updating delivery zone status:', error);
    return res.status(500).json({ error: 'Failed to update delivery zone status.' });
  }
};

const deleteDeliveryZone = async (req, res) => {
  try {
    const zoneId = Number(req.params.id);
    if (!Number.isFinite(zoneId)) {
      return res.status(400).json({ error: 'Valid zone id is required.' });
    }

    await prisma.deliveryZone.delete({ where: { id: zoneId } });

    return res.status(200).json({ message: 'Delivery zone deleted successfully.' });
  } catch (error) {
    if (error?.code === 'P2025') {
      return res.status(404).json({ error: 'Delivery zone not found.' });
    }

    console.error('Error deleting delivery zone:', error);
    return res.status(500).json({ error: 'Failed to delete delivery zone.' });
  }
};

module.exports = {
  getDeliveryZoneOptions,
  getAdminDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  setDeliveryZoneActive,
  deleteDeliveryZone,
};
