import { Job } from "bullmq";
import QueueTask from "./QueueTask";
import { AppQueueEvent } from "./ProcessData";
import { calculateWebhookSignature } from "@/.server/security";

export class SendWebhookEvent extends QueueTask {
    override async process(
        job: Job<
            AppQueueEvent<"user.deleted" | "user.revoked" | "uesr.updated">
        >
    ): Promise<void> {
        super.process(job);

        if (!job.data.payload.sending) {
            return;
        }

        const data = JSON.stringify({
            type: job.data.type,
            payload: job.data.payload,
            timestamp: job.data.timestamp,
        });
        const signature = await calculateWebhookSignature(data);

        await fetch(job.data.payload.sending.url, {
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
