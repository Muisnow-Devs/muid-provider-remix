import { Job } from "bullmq";
import { AppEventMap, AppQueueEvent } from "./ProcessData";
import QueueTask from "./QueueTask";
import { EventType, sendIdentityEvent } from "@/.server/pubsub";

export class InsertTasks extends QueueTask {
    override async process(
        job: Job<
            AppQueueEvent<"user.deleted" | "user.revoked" | "user.updated">
        >
    ): Promise<void> {
        super.process(job);

        const { type, payload } = job.data;
        switch (type) {
            case "user.deleted":
                await this.doDelete(payload as AppEventMap["user.deleted"]);
                break;
            case "user.revoked":
                await this.doRevoke(payload as AppEventMap["user.revoked"]);
                break;
            case "user.updated":
                await this.doUpdate(payload as AppEventMap["user.updated"]);
                break;
        }
    }

    private async doDelete(payload: AppEventMap["user.deleted"]) {
        await sendIdentityEvent(
            EventType.ACCOUNT_STATUS_CHANGED,
            payload.userId,
            { status: "deactivated" }
        );
    }

    private async doRevoke(payload: AppEventMap["user.revoked"]) {
        await sendIdentityEvent(
            EventType.ACCESS_REVOKED,
            payload.userId,
            {},
            payload.clientId
        );
    }

    private async doUpdate(payload: AppEventMap["user.updated"]) {
        await sendIdentityEvent(
            EventType.USER_PROFILE_UPDATED,
            payload.userId,
            payload.changes
        );
    }
}
