/**
 * Delta Sync State Persistence Module
 * Manages persistent storage of product sync state across agent restarts
 */

const fs = require('fs');
const path = require('path');

class DeltaSyncState {
  constructor(branchCode, stateDir = './.sync-state') {
    this.branchCode = branchCode;
    this.stateDir = stateDir;
    this.stateFilePath = path.join(stateDir, `delta-${branchCode.toLowerCase()}.json`);
    this.snapshot = new Map();
    this.cycleCounter = 0;
    this.savedAt = null;
  }

  /**
   * Ensure state directory exists
   */
  ensureStateDir() {
    if (!fs.existsSync(this.stateDir)) {
      fs.mkdirSync(this.stateDir, { recursive: true });
    }
  }

  /**
   * Load persisted state from file
   * @returns {void}
   */
  load() {
    try {
      this.ensureStateDir();

      if (!fs.existsSync(this.stateFilePath)) {
        return; // No prior state, start fresh
      }

      const data = JSON.parse(fs.readFileSync(this.stateFilePath, 'utf8'));
      this.snapshot = new Map(data.snapshot || []);
      this.cycleCounter = data.cycleCounter || 0;
      this.savedAt = data.savedAt || null;
    } catch (error) {
      console.error(`[DELTA SYNC STATE] Error loading state from ${this.stateFilePath}:`, error.message);
      // Continue with fresh state if load fails
      this.snapshot = new Map();
      this.cycleCounter = 0;
    }
  }

  /**
   * Save state to file
   * @param {Map} snapshot - Product signature snapshot
   * @param {number} cycleCounter - Current sync cycle counter
   * @returns {void}
   */
  save(snapshot, cycleCounter) {
    try {
      this.ensureStateDir();

      const data = {
        branchCode: this.branchCode,
        snapshot: Array.from(snapshot.entries()),
        cycleCounter,
        savedAt: new Date().toISOString(),
      };

      fs.writeFileSync(this.stateFilePath, JSON.stringify(data, null, 2));
      this.snapshot = snapshot;
      this.cycleCounter = cycleCounter;
      this.savedAt = data.savedAt;
    } catch (error) {
      console.error(`[DELTA SYNC STATE] Error saving state to ${this.stateFilePath}:`, error.message);
    }
  }

  /**
   * Get current snapshot
   * @returns {Map}
   */
  getSnapshot() {
    return this.snapshot;
  }

  /**
   * Get current cycle counter
   * @returns {number}
   */
  getCycleCounter() {
    return this.cycleCounter;
  }

  /**
   * Reset state
   * @returns {void}
   */
  reset() {
    this.snapshot = new Map();
    this.cycleCounter = 0;
    this.savedAt = null;
    try {
      if (fs.existsSync(this.stateFilePath)) {
        fs.unlinkSync(this.stateFilePath);
      }
    } catch (error) {
      console.error(`[DELTA SYNC STATE] Error resetting state:`, error.message);
    }
  }
}

module.exports = DeltaSyncState;
