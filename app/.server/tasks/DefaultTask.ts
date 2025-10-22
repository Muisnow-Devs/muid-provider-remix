import { Job } from "bullmq";
import QueueTask from "./QueueTask";
import { logger } from "../logger";
import { ProcessData } from "./ProcessData";

export class DefaultTask implements QueueTask {
    async process(job: Job<ProcessData>) {
        logger.warn("DefaultTask executed - no operation defined", { jobId: job.id, data: job.data });
    }
}