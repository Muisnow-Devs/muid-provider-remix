import { JobsOptions, Queue, Worker } from "bullmq";
import logger from "../logger";
import QueueTask from "./tasks/QueueTask";
import { SendMailTask } from "./tasks/SendMailTask";
import client from "../redis";
import { AppEventMap, AppQueueEvent } from "./tasks/ProcessData";
import { DefaultTask } from "./tasks/DefaultTask";

const queue = new Queue<AppQueueEvent>("default", {
    connection: client,
    prefix: process.env.REDIS_PREFIX || "bull",
});

const CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY) || 5;
const JOBS: Partial<Record<keyof AppEventMap, QueueTask>> = {
    "email.sent": new SendMailTask(),
    "uesr.updated": new DefaultTask(),
    unknown: new DefaultTask(),
};

const worker = new Worker<AppQueueEvent>(
    "default",
    async (job) => {
        const handler = JOBS[job.data.type];
        if (!handler) {
            logger.warn("No handler registered for job type", {
                type: job.data.type,
                jobId: job.id,
            });
            return;
        }

        await handler.process(job);
    },
    {
        connection: client,
        concurrency: CONCURRENCY,
        prefix: process.env.REDIS_PREFIX || "bull",
        limiter: {
            max: 1000,
            duration: 60000,
        },
    }
);

worker.on("error", (error) => {
    logger.error(`Queue error: ${error.message}`, { stack: error.stack });
});

worker.on("completed", (job) => {
    logger.info(`Job ${job.id} completed successfully`);
});

worker.on("failed", (job, error) => {
    logger.error(
        `Job ${job?.data.type} (#${job?.id}) failed: ${error.message}`,
        { stack: error.stack }
    );
});

export function enqueue<K extends keyof AppEventMap>({
    type,
    payload,
    opts,
}: {
    type: K;
    payload: AppEventMap[K];
    opts?: JobsOptions;
}) {
    const event: AppQueueEvent<K> = {
        type,
        payload,
        timestamp: Date.now(),
    };

    return queue.add("default", event, opts);
}

export default queue;
