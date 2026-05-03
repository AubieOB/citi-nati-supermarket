function parseBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value == null || value === '') return fallback;

  const normalized = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;

  return fallback;
}

function parseInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function normalizeString(value, fallback = '') {
  const normalized = String(value || '').trim();
  return normalized || fallback;
}

function buildBranchConfig() {
  const branchCode = normalizeString(process.env.BRANCH_CODE, 'ZOMBA').toUpperCase();
  const branchName = normalizeString(process.env.BRANCH_NAME, branchCode);
  const locationId = normalizeString(process.env.LOCATION_ID, '2');
  const syncSourceCode = normalizeString(process.env.SYNC_SOURCE_CODE, `${branchCode}_POS_01`);
  const logPrefix = normalizeString(process.env.SYNC_LOG_PREFIX, `[${branchCode} SYNC]`);

  return {
    branchCode,
    branchName,
    locationId,
    syncSourceCode,
    logPrefix,
  };
}

function buildFeatureFlags() {
  return {
    enableReportingSync: parseBoolean(process.env.ENABLE_REPORTING_SYNC, true),
    enableOnlineOrderWriteback: parseBoolean(process.env.ENABLE_ONLINE_ORDER_WRITEBACK, true),
    enableStockWriteback: parseBoolean(process.env.ENABLE_STOCK_WRITEBACK, true),
    enablePromotionSync: parseBoolean(process.env.ENABLE_PROMOTION_SYNC, true),
    enablePriceSync: parseBoolean(process.env.ENABLE_PRICE_SYNC, true),
    enableProductNameSync: parseBoolean(process.env.ENABLE_PRODUCT_NAME_SYNC, true),
    enableManualStockSync: parseBoolean(process.env.ENABLE_MANUAL_STOCK_SYNC, true),
    enableInvoiceWriteback: parseBoolean(process.env.ENABLE_INVOICE_WRITEBACK, true),
  };
}

function buildConfig() {
  const branch = buildBranchConfig();
  const features = buildFeatureFlags();
  const runtimeEnvironment = normalizeString(process.env.AGENT_ENV, normalizeString(process.env.NODE_ENV, 'development')).toLowerCase();
  const agentName = normalizeString(process.env.AGENT_NAME, `${branch.branchCode.toLowerCase()}-pos-sync-agent`);
  const agentVersion = normalizeString(process.env.AGENT_VERSION, '1.0.0');

  const backendBaseUrl = normalizeString(
    process.env.BACKEND_URL,
    normalizeString(process.env.BACKEND_BASE_URL, normalizeString(process.env.LIVE_SERVER_URL))
  );
  const backendApiToken = normalizeString(process.env.BACKEND_API_TOKEN, normalizeString(process.env.POS_SECRET));

  const sqlServer = normalizeString(process.env.POS_DB_SERVER, normalizeString(process.env.DB_SERVER));
  const sqlDatabase = normalizeString(process.env.POS_DB_NAME, normalizeString(process.env.DB_NAME || process.env.DB_DATABASE));
  const sqlUser = normalizeString(process.env.POS_DB_USER, normalizeString(process.env.DB_USER));
  const sqlPassword = normalizeString(process.env.POS_DB_PASSWORD, normalizeString(process.env.DB_PASSWORD));

  const pollingIntervalMs = parseInteger(process.env.POLL_INTERVAL_MS || process.env.POLLING_INTERVAL_MS || process.env.SYNC_INTERVAL_MS, 60000);
  const serverPort = parseInteger(process.env.PORT, 3001);
  const instanceLockPort = parseInteger(process.env.INSTANCE_LOCK_PORT, serverPort + 10000);

  const config = {
    branch,
    server: {
      port: serverPort,
      enableDirectWritebackDebug: parseBoolean(process.env.ENABLE_DIRECT_POS_WRITEBACK_DEBUG, false),
      agentApiSecret: normalizeString(process.env.POS_SECRET, backendApiToken),
      environment: runtimeEnvironment,
      agentName,
      agentVersion,
      instanceLockPort,
    },
    backend: {
      baseUrl: backendBaseUrl,
      apiToken: backendApiToken,
      commandPollTimeoutMs: parseInteger(process.env.COMMAND_POLL_TIMEOUT_MS, 15000),
      agentId: normalizeString(process.env.POS_AGENT_ID, `${branch.branchCode.toLowerCase()}-${branch.syncSourceCode.toLowerCase()}`),
      connectionTestEnabled: parseBoolean(process.env.BACKEND_CONNECTION_TEST_ENABLED, true),
      connectionTimeoutMs: parseInteger(process.env.BACKEND_CONNECTION_TIMEOUT_MS, 5000),
      healthCheckPath: normalizeString(process.env.BACKEND_HEALTHCHECK_PATH, '/api/health'),
    },
    posDb: {
      server: sqlServer,
      database: sqlDatabase,
      user: sqlUser,
      password: sqlPassword,
      locationCode: normalizeString(process.env.POS_LOCATION_CODE, 'SH').toUpperCase(),
      connectionTimeoutMs: parseInteger(process.env.POS_DB_CONNECTION_TIMEOUT_MS, 30000),
      requestTimeoutMs: parseInteger(process.env.POS_DB_REQUEST_TIMEOUT_MS, 120000),
    },
    polling: {
      reportingSyncIntervalMs: pollingIntervalMs,
      commandPollIntervalMs: parseInteger(process.env.COMMAND_POLL_INTERVAL_MS, 5000),
      emergencySalesPollIntervalMs: parseInteger(process.env.EMERGENCY_SALES_POLL_INTERVAL_MS, 7000),
    },
    features,
  };

  config.modules = {
    reportingSync: features.enableReportingSync,
    commandPolling: features.enableOnlineOrderWriteback
      || features.enableStockWriteback
      || features.enablePromotionSync
      || features.enablePriceSync
      || features.enableProductNameSync
      || features.enableInvoiceWriteback,
    emergencySalesSync: features.enableOnlineOrderWriteback && features.enableInvoiceWriteback,
    invoiceWriteback: features.enableInvoiceWriteback,
    stockWriteback: features.enableStockWriteback,
    priceSync: features.enablePriceSync,
    productNameSync: features.enableProductNameSync,
    promotionSync: features.enablePromotionSync,
    manualStockSync: features.enableManualStockSync,
  };

  config.reporting = {
  backendReportingEndpoint: normalizeString(process.env.REPORTING_BACKEND_ENDPOINT, '/api/pos-sync/reporting/invoices'),
  backendLatestProductCostEndpoint: normalizeString(process.env.REPORTING_LATEST_COST_ENDPOINT, '/api/pos-sync/reporting/latest-product-costs'),
  batchSize: parseInteger(process.env.REPORTING_BATCH_SIZE, 100),
  latestCostBatchSize: parseInteger(process.env.REPORTING_LATEST_COST_BATCH_SIZE, 500),
  pollingIntervalMs: parseInteger(process.env.REPORTING_POLLING_INTERVAL_MS, parseInteger(process.env.POLLING_INTERVAL_MS || process.env.SYNC_INTERVAL_MS, 60000)),
  latestCostSyncIntervalMs: parseInteger(process.env.REPORTING_LATEST_COST_INTERVAL_MS, 300000),
  limitToRecentDays: parseNonNegativeInteger(process.env.REPORTING_LIMIT_TO_RECENT_DAYS, 0),

  // Fast rolling sales catch-up sync
  fastCatchupEnabled: parseBoolean(process.env.REPORTING_FAST_CATCHUP_ENABLED, true),
  fastCatchupPollMs: parseInteger(process.env.REPORTING_FAST_CATCHUP_POLL_MS, 3000),
  fastCatchupIdlePollMs: parseInteger(process.env.REPORTING_FAST_CATCHUP_IDLE_POLL_MS, 5000),
  fastCatchupLookbackHours: parseInteger(process.env.REPORTING_FAST_CATCHUP_LOOKBACK_HOURS, 24),
  fastCatchupBatchSize: parseInteger(process.env.REPORTING_FAST_CATCHUP_BATCH_SIZE, 200),
};

  config.stock = {
    dailyStockMaxStalenessDays: parseInteger(process.env.DAILY_STOCK_MAX_STALENESS_DAYS, 1),
    activityFreshnessMins: parseInteger(process.env.PRODUCT_ACTIVITY_FRESHNESS_WINDOW_MINUTES, 5),
    activityMaxAbsStock: parseInteger(process.env.PRODUCT_ACTIVITY_FALLBACK_MAX_ABS_STOCK, 2000),
    expiryBatchCacheTtlMs: parseInteger(process.env.EXPIRY_BATCH_CACHE_TTL_MS, 5 * 60 * 1000),
    deltaFullSyncCycles: parseInteger(process.env.DELTA_FULL_SYNC_EVERY_CYCLES, 40),
    enableDeltaSync: parseBoolean(process.env.ENABLE_DELTA_PRODUCT_SYNC, true),
    debugStockResolution: parseBoolean(process.env.DEBUG_STOCK_RESOLUTION, false),
    persistDeltaState: parseBoolean(process.env.PERSIST_DELTA_SYNC_STATE, true),
    supplierSyncIntervalMs: parseInteger(process.env.SUPPLIER_SYNC_INTERVAL_MS, 300000),
    deltaStateDir: normalizeString(process.env.DELTA_STATE_DIR, './.sync-state'),
  };

  // Historical sales backfill configuration
  config.backfill = {
    enabled: parseBoolean(process.env.BACKFILL_SALES_ENABLED, false),
    fromDate: normalizeString(process.env.BACKFILL_SALES_FROM, null),
    toDate: normalizeString(process.env.BACKFILL_SALES_TO, null),
    batchSize: parseInteger(process.env.BACKFILL_BATCH_SIZE, 100),
    backendEndpoint: normalizeString(process.env.BACKFILL_SALES_ENDPOINT, '/api/pos-sync/sales/backfill'),
  };

  return config;
}

function getBranchTag(config) {
  return `[BRANCH:${config.branch.branchCode}|SRC:${config.branch.syncSourceCode}]`;
}

function getSyncMetadata(config, extra = {}) {
  return {
    branchCode: config.branch.branchCode,
    branchName: config.branch.branchName,
    locationId: config.branch.locationId,
    locationCode: config.posDb.locationCode,
    syncSourceCode: config.branch.syncSourceCode,
    syncedAt: new Date().toISOString(),
    ...extra,
  };
}

function validateStartupConfig(config) {
  const errors = [];
  const warnings = [];

  const requireValue = (value, message) => {
    if (!value) {
      errors.push(message);
    }
  };

  requireValue(config.branch.branchCode, 'Missing branch code (BRANCH_CODE)');
  requireValue(config.branch.branchName, 'Missing branch name (BRANCH_NAME)');
  requireValue(config.branch.locationId, 'Missing location id (LOCATION_ID)');
  requireValue(config.branch.syncSourceCode, 'Missing sync source code (SYNC_SOURCE_CODE)');

  requireValue(config.posDb.server, 'Missing POS DB server (POS_DB_SERVER or DB_SERVER)');
  requireValue(config.posDb.database, 'Missing POS DB name (POS_DB_NAME or DB_NAME/DB_DATABASE)');
  requireValue(config.posDb.user, 'Missing POS DB user (POS_DB_USER or DB_USER)');
  requireValue(config.posDb.password, 'Missing POS DB password (POS_DB_PASSWORD or DB_PASSWORD)');

  requireValue(config.server.agentApiSecret, 'Missing agent API secret (POS_SECRET)');

  if (config.modules.reportingSync || config.modules.commandPolling || config.modules.emergencySalesSync) {
    requireValue(config.backend.baseUrl, 'Missing backend URL (BACKEND_URL or BACKEND_BASE_URL/LIVE_SERVER_URL)');
    requireValue(config.backend.apiToken, 'Missing backend API token (BACKEND_API_TOKEN or POS_SECRET)');
  }

  if (!process.env.BACKEND_URL && !process.env.BACKEND_BASE_URL && process.env.LIVE_SERVER_URL) {
    warnings.push('Using legacy LIVE_SERVER_URL fallback. Prefer BACKEND_URL.');
  }

  if (!process.env.BACKEND_URL && process.env.BACKEND_BASE_URL) {
    warnings.push('Using BACKEND_BASE_URL fallback. Prefer BACKEND_URL.');
  }

  if (!process.env.BACKEND_API_TOKEN && process.env.POS_SECRET) {
    warnings.push('Using POS_SECRET as BACKEND_API_TOKEN fallback. Prefer dedicated BACKEND_API_TOKEN.');
  }

  if (!process.env.POS_DB_SERVER && process.env.DB_SERVER) {
    warnings.push('Using legacy DB_SERVER fallback. Prefer POS_DB_SERVER.');
  }

  if (!process.env.POS_DB_NAME && (process.env.DB_NAME || process.env.DB_DATABASE)) {
    warnings.push('Using legacy DB_NAME/DB_DATABASE fallback. Prefer POS_DB_NAME.');
  }

  if (!process.env.POS_DB_USER && process.env.DB_USER) {
    warnings.push('Using legacy DB_USER fallback. Prefer POS_DB_USER.');
  }

  if (!process.env.POS_DB_PASSWORD && process.env.DB_PASSWORD) {
    warnings.push('Using legacy DB_PASSWORD fallback. Prefer POS_DB_PASSWORD.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function buildStartupSummary(config) {
  return {
    developer: 'Aubrey Mkhulana',
    agentName: config.server.agentName,
    agentVersion: config.server.agentVersion,
    environment: config.server.environment,
    backendUrl: config.backend.baseUrl || 'NOT_CONFIGURED',
    pollIntervalMs: config.polling.reportingSyncIntervalMs,
    commandPollIntervalMs: config.polling.commandPollIntervalMs,
    emergencySalesPollIntervalMs: config.polling.emergencySalesPollIntervalMs,
    branchCode: config.branch.branchCode,
    branchName: config.branch.branchName,
    locationCode: config.posDb.locationCode,
    syncSourceCode: config.branch.syncSourceCode,
    listenPort: config.server.port,
    instanceLockPort: config.server.instanceLockPort,
  };
}

module.exports = {
  buildConfig,
  getBranchTag,
  getSyncMetadata,
  validateStartupConfig,
  buildStartupSummary,
  parseBoolean,
};
