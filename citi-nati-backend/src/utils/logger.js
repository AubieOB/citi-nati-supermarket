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

function write(method, message, meta, options = {}) {
  if (options.skipInProduction && isProduction) {
    return;
  }

  const suffix = formatMeta(meta);
  if (suffix) {
    console[method](`${message} ${suffix}`);
    return;
  }

  console[method](message);
}

module.exports = {
  info(message, meta, options) {
    write('log', message, meta, options);
  },
  warn(message, meta, options) {
    write('warn', message, meta, options);
  },
  error(message, meta, options) {
    write('error', message, meta, options);
  },
  debug(message, meta) {
    write('log', message, meta, { skipInProduction: true });
  },
  isProduction,
};