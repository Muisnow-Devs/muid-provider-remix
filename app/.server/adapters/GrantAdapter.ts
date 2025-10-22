import { Adapter, AdapterPayload } from "oidc-provider";
import prisma from "../prisma";
import { logger } from "../logger";

/**
 * Grant Adapter for OIDC Provider using Prisma OauthConsent model
 * Maps OIDC Grant to the existing OauthConsent table in schema.prisma
 */
class GrantAdapter implements Adapter {
    private name: string;

    constructor(name: string) {
        this.name = name;
    }

    /**
     * Upsert (create or update) a Grant instance
     */
    async upsert(id: string, payload: AdapterPayload, _expiresIn: number): Promise<void> {
        const grantData = {
            id,
            clientId: payload.clientId as string || null,
            userId: payload.accountId as string || null,
            scopes: this.extractScopes(payload),
            consentGiven: true, // If we're storing it, consent was given
            createdAt: new Date(),
            updatedAt: new Date(),
        };

        await prisma.oauthConsent.upsert({
            where: { id },
            create: grantData,
            update: {
                ...grantData,
                updatedAt: new Date(),
            },
        });
    }

    /**
     * Extract scopes from OIDC payload
     */
    private extractScopes(payload: AdapterPayload): string {
        const scopes: string[] = [];

        // Extract from openid.scope
        if (payload.openid && typeof payload.openid === 'object' && 'scope' in payload.openid) {
            const openidScope = (payload.openid as Record<string, unknown>).scope;
            if (typeof openidScope === 'string') {
                scopes.push(openidScope);
            }
        }

        // Extract from resources
        if (payload.resources && typeof payload.resources === 'object') {
            Object.values(payload.resources).forEach(scope => {
                if (typeof scope === 'string') {
                    scopes.push(scope);
                }
            });
        }

        return scopes.join(' ');
    }

    /**
     * Parse scopes string back to OIDC format
     */
    private parseScopes(scopesString: string | null): Record<string, unknown> {
        if (!scopesString) {
            return {};
        }

        const scopes = scopesString.split(' ');
        const openidScopes = scopes.filter(s =>
            ['openid', 'profile', 'email', 'address', 'phone', 'offline_access'].includes(s)
        );

        return {
            openid: {
                scope: openidScopes.join(' '),
            },
        };
    }

    /**
     * Find a Grant instance by id
     */
    async find(id: string): Promise<AdapterPayload | undefined> {
        const grant = await prisma.oauthConsent.findUnique({
            where: { id },
        });

        if (!grant || !grant.consentGiven) {
            return undefined;
        }

        const payload: AdapterPayload = {
            accountId: grant.userId || undefined,
            clientId: grant.clientId || undefined,
            ...this.parseScopes(grant.scopes),
        };

        return payload;
    }

    /**
     * Find Grant by user code (not applicable for Grant)
     */
    async findByUserCode(_userCode: string): Promise<AdapterPayload | undefined> {
        logger.warn(`[GrantAdapter] findByUserCode called but not applicable for Grant`);
        return undefined;
    }

    /**
     * Find Grant by uid (not applicable for Grant)
     */
    async findByUid(_uid: string): Promise<AdapterPayload | undefined> {
        logger.warn(`[GrantAdapter] findByUid called but not applicable for Grant`);
        return undefined;
    }

    /**
     * Mark a Grant as consumed (revoke consent)
     */
    async consume(id: string): Promise<void> {
        await prisma.oauthConsent.update({
            where: { id },
            data: {
                consentGiven: false,
                updatedAt: new Date(),
            },
        });
    }

    /**
     * Destroy/delete a Grant instance
     */
    async destroy(id: string): Promise<void> {
        await prisma.oauthConsent.delete({
            where: { id },
        }).catch(() => { /* Ignore if not found */ });
    }

    /**
     * Revoke all grants associated with a grantId
     * In this case, we'll search by the id itself or clientId+userId combination
     */
    async revokeByGrantId(grantId: string): Promise<void> {
        await prisma.oauthConsent.deleteMany({
            where: { id: grantId },
        });
    }
}

export default GrantAdapter;
