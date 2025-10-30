import { Job } from "bullmq";
import { AppEventMap, AppQueueEvent } from "./ProcessData";
import QueueTask from "./QueueTask";
import prisma from "@/.server/prisma";
import { enqueue } from "../webhook";

export class InsertTasks extends QueueTask {
    override async process(
        job: Job<
            AppQueueEvent<"user.deleted" | "user.revoked" | "uesr.updated">
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
            case "uesr.updated":
                await this.doUpdate(payload as AppEventMap["uesr.updated"]);
                break;
        }
    }

    private async fetchClients(userId: string, clients?: string[]) {
        if (!clients || clients.length === 0) {
            clients = await prisma.oauthConsent
                .findMany({
                    where: { userId },
                    select: { clientId: true },
                })
                .then((res) => {
                    return res.map((r) => r.clientId);
                });
        }

        const foundClients = await prisma.oauthApplication.findMany({
            where: {
                clientId: { in: clients },
                webhook: { not: null },
            },
            select: { id: true, webhook: true },
        });

        return foundClients.filter((r) => r.webhook !== null) as {
            id: string;
            webhook: string;
        }[];
    }

    private async doDelete(payload: AppEventMap["user.deleted"]) {
        const clients = await this.fetchClients(
            payload.userId,
            payload.clients
        );
        for (const client of clients) {
            await this.placeQueue({
                userId: payload.userId,
                clientId: client.id,
                type: "user.deleted",
                url: client.webhook,
                payload: {},
            });
        }
    }

    private async doRevoke(payload: AppEventMap["user.revoked"]) {
        const clients = await this.fetchClients(payload.userId, [
            payload.clientId,
        ]);

        await this.placeQueue({
            userId: payload.userId,
            clientId: payload.clientId,
            type: "user.revoked",
            url: clients[0]?.webhook || "",
            payload: {},
        });
    }

    private async doUpdate(payload: AppEventMap["uesr.updated"]) {
        const clients = await this.fetchClients(payload.userId);
        for (const client of clients) {
            await this.placeQueue({
                userId: payload.userId,
                clientId: client.id,
                type: "uesr.updated",
                url: client.webhook,
                payload: payload.changes,
            });
        }
    }

    private async placeQueue(payload: AppEventMap["webhook.sent"]) {
        await enqueue({
            type: "webhook.sent",
            payload,
            opts: {
                attempts: 5,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
            },
        });
    }
}
