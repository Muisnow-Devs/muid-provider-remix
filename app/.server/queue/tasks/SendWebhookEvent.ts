import { Job } from "bullmq";
import QueueTask from "./QueueTask";
import { AppQueueEvent } from "./ProcessData";
import { calculateWebhookSignature } from "@/.server/security";
import logger from "@/.server/logger";

export class SendWebhookEvent extends QueueTask {
    override async process(
        job: Job<
            AppQueueEvent<"webhook.sent">
        >
    ): Promise<void> {
        super.process(job);

        const data = JSON.stringify({
            type: job.data.payload.type,
            userId: job.data.payload.userId,
            clientId: job.data.payload.clientId,
            payload: job.data.payload.payload,
            timestamp: job.data.timestamp,
        });
        const signature = await calculateWebhookSignature(data);

        logger.debug("Sending webhook event", {
            jobId: job.id,
            url: job.data.payload.url,
            signature: signature.signature,
        });

        await fetch(job.data.payload.url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Signature": signature.signature,
                "X-Signature-Key": signature.kid,
            },
            body: data,
        });
    }
}
