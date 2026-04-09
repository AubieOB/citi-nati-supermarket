'use strict';

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const VAT_ENABLED_KEY = 'vat_enabled';
const VAT_SETTINGS_CACHE_MS = 10000;

let cachedVatSettings = null;
let vatSettingsLoadedAt = 0;

function roundMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function getConfiguredVatRatePercent() {
  const raw = process.env.POS_VAT_RATE ?? process.env.VAT_RATE ?? '16.5';
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function getDefaultVatEnabled() {
  const raw = String(process.env.VAT_ENABLED ?? 'true').trim().toLowerCase();
  return !['false', '0', 'no', 'off'].includes(raw);
}

function clearVatSettingsCache() {
  cachedVatSettings = null;
  vatSettingsLoadedAt = 0;
}

async function getVatSettings(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedVatSettings && (now - vatSettingsLoadedAt) < VAT_SETTINGS_CACHE_MS) {
    return cachedVatSettings;
  }

  const configuredRatePercent = getConfiguredVatRatePercent();
  let enabled = getDefaultVatEnabled();

  try {
    const setting = await prisma.siteSetting.findUnique({ where: { key: VAT_ENABLED_KEY } });
    if (setting) {
      enabled = String(setting.value).trim().toLowerCase() === 'true';
    }
  } catch (error) {
    console.warn('[VAT] Failed to load VAT setting, using cached/default value:', error.message);
    if (cachedVatSettings) {
      return cachedVatSettings;
    }
  }

  cachedVatSettings = {
    enabled,
    configuredRatePercent,
    ratePercent: enabled ? configuredRatePercent : 0,
  };
  vatSettingsLoadedAt = now;
  return cachedVatSettings;
}

async function getVatRatePercent() {
  const settings = await getVatSettings();
  return settings.ratePercent;
}

function normalizeVatRatePercent(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function calculateVatAmountAtRate(netAmount, ratePercent) {
  const net = roundMoney(netAmount);
  return roundMoney((net * ratePercent) / 100);
}

async function calculateVatAmount(netAmount) {
  const ratePercent = await getVatRatePercent();
  return calculateVatAmountAtRate(netAmount, ratePercent);
}

function calculateTotalsWithVatAtRate(netAmount, ratePercent, extra = {}) {
  const net = roundMoney(netAmount);
  const vatAmount = calculateVatAmountAtRate(net, ratePercent);
  const gross = roundMoney(net + vatAmount);

  return {
    net,
    vatAmount,
    gross,
    vatRatePercent: ratePercent,
    ...extra,
  };
}

async function calculateTotalsWithVat(netAmount) {
  const settings = await getVatSettings();
  return calculateTotalsWithVatAtRate(netAmount, settings.ratePercent, {
    vatEnabled: settings.enabled,
    configuredVatRatePercent: settings.configuredRatePercent,
  });
}

function splitInclusiveVatAtRate(totalAmount, ratePercent, extra = {}) {
  const gross = roundMoney(totalAmount);

  if (ratePercent <= 0) {
    return {
      net: gross,
      vatAmount: 0,
      gross,
      vatRatePercent: ratePercent,
      ...extra,
    };
  }

  const net = roundMoney((gross * 100) / (100 + ratePercent));
  const vatAmount = roundMoney(gross - net);

  return {
    net,
    vatAmount,
    gross,
    vatRatePercent: ratePercent,
    ...extra,
  };
}

async function splitInclusiveVat(totalAmount) {
  const settings = await getVatSettings();
  return splitInclusiveVatAtRate(totalAmount, settings.ratePercent, {
    vatEnabled: settings.enabled,
    configuredVatRatePercent: settings.configuredRatePercent,
  });
}

module.exports = {
  VAT_ENABLED_KEY,
  clearVatSettingsCache,
  getVatSettings,
  getConfiguredVatRatePercent,
  roundMoney,
  normalizeVatRatePercent,
  getVatRatePercent,
  calculateVatAmount,
  calculateVatAmountAtRate,
  calculateTotalsWithVat,
  calculateTotalsWithVatAtRate,
  splitInclusiveVat,
  splitInclusiveVatAtRate,
};
