const fs = require('fs');
const path = require('path');

class ReportingSyncState {
  constructor(branchCode, stateDir = './sync-state') {
    this.branchCode = branchCode;
    this.stateDir = stateDir;
    this.stateFile = path.join(stateDir, `reporting-${branchCode.toLowerCase()}.json`);
    this.state = this.loadState();
  }

  loadState() {
    try {
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true });
      }

      if (fs.existsSync(this.stateFile)) {
        const content = fs.readFileSync(this.stateFile, 'utf-8');
        const parsed = JSON.parse(content);
        return parsed;
      }
    } catch (error) {
      console.warn(`[REPORTING STATE] Failed to load state file: ${error.message}`);
    }

    // Default state
    return {
      branchCode: this.branchCode,
      lastSyncedInvoiceNo: 0,
      lastSyncedGrnDate: null,
      lastSyncedAt: null,
      lastSuccessfulSyncAt: null,
      totalInvoicesSynced: 0,
      totalGrnsSynced: 0,
      createdAt: new Date().toISOString(),
    };
  }

  saveState() {
    try {
      if (!fs.existsSync(this.stateDir)) {
        fs.mkdirSync(this.stateDir, { recursive: true });
      }

      fs.writeFileSync(this.stateFile, JSON.stringify(this.state, null, 2), 'utf-8');
      return true;
    } catch (error) {
      console.error(`[REPORTING STATE] Failed to save state file: ${error.message}`);
      return false;
    }
  }

  getLastSyncedInvoiceNo() {
    return this.state.lastSyncedInvoiceNo || 0;
  }

  updateCheckpoint(lastSyncedInvoiceNo, invoiceCount = 0) {
    this.state.lastSyncedInvoiceNo = lastSyncedInvoiceNo;
    this.state.lastSyncedAt = new Date().toISOString();
    this.state.lastSuccessfulSyncAt = new Date().toISOString();
    this.state.totalInvoicesSynced += invoiceCount;
    return this.saveState();
  }

  getLastSyncedGrnDate() {
    return this.state.lastSyncedGrnDate ? new Date(this.state.lastSyncedGrnDate) : null;
  }

  updateGrnCheckpoint(lastSyncedGrnDate, grnCount = 0) {
    this.state.lastSyncedGrnDate = lastSyncedGrnDate ? new Date(lastSyncedGrnDate).toISOString() : this.state.lastSyncedGrnDate;
    this.state.lastSyncedAt = new Date().toISOString();
    this.state.lastSuccessfulSyncAt = new Date().toISOString();
    this.state.totalGrnsSynced += grnCount;
    return this.saveState();
  }

  getState() {
    return JSON.parse(JSON.stringify(this.state));
  }

  reset() {
    this.state = {
      branchCode: this.branchCode,
      lastSyncedInvoiceNo: 0,
      lastSyncedAt: null,
      lastSuccessfulSyncAt: null,
      totalInvoicesSynced: 0,
      createdAt: new Date().toISOString(),
    };
    return this.saveState();
  }
}

module.exports = ReportingSyncState;
