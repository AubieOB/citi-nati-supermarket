const EMERGENCY_SALES_DAY_OPEN_KEY = 'emergency_sales_day_open';
const DEFAULT_EMERGENCY_SALES_DAY_OPEN = true;
const EMERGENCY_SALES_DAY_CLOSED_MESSAGE = 'Emergency sales day is currently closed. Cashier emergency sales are locked by admin.';

async function getEmergencySalesDayOpen(prisma) {
  const setting = await prisma.siteSetting.findUnique({
    where: { key: EMERGENCY_SALES_DAY_OPEN_KEY },
    select: { value: true },
  });

  if (!setting) {
    return DEFAULT_EMERGENCY_SALES_DAY_OPEN;
  }

  return String(setting.value).trim().toLowerCase() !== 'false';
}

async function setEmergencySalesDayOpen(prisma, isOpen) {
  await prisma.siteSetting.upsert({
    where: { key: EMERGENCY_SALES_DAY_OPEN_KEY },
    update: { value: isOpen ? 'true' : 'false' },
    create: { key: EMERGENCY_SALES_DAY_OPEN_KEY, value: isOpen ? 'true' : 'false' },
  });

  return isOpen;
}

module.exports = {
  EMERGENCY_SALES_DAY_OPEN_KEY,
  DEFAULT_EMERGENCY_SALES_DAY_OPEN,
  EMERGENCY_SALES_DAY_CLOSED_MESSAGE,
  getEmergencySalesDayOpen,
  setEmergencySalesDayOpen,
};