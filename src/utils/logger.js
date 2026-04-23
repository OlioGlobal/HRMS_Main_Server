const winston = require('winston');
const path    = require('path');
const fs      = require('fs');

const LOGS_DIR = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(LOGS_DIR)) fs.mkdirSync(LOGS_DIR, { recursive: true });

const { combine, timestamp, printf, colorize, errors } = winston.format;

// ─── Custom format ────────────────────────────────────────────────────────────
const logFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  let line = `[${timestamp}] [${level.toUpperCase()}] ${stack || message}`;
  if (Object.keys(meta).length) line += ` | ${JSON.stringify(meta)}`;
  return line;
});

// ─── Logger ───────────────────────────────────────────────────────────────────
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    logFormat,
  ),
  transports: [
    // Console — coloured in dev, plain in prod
    new winston.transports.Console({
      format: combine(
        colorize({ all: process.env.NODE_ENV !== 'production' }),
        timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        errors({ stack: true }),
        logFormat,
      ),
    }),

    // Combined log — all levels info and above
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'app.log'),
      maxsize:  5 * 1024 * 1024, // 5MB
      maxFiles: 5,
      tailable: true,
    }),

    // Error-only log
    new winston.transports.File({
      filename: path.join(LOGS_DIR, 'error.log'),
      level:    'error',
      maxsize:  5 * 1024 * 1024,
      maxFiles: 5,
      tailable: true,
    }),
  ],
});

module.exports = logger;
