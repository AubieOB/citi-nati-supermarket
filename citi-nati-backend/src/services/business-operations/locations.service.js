'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const DEFAULT_LOCATIONS = [
  { id: 1, code: 'BT', name: 'Blantyre' },
  { id: 2, code: 'ZA', name: 'Zomba' },
];

function normalizeLocationCode(name, code) {
  const normalizedName = String(name || '').trim().toLowerCase();
  if (normalizedName === 'blantyre') return 'BT';
  if (normalizedName === 'zomba') return 'ZA';
  return code ? String(code).trim().toUpperCase() : null;
}

async function getBusinessLocations() {
  try {
    const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'business_locations'
    `);

    const columnSet = new Set((columns || []).map((row) => String(row.column_name || '').toLowerCase()));
    if (!columnSet.size) return DEFAULT_LOCATIONS;

    const idColumn = columnSet.has('id') ? 'id' : null;
    const codeColumn = ['location_code', 'branch_code', 'code'].find((column) => columnSet.has(column)) || null;
    const nameColumn = ['branch_name', 'location_name', 'name'].find((column) => columnSet.has(column)) || null;

    if (!nameColumn) return DEFAULT_LOCATIONS;

    const selectParts = [];
    if (idColumn) {
      selectParts.push(`"${idColumn}" as id`);
    } else {
      selectParts.push('row_number() over () as id');
    }

    if (codeColumn) {
      selectParts.push(`"${codeColumn}" as code`);
    } else {
      selectParts.push('NULL::text as code');
    }

    selectParts.push(`"${nameColumn}" as name`);

    const rows = await prisma.$queryRawUnsafe(`
      SELECT ${selectParts.join(', ')}
      FROM business_locations
      ORDER BY "${nameColumn}" ASC
    `);

    if (!Array.isArray(rows) || !rows.length) return DEFAULT_LOCATIONS;

    return rows.map((row) => ({
      id: Number(row.id),
      name: String(row.name || '').trim(),
      code: normalizeLocationCode(row.name, row.code),
    })).filter((row) => row.name);
  } catch (error) {
    console.warn('[BO][LOCATIONS] Falling back to defaults:', error.message);
    return DEFAULT_LOCATIONS;
  }
}

module.exports = {
  getBusinessLocations,
};
