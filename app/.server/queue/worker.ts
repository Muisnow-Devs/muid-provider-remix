import { Worker } from "bullmq";
import logger from "../logger";
import client from "../redis";
import { DefaultTask } from "./tasks/DefaultTask";
import { AppEventMap, AppQueueEvent, QueueNames } from "./tasks/ProcessData";
import QueueTask from "./tasks/QueueTask";
import { SendMailTask } from "./tasks/SendMailTask";
import { InsertTasks } from "./tasks/InsertTasks";
import { SendWebhookEvent } from "./tasks/SendWebhookEvent";
import config from "./config";

const CONCURRENCY = Number(process.env.QUEUE_CONCURRENCY) || 5;

function generateWorkers(
    key: string,
    jobs: Partial<Record<keyof AppEventMap, QueueTask>>
) {
    return new Worker<AppQueueEvent>(
        key,
        async (job) => {
            const handler = jobs[job.data.type];
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
            ...config,
            concurrency: CONCURRENCY,
            limiter: {
                max: 1000,
                duration: 60000,
            },
        }
    );
}

const workers = [
    generateWorkers(QueueNames.DEFAULT, {
        "email.sent": new SendMailTask(),
        "uesr.updated": new InsertTasks(),
        "user.deleted": new InsertTasks(),
        "user.revoked": new InsertTasks(),
        unknown: new DefaultTask(),
    }),
    generateWorkers(QueueNames.CLIENT_EVENTS, {
        "webhook.sent": new SendWebhookEvent(),
        unknown: new DefaultTask(),
    }),
];

for (const worker of workers) {
    logger.info(
        `Worker started for queue: ${worker.name} with id ${worker.id}`
    );
    
    worker.on("error", (error) => {
        logger.error(
            `[queue:${worker.name}#${worker.id}] Queue error: ${error.message}`,
            { stack: error.stack }
        );
    });

    worker.on("completed", (job) => {
        logger.info(
            `[queue:${worker.name}#${worker.id}] Job ${job.id} completed successfully`
        );
    });

    worker.on("failed", (job, error) => {
        logger.error(
            `[queue:${worker.name}#${worker.id}] Job ${job?.data.type} (#${job?.id}) failed: ${error.message}`,
            { stack: error.stack }
        );
    });
}
