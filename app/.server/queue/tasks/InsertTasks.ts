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
        let clients: { id: string; webhook: string }[] = [];
        switch (type) {
            case "user.deleted":
                const deletedPayload = payload as AppEventMap["user.deleted"];
                clients = (
                    await prisma.oauthApplication.findMany({
                        where: {
                            clientId: { in: deletedPayload.clients },
                            webhook: { not: null },
                        },
                        select: { id: true, webhook: true },
                    })
                ).filter((r) => r.webhook !== null) as {
                    id: string;
                    webhook: string;
                }[];

                deletedPayload.clients = [];
                break;

            case "uesr.updated":
                const clientIds = await prisma.oauthConsent.findMany({
                    where: { userId: payload.userId },
                    select: { clientId: true },
                });

                clients = (
                    await prisma.oauthApplication.findMany({
                        where: {
                            id: { in: clientIds.map((c) => c.clientId) },
                            webhook: { not: null },
                        },
                        select: { id: true, webhook: true },
                    })
                ).filter((r) => r.webhook !== null) as {
                    id: string;
                    webhook: string;
                }[];

                break;

            case "user.revoked":
                const revokedPayload = payload as AppEventMap["user.revoked"];
                const client = await prisma.oauthApplication.findUnique({
                    where: {
                        clientId: revokedPayload.clientId,
                        webhook: { not: null },
                    },
                    select: { id: true, webhook: true },
                });
                clients = client
                    ? [client as { id: string; webhook: string }]
                    : [];
                break;
        }

        for (const client of clients) {
            await enqueue({
                type,
                payload: {
                    ...payload,
                    sending: {
                        url: client.webhook,
                        clientId: client.id,
                    },
                },
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
}
