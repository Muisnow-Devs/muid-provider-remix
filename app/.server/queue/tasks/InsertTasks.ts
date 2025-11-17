import { Job } from "bullmq";
import { AppEventMap, AppQueueEvent } from "./ProcessData";
import QueueTask from "./QueueTask";
import prisma from "@/.server/prisma";
import { enqueue } from "../webhook";
import { OIDC_CLAIMS } from "@/.server/oidc";
import { ClientDetails, findClient } from "@/.server/cache/clients";

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

    private async fetchClients(userId: string, clients?: string[]) {
        const formatedClients: Record<string, string[]> = {};

        let fetchedClients = [
            ...(clients?.map((c) => ({ clientId: c, scopes: "" })) || []),
        ];
        if (!clients || clients.length === 0) {
            fetchedClients = await prisma.oauthConsent.findMany({
                where: { userId },
                select: { clientId: true, scopes: true },
            });
        }

        for (const c of fetchedClients) {
            formatedClients[c.clientId] = c.scopes.split(" ");
        }

        const clientsIds = Object.keys(formatedClients);
        const foundClients = (
            await Promise.all(clientsIds.map((id) => findClient(id)))
        )
            .filter((app): app is ClientDetails => app !== null)
            .map((app) => ({
                clientId: app.clientId,
                webhook: app.webhook,
                scopes: formatedClients[app.clientId],
            }));

        return foundClients.filter((r) => r.webhook !== null) as {
            clientId: string;
            webhook: string;
            scopes: string[];
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
                clientId: client.clientId,
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

    private async doUpdate(payload: AppEventMap["user.updated"]) {
        const clients = await this.fetchClients(payload.userId);
        for (const client of clients) {
            const allowedClaims = client.scopes.flatMap(
                (scope) => OIDC_CLAIMS[scope as keyof typeof OIDC_CLAIMS] || []
            );
            const changes = Object.fromEntries(
                Object.entries(payload.changes).filter(([key]) =>
                    allowedClaims.includes(key)
                )
            );

            if (Object.keys(changes).length === 0) {
                continue;
            }

            await this.placeQueue({
                userId: payload.userId,
                clientId: client.clientId,
                type: "uesr.updated",
                url: client.webhook,
                payload: changes,
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
