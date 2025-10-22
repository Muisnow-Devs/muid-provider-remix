import { Job } from "bullmq";
import { ProcessData } from "./ProcessData";

export default interface QueueTask {
    process: (
        job: Job<ProcessData>
    ) => Promise<void> | void;
}
