const logger = require('../utils/logger');

const log = (level, message) => {
  if (level === 'ERROR') logger.error(message);
  else logger.info(message);
};

const runJob = async (name, fn) => {
  const start = Date.now();
  logger.info(`[Cron] ${name} — started`);
  try {
    const result  = await fn();
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    logger.info(`[Cron] ${name} — completed in ${elapsed}s`, { result: result ?? '' });
  } catch (err) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(2);
    logger.error(`[Cron] ${name} — FAILED after ${elapsed}s`, { error: err.message, stack: err.stack });
  }
};

module.exports = { runJob, log };
