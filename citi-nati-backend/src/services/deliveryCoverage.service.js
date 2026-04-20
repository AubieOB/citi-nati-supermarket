const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const EARTH_RADIUS_KM = 6371;

function normalizeName(value) {
  return String(value || '').trim();
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

async function validateDeliveryLocation({ district, area, latitude, longitude }, prismaClient = prisma) {
  const normalizedDistrict = normalizeName(district);
  const normalizedArea = normalizeName(area);

  if (!normalizedDistrict || !normalizedArea) {
    return {
      isValid: false,
      code: 'MISSING_LOCATION',
      message: 'District and area are required for delivery.',
    };
  }

  const zone = await prismaClient.deliveryZone.findFirst({
    where: {
      district: { equals: normalizedDistrict, mode: 'insensitive' },
      area: { equals: normalizedArea, mode: 'insensitive' },
      isActive: true,
    },
  });

  if (!zone) {
    return {
      isValid: false,
      code: 'UNSUPPORTED_AREA',
      message: 'Sorry, we currently do not deliver to your selected area.',
    };
  }

  const hasGps = Number.isFinite(latitude) && Number.isFinite(longitude);
  const hasZoneRadius = Number.isFinite(zone.radiusKm) && zone.radiusKm > 0;
  const hasZoneCenter = Number.isFinite(zone.latitude) && Number.isFinite(zone.longitude);

  if (hasGps && hasZoneRadius && hasZoneCenter) {
    const distanceKm = haversineDistanceKm(latitude, longitude, zone.latitude, zone.longitude);
    if (distanceKm > zone.radiusKm) {
      return {
        isValid: false,
        code: 'OUTSIDE_COVERAGE_RADIUS',
        message: 'Your location is outside our delivery coverage. Please choose a supported area.',
        distanceKm,
        allowedRadiusKm: zone.radiusKm,
      };
    }

    return {
      isValid: true,
      zone,
      distanceKm,
    };
  }

  return {
    isValid: true,
    zone,
  };
}

module.exports = {
  validateDeliveryLocation,
  haversineDistanceKm,
};
