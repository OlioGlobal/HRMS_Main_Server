/**
 * Generic cron job runner with error handling and file logging.
 * Logs to both console and logs/cron.log (daily rotation by date).
 */

const fs = require('fs');
const path = require('path');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');

// Ensure logs/ directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const timestamp = () => new Date().toISOString();

const getLogFile = () => {
  const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  return path.join(LOGS_DIR, `cron-${date}.log`);
};

const log = (level, message) => {
  const line = `[${timestamp()}][${level}] ${message}\n`;

  // Console
  if (level === 'ERROR') {
    process.stderr.write(line);
  } else {
    process.stdout.write(line);
  }

  // File
  try {
    fs.appendFileSync(getLogFile(), line);
  } catch {
    // Silently ignore file write errors — don't crash the server
  }
};

const runJob = async (name, fn) => {
  const start = Date.now();
  try {
    log('INFO', `${name} — started`);
    const result = await fn();
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    log('INFO', `${name} — completed in ${duration}s | ${result ?? ''}`);
  } catch (err) {
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    log('ERROR', `${name} — FAILED after ${duration}s: ${err.message}`);
  }
};

module.exports = { runJob, log };
