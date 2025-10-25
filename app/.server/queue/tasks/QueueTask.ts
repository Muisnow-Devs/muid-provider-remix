import { Job } from "bullmq";
import { AppQueueEvent, AppEventMap } from "./ProcessData";
import { TaskNotMatch } from "@/errors/tasks";

export default abstract class QueueTask<
    T extends keyof AppEventMap = keyof AppEventMap,
> {
    process(job: Job<AppQueueEvent<T>>): Promise<void> | void {
        if (job.data.type !== (job.data.type as T)) {
            throw new TaskNotMatch(job.data.type as T, job.data.type);
        }
    }
}
