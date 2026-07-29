const { Queue, Worker } = require('bullmq');
const { connection }    = require('./queue'); // reuse the shared IORedis connection
const logger            = require('./logger');

// Dedicated queue for tenant subscription expiry. Each tenant gets AT MOST one
// delayed job (jobId = `expiry:<companyId>`) that fires at the exact expiry moment.
const expiryQueue = new Queue('tenant-expiry', { connection });

const createExpiryWorker = (processor, opts = {}) => {
  const worker = new Worker('tenant-expiry', processor, {
    connection,
    concurrency: opts.concurrency || 5,
    ...opts,
  });

  worker.on('failed', (job, err) => {
    logger.error(`[Expiry] Job ${job?.name} (${job?.id}) failed`, { error: err.message });
  });

  return worker;
};

module.exports = { expiryQueue, createExpiryWorker };
