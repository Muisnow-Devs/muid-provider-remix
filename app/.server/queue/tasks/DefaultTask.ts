import { Job } from "bullmq";
import QueueTask from "./QueueTask";
import { logger } from "@/.server/logger";
import { AppQueueEvent } from "./ProcessData";

export class DefaultTask implements QueueTask {
    async process(job: Job<AppQueueEvent<"unknown">>) {
        logger.warn("DefaultTask executed - no operation defined", { jobId: job.id, data: job.data });
    }
}