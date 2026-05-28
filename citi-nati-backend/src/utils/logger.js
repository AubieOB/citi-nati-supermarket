const isProduction = process.env.NODE_ENV === 'production';

function formatMeta(meta) {
  if (meta === undefined || meta === null) return '';

  if (meta instanceof Error) {
    return meta.stack || meta.message;
  }

  if (typeof meta === 'string') {
    return meta;
  }

  try {
    return JSON.stringify(meta);
  } catch (error) {
    return String(meta);
  }
}

function output(method, args) {
  if (args.length === 0) {
    return;
  }

  const [first, ...rest] = args;
  if (rest.length === 0) {
    console[method](first);
    return;
  }

  console[method](first, ...rest);
}

function debugLog(...args) {
  if (!isProduction) {
    output('log', args);
  }
}

function infoLog(message, meta, options = {}) {
  if (isProduction && !options.allowInProduction) {
    return;
  }
  if (meta !== undefined) {
    output('log', [message, meta]);
    return;
  }
  output('log', [message]);
}

function warnLog(message, meta, options = {}) {
  if (isProduction && !options.allowInProduction) {
    return;
  }
  if (meta !== undefined) {
    output('warn', [message, meta]);
    return;
  }
  output('warn', [message]);
}

function errorLog(...args) {
  output('error', args);
}

function productionSummaryLog(...args) {
  output('log', args);
}

module.exports = {
  isProduction,
  debugLog,
  infoLog,
  warnLog,
  errorLog,
  productionSummaryLog,
};