import { Adapter, AdapterPayload } from "oidc-provider";
import prisma from "../prisma";
import {
    ignoreRecordNotFound,
    isExpired,
    toAdapterPayload,
} from "./shared";

/**
 * Database Adapter for OIDC Provider using Prisma
 * Stores all OIDC models in PostgreSQL for long-term persistence
 */
class DatabaseAdapter implements Adapter {
    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    /**
     * Generate unique key for this model instance
     */
    private key(id: string): string {
        return `${this.name}:${id}`;
    }

    /**
     * Extract special fields from payload for indexing
     */
    private extractIndexFields(payload: AdapterPayload) {
        const result: {
            grantId?: string;
            userCode?: string;
            uid?: string;
        } = {};

        if ("grantId" in payload && payload.grantId) {
            result.grantId = payload.grantId as string;
        }

        if ("userCode" in payload && payload.userCode) {
            result.userCode = payload.userCode as string;
        }

        if ("uid" in payload && payload.uid) {
            result.uid = payload.uid as string;
        }

        return result;
    }

    /**
     * Upsert (create or update) a model instance
     */
    async upsert(id: string, payload: AdapterPayload, expiresIn: number): Promise<void> {
        const key = this.key(id);
        const expiresAt = new Date(Date.now() + expiresIn * 1000);
        const indexFields = this.extractIndexFields(payload);

        await prisma.oidcModel.upsert({
            where: { id: key },
            create: {
                id: key,
                type: this.name,
                payload: JSON.stringify(payload),
                expiresAt,
                ...indexFields,
            },
            update: {
                payload: JSON.stringify(payload),
                expiresAt,
                ...indexFields,
                consumedAt: null, // Reset consumed status on update
            },
        });
    }

    /**
     * Find a model instance by id
     */
    async find(id: string): Promise<AdapterPayload | undefined> {
        const key = this.key(id);
        
        const model = await prisma.oidcModel.findUnique({
            where: { id: key },
        });

        if (!model) return undefined;

        // Check if expired
        if (isExpired(model.expiresAt)) {
            // Expired, clean up and return undefined
            await this.destroy(id);
            return undefined;
        }

        return toAdapterPayload(model);
    }

    /**
     * Find DeviceCode by user code
     */
    async findByUserCode(userCode: string): Promise<AdapterPayload | undefined> {
        const model = await prisma.oidcModel.findFirst({
            where: {
                type: this.name,
                userCode,
                expiresAt: {
                    gt: new Date(),
                },
            },
        });

        if (!model) return undefined;

        return toAdapterPayload(model);
    }

    /**
     * Find Session by uid
     */
    async findByUid(uid: string): Promise<AdapterPayload | undefined> {
        const model = await prisma.oidcModel.findFirst({
            where: {
                type: this.name,
                uid,
                expiresAt: {
                    gt: new Date(),
                },
            },
        });

        if (!model) return undefined;

        return toAdapterPayload(model);
    }

    /**
     * Mark a model as consumed
     */
    async consume(id: string): Promise<void> {
        const key = this.key(id);
        
        await prisma.oidcModel.update({
            where: { id: key },
            data: {
                consumedAt: new Date(),
            },
        });
    }

    /**
     * Destroy/delete a model instance
     */
    async destroy(id: string): Promise<void> {
        const key = this.key(id);
        
        await prisma.oidcModel.delete({
            where: { id: key },
        }).catch(ignoreRecordNotFound("DatabaseAdapter.destroy"));
    }

    /**
     * Revoke all tokens associated with a grantId
     */
    async revokeByGrantId(grantId: string): Promise<void> {
        await prisma.oidcModel.deleteMany({
            where: {
                type: this.name,
                grantId,
            },
        });
    }
}

export default DatabaseAdapter;
