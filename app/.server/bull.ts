import { JobsOptions, Queue, Worker } from "bullmq";
import logger from "./logger";
import { ProcessData, ProcessType } from "./tasks/ProcessData";
import QueueTask from "./tasks/QueueTask";
import { SendMailTask } from "./tasks/SendMailTask";
import client from "./redis";

const queue = new Queue<ProcessData>("default", {
    connection: client,
    prefix: process.env.REDIS_PREFIX || "bull",
});

const CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY) || 5;
const JOBS: Partial<Record<ProcessType, QueueTask>> = {
    [ProcessType.EmailSender]: new SendMailTask(),
};

const worker = new Worker<ProcessData>(
    "default",
    async (job) => {
        const handler = JOBS[job.data.type];
        if (!handler) {
            logger.warn("No handler registered for job type", { type: job.data.type, jobId: job.id });
            return;
        }

        await handler.process(job);
    },
    {
        connection: client,
        concurrency: CONCURRENCY,
        prefix: process.env.REDIS_PREFIX || "bull",
    }
);

worker.on("error", (error) => {
    logger.error(`Queue error: ${error.message}`, { stack: error.stack });
});

worker.on("completed", (job) => {
    logger.info(`Job ${job.id} completed successfully`);
});

worker.on("failed", (job, error) => {
    logger.error(`Job ${job?.id} failed: ${error.message}`, { stack: error.stack });
});

export function enqueue(data: ProcessData, opts?: JobsOptions) {
    return queue.add("default", data, opts);
}

export default queue;