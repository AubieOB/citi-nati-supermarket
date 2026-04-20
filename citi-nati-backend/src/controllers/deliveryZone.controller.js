const { PrismaClient } = require('@prisma/client');
const {
  MALAWI_LOCATION_MASTER,
  normalizeLocationName,
  getAllMalawiDistricts,
  getAreasForDistrict,
  resolveCanonicalDistrictName,
  resolveCanonicalAreaName,
} = require('../data/malawiLocations');

const prisma = new PrismaClient();

function parseOptionalNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeText(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function serializeZone(zone) {
  return {
    ...zone,
    deliveryFee: zone.deliveryFee == null ? null : Number(zone.deliveryFee),
  };
}

function toTitleCase(value) {
  return normalizeText(value)
    .split(' ')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function districtSortIndex(masterOrder, districtName) {
  const normalized = normalizeLocationName(districtName);
  return masterOrder.indexOf(normalized);
}

function normalizeZoneNames({ district, area, allowCustomArea = false }) {
  const districtInput = normalizeText(district);
  const areaInput = normalizeText(area);

  if (!districtInput) {
    return { ok: false, error: 'District is required.' };
  }

  const canonicalDistrict = resolveCanonicalDistrictName(districtInput);
  if (!canonicalDistrict) {
    return { ok: false, error: 'Please select a valid Malawi district from the list.' };
  }

  if (!areaInput) {
    return { ok: false, error: 'Area is required.' };
  }

  const canonicalArea = resolveCanonicalAreaName(canonicalDistrict, areaInput);
  if (canonicalArea) {
    return {
      ok: true,
      district: canonicalDistrict,
      area: canonicalArea,
      isCustomArea: false,
    };
  }

  if (!allowCustomArea) {
    return { ok: false, error: 'Please select a predefined area for the selected district.' };
  }

  return {
    ok: true,
    district: canonicalDistrict,
    area: toTitleCase(areaInput),
    isCustomArea: true,
  };
}

async function findZoneByDistrictAreaInsensitive(district, area, excludeId = null) {
  return prisma.deliveryZone.findFirst({
    where: {
      district: { equals: district, mode: 'insensitive' },
      area: { equals: area, mode: 'insensitive' },
      ...(excludeId != null ? { id: { not: excludeId } } : {}),
    },
  });
}

function validateZonePayload(payload, { partial = false } = {}) {
  const district = payload.district;
  const area = payload.area;
  const allowCustomArea = Boolean(payload.allowCustomArea);

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

  let normalizedNames = null;
  if (!partial || payload.district !== undefined || payload.area !== undefined) {
    normalizedNames = normalizeZoneNames({
      district,
      area,
      allowCustomArea,
    });

    if (!normalizedNames.ok) {
      return { valid: false, error: normalizedNames.error };
    }
  }

  return {
    valid: true,
    district: normalizedNames?.district,
    area: normalizedNames?.area,
    isCustomArea: normalizedNames?.isCustomArea || false,
    latitude,
    longitude,
    radiusKm,
    deliveryFee,
  };
}

function getMasterDistrictAreaCounts() {
  const districtCount = MALAWI_LOCATION_MASTER.length;
  const areaCount = MALAWI_LOCATION_MASTER.reduce((acc, entry) => acc + entry.areas.length, 0);
  return { districtCount, areaCount };
}

const getDeliveryLocationMaster = async (req, res) => {
  try {
    const { districtCount, areaCount } = getMasterDistrictAreaCounts();
    return res.status(200).json({
      districts: MALAWI_LOCATION_MASTER,
      districtCount,
      areaCount,
      source: 'curated-static-malawi-master',
    });
  } catch (error) {
    console.error('Error fetching delivery location master:', error);
    return res.status(500).json({ error: 'Failed to fetch Malawi location master data.' });
  }
};

const getDeliveryZoneOptions = async (req, res) => {
  try {
    const activeZones = await prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: [{ district: 'asc' }, { area: 'asc' }],
    });

    const districtMap = new Map();

    for (const zone of activeZones) {
      const canonicalDistrict = resolveCanonicalDistrictName(zone.district) || normalizeText(zone.district);
      const districtKey = normalizeLocationName(canonicalDistrict);
      if (!districtMap.has(districtKey)) {
        districtMap.set(districtKey, { district: canonicalDistrict, areas: [] });
      }
      districtMap.get(districtKey).areas.push(serializeZone(zone));
    }

    const masterOrder = getAllMalawiDistricts().map((district) => normalizeLocationName(district));
    const districts = Array.from(districtMap.values()).sort((a, b) => {
      const idxA = districtSortIndex(masterOrder, a.district);
      const idxB = districtSortIndex(masterOrder, b.district);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return a.district.localeCompare(b.district);
    });

    const districtCount = districts.length;
    const activeAreaCount = activeZones.length;

    const districtAreaStats = districts.map((entry) => ({
      district: entry.district,
      activeAreaCount: entry.areas.length,
    }));

    return res.status(200).json({
      zones: districts,
      districtCount,
      activeAreaCount,
      districtAreaStats,
    });
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
    const activeAreaCount = zones.filter((zone) => zone.isActive).length;
    const districtCount = new Set(zones.map((zone) => normalizeLocationName(zone.district))).size;

    return res.status(200).json({
      zones: zones.map(serializeZone),
      districtCount,
      activeAreaCount,
    });
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

    const existing = await findZoneByDistrictAreaInsensitive(validation.district, validation.area);
    if (existing) {
      return res.status(409).json({ error: 'A delivery zone with this district and area already exists.' });
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

    const current = await prisma.deliveryZone.findUnique({ where: { id: zoneId } });
    if (!current) {
      return res.status(404).json({ error: 'Delivery zone not found.' });
    }

    if (req.body.district !== undefined || req.body.area !== undefined) {
      data.district = validation.district;
      data.area = validation.area;

      const existing = await findZoneByDistrictAreaInsensitive(data.district, data.area, zoneId);
      if (existing) {
        return res.status(409).json({ error: 'A delivery zone with this district and area already exists.' });
      }
    }
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
  getDeliveryLocationMaster,
  getDeliveryZoneOptions,
  getAdminDeliveryZones,
  createDeliveryZone,
  updateDeliveryZone,
  setDeliveryZoneActive,
  deleteDeliveryZone,
};
