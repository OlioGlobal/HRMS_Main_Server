const { Queue, Worker } = require("bullmq");
const IORedis = require("ioredis");
const logger  = require("./logger");

const connection = new IORedis(
  process.env.REDIS_URL || "redis://localhost:6379",
  {
    maxRetriesPerRequest: null,
  },
);

const notificationQueue = new Queue("notifications", { connection });

const createWorker = (processor, opts = {}) => {
  const worker = new Worker("notifications", processor, {
    connection,
    concurrency: opts.concurrency || 5,
    ...opts,
  });

  worker.on("failed", (job, err) => {
    logger.error(`[Queue] Job ${job?.name} failed`, { error: err.message });
  });

  worker.on("completed", (job) => {
    logger.debug(`[Queue] Job ${job.name} completed`);
  });

  return worker;
};

module.exports = { notificationQueue, createWorker, connection };
