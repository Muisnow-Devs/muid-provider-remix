import { Job } from "bullmq";
import QueueTask from "./QueueTask";
import { AppQueueEvent } from "./ProcessData";
import { calculateWebhookSignature } from "@/.server/security";

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

        console.log("Sending webhook to", job.data.payload.url);

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
