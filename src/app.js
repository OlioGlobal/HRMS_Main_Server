const express      = require('express');
const path         = require('path');
const cors         = require('cors');
const helmet       = require('helmet');
const cookieParser = require('cookie-parser');
const morgan       = require('morgan');

const routes       = require('./routes/index');
const notFound     = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// ─── Security Headers ──────────────────────────────────────────────────────────
// crossOriginResourcePolicy relaxed so uploaded assets (logos, signatures) can be
// loaded by the frontend on a different origin.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// ─── Static uploads (logos, signatures) ─────────────────────────────────────────
app.use('/uploads', express.static(path.join(process.cwd(), 'public', 'uploads')));

// ─── CORS ─────────────────────────────────────────────────────────────────────
const allowedOrigins = process.env.CLIENT_URL
  ? process.env.CLIENT_URL.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: (origin, callback) => {
    // allow requests with no origin (mobile apps, curl, server-to-server)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Body Parsing ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// ─── Cookie Parser ─────────────────────────────────────────────────────────────
app.use(cookieParser());

// ─── Request Logger (dev only) ─────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─── Health Check ──────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'HRMS API is running',
    env:     process.env.NODE_ENV,
  });
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/api', routes);

// ─── 404 + Global Error Handler ───────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

module.exports = app;
