/**
 * Generic cron job runner with error handling and logging.
 * Wraps each job so failures don't crash the server.
 */

const runJob = async (name, fn) => {
  const start = Date.now();
  try {
    console.log(`[Cron] ${name} — started`);
    const result = await fn();
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`[Cron] ${name} — completed in ${duration}s`, result ?? '');
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.error(`[Cron] ${name} — FAILED after ${duration}s:`, err.message);
  }
};

module.exports = { runJob };
