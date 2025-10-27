import { JobsOptions, Queue } from "bullmq";
import { AppEventMap, AppQueueEvent, QueueNames } from "./tasks/ProcessData";
import config from "./config";

const queue = new Queue<AppQueueEvent>(QueueNames.CLIENT_EVENTS, config);

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
