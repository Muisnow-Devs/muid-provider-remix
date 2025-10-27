import logger from "../logger";
import prisma from "../prisma";
import client from "../redis";
import { Adapter, AdapterPayload } from "oidc-provider";

class RedisAdapter implements Adapter {
    private client: typeof client;
    private name: string;

    constructor(name: string) {
        this.name = name;
        this.client = client;
    }

    private key(id: string): string {
        return `${this.name}:${id}`;
    }

    async upsert(
        id: string,
        payload: AdapterPayload,
        expiresIn: number
    ): Promise<void> {
        const key = this.key(id);
        const store = JSON.stringify(payload);

        if (payload.uid) {
            const uid = `Session:uid:${payload.uid}`;
            await this.client.setex(uid, expiresIn, id);
        }

        await this.client.setex(key, expiresIn, store);
    }

    async find(id: string): Promise<AdapterPayload | undefined> {
        const key = this.key(id);
        const data = await this.client.get(key);
        if (!data) return undefined;

        const payload = JSON.parse(data) as AdapterPayload;
        if (payload.accountId) {
            const data = await prisma.user.findUnique({
                where: { id: payload.accountId as string },
            });

            if (!data) {
                logger.warn(
                    `Account ${payload.accountId} not found, removing ${key}`
                );
                await this.destroy(id);
                return undefined;
            }
        }

        return payload;
    }

    async findByUserCode(
        userCode: string
    ): Promise<AdapterPayload | undefined> {
        const key = `${this.name}:userCode:${userCode}`;
        const id = await this.client.get(key);

        if (!id) return undefined;
        return this.find(id);
    }

    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
        const key = `${this.name}:uid:${uid}`;
        const id = await this.client.get(key);

        if (!id) return undefined;
        return this.find(id);
    }

    async consume(id: string): Promise<void> {
        const key = this.key(id);
        const data = await this.find(id);

        if (data) {
            const updatedData = {
                ...data,
                consumed: Math.floor(Date.now() / 1000),
            };
            const ttl = await this.client.ttl(key);
            if (ttl > 0) {
                await this.client.setex(key, ttl, JSON.stringify(updatedData));
            }
        }
    }

    async destroy(id: string): Promise<void> {
        const key = this.key(id);
        await this.client.del(key);
    }

    async revokeByGrantId(grantId: string): Promise<void> {
        const keys = await this.client.keys(`${this.name}:*`);

        for (const key of keys) {
            const data = await this.client.get(key);
            if (data) {
                const payload = JSON.parse(data);
                if (payload.grantId === grantId) {
                    await this.client.del(key);
                }
            }
        }
    }
}

export default RedisAdapter;
