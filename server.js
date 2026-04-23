require('dotenv').config();

const validateEnv                    = require('./src/config/env');
const connectDB                      = require('./src/config/db');
const app                            = require('./src/app');
const { runPermissionsSeeder }       = require('./src/seeders/permissions.seeder');
const { seedDefaultRoles }           = require('./src/seeders/defaultRoles.seeder');
const Company                        = require('./src/models/Company');
const { registerNotificationJobs }  = require('./src/services/ruleEngine/registerJobs');
const { seedDefaultHiringPipeline } = require('./src/seeders/hiringPipeline.seeder');
const { seedDefaultLetterTemplates } = require('./src/seeders/letterTemplates.seeder');

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  validateEnv();
  await connectDB();

  // Seed system-wide permissions (idempotent — safe on every startup)
  await runPermissionsSeeder();

  // Sync default role-permissions for all existing companies
  // (picks up any newly added permissions since last startup)
  const companies = await Company.find({}, '_id').lean();
  for (const c of companies) {
    await seedDefaultRoles(c._id);
    await seedDefaultLetterTemplates(c._id);
    await seedDefaultHiringPipeline(c._id);
  }
  if (companies.length) {
    console.log(`[Seeder] Synced default role-permissions for ${companies.length} company(ies).`);
  }

  // Register all BullMQ jobs (notifications + auto-absent + document-expiry + event listeners)
  await registerNotificationJobs();
  require('./src/services/ruleEngine/eventListeners');

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
