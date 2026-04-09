'use strict';

function roundMoney(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(2));
}

function getVatRatePercent() {
  const raw = process.env.POS_VAT_RATE ?? process.env.VAT_RATE ?? '16.5';
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return parsed;
}

function calculateVatAmount(netAmount) {
  const net = roundMoney(netAmount);
  const ratePercent = getVatRatePercent();
  return roundMoney((net * ratePercent) / 100);
}

function calculateTotalsWithVat(netAmount) {
  const net = roundMoney(netAmount);
  const vatAmount = calculateVatAmount(net);
  const gross = roundMoney(net + vatAmount);

  return {
    net,
    vatAmount,
    gross,
    vatRatePercent: getVatRatePercent(),
  };
}

function splitInclusiveVat(totalAmount) {
  const gross = roundMoney(totalAmount);
  const ratePercent = getVatRatePercent();

  if (ratePercent <= 0) {
    return {
      net: gross,
      vatAmount: 0,
      gross,
      vatRatePercent: ratePercent,
    };
  }

  const net = roundMoney((gross * 100) / (100 + ratePercent));
  const vatAmount = roundMoney(gross - net);

  return {
    net,
    vatAmount,
    gross,
    vatRatePercent: ratePercent,
  };
}

module.exports = {
  roundMoney,
  getVatRatePercent,
  calculateVatAmount,
  calculateTotalsWithVat,
  splitInclusiveVat,
};
