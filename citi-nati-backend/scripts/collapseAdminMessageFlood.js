const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function toSafeDate(value) {
  const parsed = value ? new Date(value) : null;
  if (!parsed || Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

async function main() {
  const applyChanges = process.argv.includes('--apply');
  console.log(`[ADMIN_MSG_CLEANUP] Mode: ${applyChanges ? 'APPLY' : 'DRY-RUN'}`);

  // Limit cleanup to noisy system message types only.
  const candidates = await prisma.adminMessage.findMany({
    where: {
      type: 'system',
      OR: [
        { title: { contains: 'Low Stock', mode: 'insensitive' } },
        { title: { contains: 'Out of Stock', mode: 'insensitive' } },
        { title: { contains: 'Connection', mode: 'insensitive' } },
        { title: { contains: 'Token', mode: 'insensitive' } },
      ],
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  if (!candidates.length) {
    console.log('[ADMIN_MSG_CLEANUP] No candidate rows found.');
    return;
  }

  const grouped = new Map();
  for (const row of candidates) {
    const key = [row.type, row.title, row.message].join('|').toLowerCase();
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }

  let groupsCollapsed = 0;
  let rowsDeleted = 0;

  for (const rows of grouped.values()) {
    if (rows.length <= 1) continue;

    groupsCollapsed += 1;
    const canonical = rows[0];
    const duplicates = rows.slice(1);

    const firstSeenAt = rows
      .map((r) => toSafeDate(r.firstSeenAt) || toSafeDate(r.createdAt))
      .filter(Boolean)
      .sort((a, b) => a.getTime() - b.getTime())[0] || new Date();

    const lastSeenAt = rows
      .map((r) => toSafeDate(r.lastSeenAt) || toSafeDate(r.updatedAt) || toSafeDate(r.createdAt))
      .filter(Boolean)
      .sort((a, b) => b.getTime() - a.getTime())[0] || new Date();

    const occurrenceCount = rows.reduce((sum, r) => sum + Math.max(1, Number(r.occurrenceCount || 1)), 0);

    console.log(`[ADMIN_MSG_CLEANUP] Collapse group: canonical=${canonical.id}, duplicates=${duplicates.length}, totalOccurrence=${occurrenceCount}`);

    if (!applyChanges) continue;

    await prisma.adminMessage.update({
      where: { id: canonical.id },
      data: {
        dedupeKey: canonical.dedupeKey || [canonical.type, canonical.title, canonical.message].join('|').toLowerCase(),
        occurrenceCount,
        firstSeenAt,
        lastSeenAt,
        lifecycleState: canonical.lifecycleState || 'active',
      },
    });

    const idsToDelete = duplicates.map((r) => r.id);
    if (idsToDelete.length) {
      const deleted = await prisma.adminMessage.deleteMany({
        where: { id: { in: idsToDelete } },
      });
      rowsDeleted += deleted.count;
    }
  }

  console.log(`[ADMIN_MSG_CLEANUP] Groups collapsed: ${groupsCollapsed}`);
  console.log(`[ADMIN_MSG_CLEANUP] Duplicate rows deleted: ${rowsDeleted}`);
  console.log('[ADMIN_MSG_CLEANUP] Done.');
}

main()
  .catch((error) => {
    console.error('[ADMIN_MSG_CLEANUP] Failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
