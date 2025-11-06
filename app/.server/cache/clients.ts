import prisma from "../prisma";
import client from "../redis";

export interface ClientDetails {
    clientId: string;
    redirectURLs: string[];
    type: string;
    name: string | null;
    icon: string | null;
    metadata: Record<string, unknown> | null;
    webhook: string | null;
    disabled: boolean;
}

const key = (clientId: string) => `muid:client:${clientId}`;

export async function findClient(
    clientId: string
): Promise<ClientDetails | null> {
    const clientCached = await client.get(key(clientId));
    if (clientCached) {
        if (clientCached === "") return null;
        return JSON.parse(clientCached) as ClientDetails;
    }

    const data = await prisma.oauthApplication
        .findUnique({
            where: { clientId },
            select: {
                clientId: true,
                redirectURLs: true,
                type: true,
                name: true,
                icon: true,
                metadata: true,
                webhook: true,
                disabled: true,
            },
        })
        .then((res) => {
            if (!res) return null;
            return {
                ...res,
                redirectURLs: res.redirectURLs
                    ? res.redirectURLs.split(",")
                    : [],
                metadata: res.metadata ? JSON.parse(res.metadata) : null,
                disabled: res.disabled ?? false,
            };
        });

    await client.set(
        key(clientId),
        data ? JSON.stringify(data) : "",
        "EX",
        3600
    );
    return data;
}

export async function invalidateClientCache(clientId: string) {
    await client.del(key(clientId));
}
