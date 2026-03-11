require('dotenv').config();

const validateEnv                    = require('./src/config/env');
const connectDB                      = require('./src/config/db');
const app                            = require('./src/app');
const { runPermissionsSeeder }       = require('./src/seeders/permissions.seeder');
const { registerCronJobs }           = require('./src/cron');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  validateEnv();
  await connectDB();

  // Seed system-wide permissions (idempotent — safe on every startup)
  await runPermissionsSeeder();

  // Register cron jobs (auto-absent, future: leave reset, rule engine, etc.)
  registerCronJobs();

  const server = app.listen(PORT, () => {
    console.log(`🚀 Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => process.exit(0));
  });

  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err.message);
    server.close(() => process.exit(1));
  });
};

startServer();
