const PlatformUser = require('../models/PlatformUser');
const logger       = require('../utils/logger');

/**
 * Seeds the first platform Super Admin from environment variables.
 * Idempotent — skips if a user with that email already exists.
 *
 * Required env: SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD
 * Optional env: SUPER_ADMIN_NAME (default "Super Admin")
 */
const seedPlatformAdmin = async () => {
  const email    = process.env.SUPER_ADMIN_EMAIL;
  const password = process.env.SUPER_ADMIN_PASSWORD;
  const name     = process.env.SUPER_ADMIN_NAME || 'Super Admin';

  if (!email || !password) {
    logger.warn('[Seeder] SUPER_ADMIN_EMAIL / SUPER_ADMIN_PASSWORD not set — skipping platform admin seed');
    return;
  }

  const existing = await PlatformUser.findOne({ email: email.toLowerCase() });
  if (existing) return;

  await PlatformUser.create({ name, email: email.toLowerCase(), password });
  logger.info(`[Seeder] Platform Super Admin created: ${email.toLowerCase()}`);
};

module.exports = { seedPlatformAdmin };
